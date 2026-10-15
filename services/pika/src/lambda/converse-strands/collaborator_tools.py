"""Hidden collaborator-as-tool support for the Strands runtime.

A tool-mode collaborator's text never reaches the user. Its validated structured result
returns to the supervisor as an ordinary tool observation, so the supervisor owns all
visible and persisted prose.
"""

import copy
import hashlib
import json
import logging
import re
import threading
import time
from collections.abc import Callable
from decimal import Decimal
from typing import Any

from jsonschema import ValidationError
from jsonschema.validators import validator_for
from strands import Agent
from strands.tools.tools import PythonAgentTool
from intent_router import extract_first_json_object

logger = logging.getLogger(__name__)

DEFAULT_INPUT_SCHEMA = {
    'type': 'object',
    'properties': {
        'task': {
            'type': 'string',
            'description': 'The bounded task for the hidden specialist.',
        },
    },
    'required': ['task'],
    'additionalProperties': False,
}
DEFAULT_TIMEOUT_SECONDS = 120.0
TOOL_MODE = 'tool'


def _json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError(
        f'Object of type {type(value).__name__} is not JSON serializable'
    )


def _json_safe(value):
    return json.loads(json.dumps(value, default=_json_default))


def _tool_name(config: dict) -> str:
    explicit = config.get('toolName') or config.get('tool_name')
    if explicit:
        return str(explicit)
    agent_id = config.get('agentId') or config.get('agent_id') or 'specialist'
    normalized = re.sub(r'[^a-zA-Z0-9_]+', '_', str(agent_id)).strip('_')
    return f'consult_{normalized or "specialist"}'


def _extract_json(text: str) -> dict:
    candidate = text.strip()
    fenced = re.fullmatch(r'```(?:json)?\s*(.*?)\s*```', candidate, re.DOTALL)
    if fenced:
        candidate = fenced.group(1)
    parsed = extract_first_json_object(candidate)
    if parsed is None:
        raise ValueError('specialist output must be one JSON object')
    return parsed


def _error_result(tool_use_id: str, code: str) -> dict:
    return {
        'toolUseId': tool_use_id,
        'status': 'error',
        'content': [{
            'text': json.dumps({
                'error': code,
                'retryable': False,
            }, separators=(',', ':'), sort_keys=True),
        }],
    }


def _notify_failure(
        callback: Callable[[str], None] | None,
        code: str,
) -> None:
    if callback is None:
        return
    try:
        callback(code)
    except Exception:
        logger.exception(
            'Could not propagate tool-mode collaborator failure: %s',
            code,
        )


def _emit_collaborator_trace(
        callback,
        agent_id: str,
        event: str,
        metadata: dict | None = None,
) -> None:
    if callback:
        callback(agent_id, event, metadata or {})


def _specialist_prompt(base_prompt: str, instruction: str, output_schema: dict) -> str:
    contract = (
        'You are running as a hidden specialist tool. Never address the end user, '
        'emit UI tags, or return prose outside the result. Perform the bounded task '
        'using your own tools, then return exactly one JSON object matching this '
        f'output schema:\n{json.dumps(output_schema, default=_json_default, separators=(",", ":"), sort_keys=True)}'
    )
    return '\n\n'.join(part for part in [base_prompt, instruction, contract] if part)


def _specialist_input(tool_input: dict, current_user_text: str) -> str:
    return json.dumps({
        'delegatedInput': tool_input,
        'currentUserText': current_user_text,
    }, separators=(',', ':'), sort_keys=True)


def _single_success_tool(candidate):
    original = candidate._tool_func
    lock = threading.Lock()
    state = {'succeeded': False, 'in_flight': False}

    def tool_func(tool_use, **invocation_state):
        with lock:
            if state['succeeded'] or state['in_flight']:
                return {
                    'toolUseId': tool_use.get('toolUseId', ''),
                    'status': 'error',
                    'content': [{
                        'text': (
                            f'{candidate.tool_name} already ran in this '
                            'hidden invocation. Use that result and return the '
                            'structured response now.'
                        ),
                    }],
                }
            state['in_flight'] = True
        result = None
        try:
            result = original(tool_use, **invocation_state)
            return result
        finally:
            with lock:
                state['in_flight'] = False
                if result and result.get('status') == 'success':
                    state['succeeded'] = True

    return PythonAgentTool(candidate.tool_name, candidate.tool_spec, tool_func)


def _error_tool(
        name: str,
        description: str,
        input_schema: dict,
        agent_id: str,
        trace_callback: Callable[[str, str, dict], None] | None,
        failure_callback: Callable[[str], None] | None,
        code: str,
) -> PythonAgentTool:
    """Return a fail-closed collaborator placeholder without exposing internals."""
    def invalid_tool(tool_use, **_invocation_state):
        _notify_failure(failure_callback, code)
        _emit_collaborator_trace(
            trace_callback,
            agent_id,
            'FAILED',
            {'code': code},
        )
        return _error_result(tool_use.get('toolUseId', ''), code)

    return PythonAgentTool(
        name,
        {
            'name': name,
            'description': description,
            'inputSchema': {'json': input_schema},
        },
        invalid_tool,
    )


class _DeadlineState:
    """Linearize hidden-tool admission, deadline closure, and final success.

    An admitted call runs outside the lock so closure and `Agent.cancel` can't deadlock behind
    it. Python can't kill that work, so only its late result is quarantined.
    """

    def __init__(self) -> None:
        self.expired = threading.Event()
        self._lock = threading.Lock()
        self._deadline: float | None = None
        self._closed = False
        self._finished = False

    def start(self, timeout_seconds: float) -> None:
        with self._lock:
            self._deadline = time.monotonic() + timeout_seconds

    def _close_if_due(self) -> bool:
        if (
                self._deadline is None
                or self._closed
                or time.monotonic() >= self._deadline
        ):
            self._closed = True
            self.expired.set()
            return True
        return False

    def admit(self) -> bool:
        with self._lock:
            return not self._finished and not self._close_if_due()

    def accept_tool_result(self) -> bool:
        with self._lock:
            return not self._finished and not self._close_if_due()

    def close(self) -> bool:
        with self._lock:
            if self._finished:
                return False
            self._closed = True
            self.expired.set()
            return True

    def commit_success(self) -> bool:
        with self._lock:
            if self._finished or self._close_if_due():
                return False
            self._finished = True
            return True

    def guard(self, candidate: PythonAgentTool) -> PythonAgentTool:
        original = candidate._tool_func

        def timed_tool(tool_use, **invocation_state):
            if not self.admit():
                return _error_result(
                    tool_use.get('toolUseId', ''),
                    'COLLABORATOR_TIMEOUT',
                )
            result = original(tool_use, **invocation_state)
            if not self.accept_tool_result():
                return _error_result(
                    tool_use.get('toolUseId', ''),
                    'COLLABORATOR_TIMEOUT',
                )
            return result

        return PythonAgentTool(
            candidate.tool_name,
            candidate.tool_spec,
            timed_tool,
        )

    def guard_tools(
            self,
            tools: list[PythonAgentTool],
    ) -> list[PythonAgentTool]:
        return [self.guard(candidate) for candidate in tools]


def _limit_successful_tools(
        tools: list,
        single_success_tools: set[str],
) -> list:
    if not single_success_tools:
        return tools
    return [
        _single_success_tool(candidate)
        if candidate.tool_name in single_success_tools
        else candidate
        for candidate in tools
    ]


def build_tool_mode_collaborators(
        collaborators: list[dict],
        *,
        load_agent_definition: Callable[[str], dict],
        load_tool_definitions: Callable[[list[str]], list[dict]],
        build_tools: Callable[..., list],
        build_model: Callable[[str], Any],
        session_id: str,
        current_user_text: str,
        session_attributes: dict,
        prompt_session_attributes: dict,
        history_messages: list[dict],
        tool_trace_callback: Callable[..., None] | None = None,
        collaborator_trace_callback: Callable[[str, str, dict], None] | None = None,
        failure_callback: Callable[[str], None] | None = None,
        on_hidden_tool_result: Callable[..., None] | None = None,
        agent_factory: Callable[..., Any] = Agent,
) -> list[PythonAgentTool]:
    """Build internal tools for collaborators configured with ``mode: tool``."""
    tools: list[PythonAgentTool] = []
    for config in collaborators:
        if config.get('mode') != TOOL_MODE:
            continue

        agent_id = str(config.get('agentId') or config.get('agent_id') or '')
        name = _tool_name(config)
        instruction = str(config.get('instruction') or '')
        description = instruction or f'Consult hidden specialist {agent_id}.'
        input_schema = _json_safe(
            config.get('inputSchema')
            or config.get('input_schema')
            or DEFAULT_INPUT_SCHEMA
        )
        output_schema_raw = config.get('outputSchema') or config.get('output_schema')
        output_schema = (
            _json_safe(output_schema_raw)
            if isinstance(output_schema_raw, dict)
            else output_schema_raw
        )
        timeout_seconds = float(
            config.get('timeoutSeconds')
            or config.get('timeout_seconds')
            or DEFAULT_TIMEOUT_SECONDS
        )
        single_success_tools = {
            str(tool_name)
            for tool_name in (
                config.get('singleSuccessTools')
                or config.get('single_success_tools')
                or []
            )
        }

        input_validator = None
        output_validator = None
        if isinstance(input_schema, dict) and isinstance(output_schema, dict):
            try:
                input_validator_cls = validator_for(input_schema)
                input_validator_cls.check_schema(input_schema)
                input_validator = input_validator_cls(input_schema)
                output_validator_cls = validator_for(output_schema)
                output_validator_cls.check_schema(output_schema)
                output_validator = output_validator_cls(output_schema)
            except Exception:
                logger.exception(
                    'Invalid tool-mode collaborator schemas: %s',
                    name,
                )

        if not agent_id or input_validator is None or output_validator is None:
            logger.error('Invalid tool-mode collaborator configuration: %s', name)
            tools.append(_error_tool(
                name,
                description,
                input_schema if isinstance(input_schema, dict) else DEFAULT_INPUT_SCHEMA,
                agent_id,
                collaborator_trace_callback,
                failure_callback,
                'COLLABORATOR_CONFIG_INVALID',
            ))
            continue

        try:
            definition = load_agent_definition(agent_id)
            if not isinstance(definition, dict):
                raise ValueError('collaborator definition must be an object')
            model_id = definition.get('foundation_model')
            specialist_tool_ids = definition.get('tool_ids') or []
            if not isinstance(model_id, str) or not model_id:
                raise ValueError('collaborator definition has no foundation model')
            if not isinstance(specialist_tool_ids, list):
                raise ValueError('collaborator tool IDs must be a list')
        except Exception:
            logger.exception('Could not load tool-mode collaborator definition: %s', name)
            tools.append(_error_tool(
                name,
                description,
                input_schema,
                agent_id,
                collaborator_trace_callback,
                failure_callback,
                'COLLABORATOR_DEFINITION_LOAD_FAILED',
            ))
            continue

        try:
            specialist_tool_definitions = (
                load_tool_definitions(specialist_tool_ids)
                if specialist_tool_ids else []
            )
            if not isinstance(specialist_tool_definitions, list):
                raise ValueError('collaborator tool definitions must be a list')
        except Exception:
            logger.exception('Could not load tool-mode collaborator tools: %s', name)
            tools.append(_error_tool(
                name,
                description,
                input_schema,
                agent_id,
                collaborator_trace_callback,
                failure_callback,
                'COLLABORATOR_TOOL_LOAD_FAILED',
            ))
            continue

        specialist_prompt = _specialist_prompt(
            str(definition.get('base_prompt') or ''),
            instruction,
            output_schema,
        )
        relay_history = config.get('historyRelay') == 'TO_COLLABORATOR'

        _agent_id = agent_id
        _name = name
        _input_validator = input_validator
        _output_validator = output_validator
        _timeout_seconds = timeout_seconds
        _collaborator_trace_callback = collaborator_trace_callback
        _model_id = model_id
        _specialist_tool_definitions = specialist_tool_definitions
        _specialist_prompt_text = specialist_prompt
        _relay_history = relay_history
        _single_success_tools = single_success_tools
        _failure_callback = failure_callback

        def tool_func(
                tool_use,
                *,
                _agent_id=_agent_id,
                _name=_name,
                _input_validator=_input_validator,
                _output_validator=_output_validator,
                _timeout_seconds=_timeout_seconds,
                _collaborator_trace_callback=_collaborator_trace_callback,
                _model_id=_model_id,
                _specialist_tool_definitions=_specialist_tool_definitions,
                _specialist_prompt_text=_specialist_prompt_text,
                _relay_history=_relay_history,
                _single_success_tools=_single_success_tools,
                _failure_callback=_failure_callback,
                _description=description,
                **_invocation_state):
            tool_use_id = tool_use.get('toolUseId', '')
            tool_input = tool_use.get('input', {})
            failure_lock = threading.Lock()
            failure_signaled = False
            validating_output = False

            def fail_closed(code: str) -> None:
                nonlocal failure_signaled
                with failure_lock:
                    if failure_signaled:
                        return
                    failure_signaled = True
                _notify_failure(_failure_callback, code)

            try:
                _input_validator.validate(tool_input)
                _emit_collaborator_trace(
                    _collaborator_trace_callback,
                    _agent_id,
                    'STARTED',
                    {'toolName': _name},
                )
                tools_used: dict[str, str] = {}
                deadline_state = _DeadlineState()

                def capture_hidden_tool(
                        tool_name,
                        _result=None,
                        *,
                        invocation_input=None):
                    if on_hidden_tool_result is not None:
                        on_hidden_tool_result(
                            tool_name,
                            _result,
                            invocation_input=invocation_input,
                        )
                    if not isinstance(invocation_input, dict):
                        return
                    parameters = invocation_input.get('parameters') or []
                    args = {
                        str(parameter['name']): parameter.get('value')
                        for parameter in parameters
                        if isinstance(parameter, dict) and 'name' in parameter
                    }
                    canonical = json.dumps(
                        args,
                        separators=(',', ':'),
                        sort_keys=True,
                    )
                    tools_used[str(tool_name)] = hashlib.sha256(
                        canonical.encode('utf-8')
                    ).hexdigest()

                specialist_tools = (
                    build_tools(
                        _specialist_tool_definitions,
                        session_id,
                        current_user_text,
                        session_attributes=session_attributes,
                        prompt_session_attributes=prompt_session_attributes,
                        # Only the tool name and a hash of its input are kept; raw hidden
                        # inputs and results never reach the supervisor's message.
                        trace_callback=capture_hidden_tool,
                    )
                    if _specialist_tool_definitions else []
                )
                specialist_tools = deadline_state.guard_tools(specialist_tools)
                specialist_tools = _limit_successful_tools(
                    specialist_tools,
                    _single_success_tools,
                )
                specialist = agent_factory(
                    model=build_model(_model_id),
                    system_prompt=_specialist_prompt_text,
                    tools=specialist_tools or None,
                    callback_handler=None,
                    messages=(
                        copy.deepcopy(history_messages)
                        if _relay_history else []
                    ),
                    state={
                        'session_attributes': session_attributes,
                        'prompt_session_attributes': prompt_session_attributes,
                    },
                    name=_agent_id,
                    description=_description,
                )

                def cancel_on_deadline():
                    if not deadline_state.close():
                        return
                    fail_closed('COLLABORATOR_TIMEOUT')
                    # Strands cancellation is cooperative: it stops at its next
                    # checkpoint, but cannot hard-kill an admitted synchronous tool.
                    try:
                        specialist.cancel()
                    except Exception:
                        logger.exception(
                            'Could not cancel timed-out tool-mode collaborator: %s',
                            _name,
                        )

                deadline_state.start(_timeout_seconds)
                timer = threading.Timer(_timeout_seconds, cancel_on_deadline)
                timer.daemon = True
                timer.start()
                try:
                    result = specialist(
                        _specialist_input(tool_input, current_user_text),
                        invocation_state={'stop_event': deadline_state.expired},
                    )
                    parsed = _extract_json(
                        str(result) if result is not None else ''
                    )
                    validating_output = True
                    _output_validator.validate(parsed)
                    canonical = json.dumps(
                        parsed,
                        separators=(',', ':'),
                        sort_keys=True,
                    )
                    if not deadline_state.commit_success():
                        logger.error(
                            'Tool-mode collaborator timed out: %s',
                            _name,
                        )
                        _emit_collaborator_trace(
                            _collaborator_trace_callback,
                            _agent_id,
                            'FAILED',
                            {'code': 'COLLABORATOR_TIMEOUT'},
                        )
                        fail_closed('COLLABORATOR_TIMEOUT')
                        return _error_result(
                            tool_use_id,
                            'COLLABORATOR_TIMEOUT',
                        )
                finally:
                    timer.cancel()
                _emit_collaborator_trace(
                    _collaborator_trace_callback,
                    _agent_id,
                    'SUCCEEDED',
                    {
                        'kind': parsed.get('kind'),
                        'schemaVersion': parsed.get('schemaVersion'),
                        'toolsUsed': [
                            {'name': name, 'inputSha256': input_sha256}
                            for name, input_sha256 in tools_used.items()
                        ],
                    },
                )
                return {
                    'toolUseId': tool_use_id,
                    'status': 'success',
                    'content': [{'text': canonical}],
                }
            except ValidationError as error:
                if validating_output:
                    fail_closed('COLLABORATOR_SCHEMA_VALIDATION_FAILED')
                logger.error(
                    'Tool-mode collaborator input/output failed validation: %s '
                    'validator=%s instance_path=%s schema_path=%s',
                    _name,
                    error.validator,
                    list(error.absolute_path),
                    list(error.absolute_schema_path),
                )
                _emit_collaborator_trace(
                    _collaborator_trace_callback,
                    _agent_id,
                    'FAILED',
                    {'code': 'COLLABORATOR_SCHEMA_VALIDATION_FAILED'},
                )
                return _error_result(
                    tool_use_id,
                    'COLLABORATOR_SCHEMA_VALIDATION_FAILED',
                )
            except (json.JSONDecodeError, ValueError):
                fail_closed('COLLABORATOR_OUTPUT_INVALID')
                logger.error('Tool-mode collaborator returned invalid structured output: %s', _name)
                _emit_collaborator_trace(
                    _collaborator_trace_callback,
                    _agent_id,
                    'FAILED',
                    {'code': 'COLLABORATOR_OUTPUT_INVALID'},
                )
                return _error_result(tool_use_id, 'COLLABORATOR_OUTPUT_INVALID')
            except Exception:
                fail_closed('COLLABORATOR_INVOCATION_FAILED')
                logger.exception('Tool-mode collaborator failed: %s', _name)
                _emit_collaborator_trace(
                    _collaborator_trace_callback,
                    _agent_id,
                    'FAILED',
                    {'code': 'COLLABORATOR_INVOCATION_FAILED'},
                )
                return _error_result(tool_use_id, 'COLLABORATOR_INVOCATION_FAILED')

        tool_spec = {
            'name': name,
            'description': description,
            'inputSchema': {'json': input_schema},
        }
        tools.append(PythonAgentTool(name, tool_spec, tool_func))

    return tools