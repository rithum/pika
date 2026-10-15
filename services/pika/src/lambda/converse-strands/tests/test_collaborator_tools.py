import hashlib
import json
import threading
import time
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from collaborator_tools import (
    _DeadlineState,
    build_tool_mode_collaborators,
)
from strands.tools.tools import PythonAgentTool
from tests.hook_defaults import base_hooks  # noqa: F401

pytestmark = pytest.mark.usefixtures('base_hooks')


OUTPUT_SCHEMA = {
    'type': 'object',
    'properties': {
        'kind': {
            'type': 'string',
            'enum': ['PLAN', 'QUESTION', 'PROGRESS', 'RECEIPT', 'FAILURE'],
        },
        'runId': {'type': 'string'},
    },
    'required': ['kind'],
    'additionalProperties': False,
}


def config(**overrides):
    return {
        'agentId': 'example-specialist',
        'mode': 'tool',
        'toolName': 'consult_example_specialist',
        'instruction': 'Return structured specialist state.',
        'historyRelay': 'TO_COLLABORATOR',
        'outputSchema': OUTPUT_SCHEMA,
        **overrides,
    }


def invoke(tool, tool_input=None):
    return tool._tool_func({
        'toolUseId': 'tool-use-1',
        'input': tool_input or {'task': 'Inspect the active plan'},
    })


def agent_using_hidden_tool(callback):
    class ToolUsingAgent:
        def __init__(self, **kwargs):
            self._tool = kwargs['tools'][0]

        def __call__(self, _prompt, **_kwargs):
            callback(self._tool)
            return '{"kind":"PLAN","runId":"run-1"}'

    return ToolUsingAgent


def build(*, configs=None, result='{"kind":"PLAN","runId":"run-1"}',
          trace_callback=None, tool_trace_callback=None,
          failure_callback=None, on_hidden_tool_result=None,
          current_user='Help me review my open orders',
          history=None, build_tools=None, agent_factory=None,
          load_agent_definition=None, load_tool_definitions=None):
    captured = {}

    class FakeAgent:
        def __init__(self, **kwargs):
            captured['agent_kwargs'] = kwargs

        def __call__(self, prompt, **_kwargs):
            captured['specialist_prompt'] = prompt
            return result

    tool_builder = build_tools or MagicMock(return_value=[])
    tools = build_tool_mode_collaborators(
        configs or [config()],
        load_agent_definition=load_agent_definition or (lambda _agent_id: {
            'agent_id': 'example-specialist',
            'base_prompt': 'You are the example specialist.',
            'foundation_model': 'model-1',
            'tool_ids': ['example_tools'],
        }),
        load_tool_definitions=load_tool_definitions or (
            lambda _tool_ids: [{'tool_id': 'example_tools'}]
        ),
        build_tools=tool_builder,
        build_model=lambda model_id: f'model:{model_id}',
        session_id='session-1',
        current_user_text=current_user,
        session_attributes={'accountId': 'account-1'},
        prompt_session_attributes={'currentDate': '2026-08-10'},
        history_messages=history or [{'role': 'user', 'content': [{'text': 'Earlier turn'}]}],
        collaborator_trace_callback=trace_callback,
        tool_trace_callback=tool_trace_callback,
        failure_callback=failure_callback,
        on_hidden_tool_result=on_hidden_tool_result,
        agent_factory=agent_factory or FakeAgent,
    )
    return tools, captured, tool_builder


class TestBuildToolModeCollaborators:

    def test_builds_only_tool_mode_collaborators(self):
        tools, _, _ = build(configs=[
            config(),
            {
                'agentId': 'legacy-agent',
                'mode': 'swarm',
                'instruction': 'Legacy Swarm route',
                'outputSchema': OUTPUT_SCHEMA,
            },
        ])

        assert len(tools) == 1
        assert tools[0].tool_name == 'consult_example_specialist'

    def test_composes_specialist_prompt_and_trusted_context(self):
        tools, captured, tool_builder = build()
        response = invoke(tools[0])

        assert response['status'] == 'success'
        assert json.loads(response['content'][0]['text']) == {
            'kind': 'PLAN',
            'runId': 'run-1',
        }
        system_prompt = captured['agent_kwargs']['system_prompt']
        assert 'You are the example specialist.' in system_prompt
        assert 'Return structured specialist state.' in system_prompt
        assert 'hidden specialist tool' in system_prompt
        assert json.dumps(OUTPUT_SCHEMA, separators=(',', ':'), sort_keys=True) in system_prompt
        assert captured['agent_kwargs']['callback_handler'] is None
        assert captured['agent_kwargs']['messages'][0]['content'][0]['text'] == 'Earlier turn'
        specialist_input = json.loads(captured['specialist_prompt'])
        assert specialist_input['currentUserText'] == 'Help me review my open orders'
        assert specialist_input['delegatedInput']['task'] == 'Inspect the active plan'
        tool_builder.assert_called_once()
        assert tool_builder.call_args.args[2] == 'Help me review my open orders'

    def test_serializes_dynamodb_decimal_values_in_configured_schema(self):
        schema = {
            **OUTPUT_SCHEMA,
            'properties': {
                **OUTPUT_SCHEMA['properties'],
                'count': {'type': 'integer', 'minimum': Decimal('0')},
            },
        }
        tools, captured, _ = build(configs=[config(
            outputSchema=schema,
            timeoutSeconds=Decimal('120'),
        )])
        invoke(tools[0])

        assert '"minimum":0' in captured['agent_kwargs']['system_prompt']

    def test_history_relay_disabled_starts_specialist_without_history(self):
        tools, captured, _ = build(configs=[config(historyRelay='DISABLED')])
        invoke(tools[0])

        assert captured['agent_kwargs']['messages'] == []

    def test_single_success_tool_blocks_duplicate_execution(self):
        calls = []

        def status_func(tool_use, **_invocation_state):
            calls.append(tool_use)
            return {
                'toolUseId': tool_use.get('toolUseId', ''),
                'status': 'success',
                'content': [{'text': '{"status":"TRIAGING"}'}],
            }

        status_tool = PythonAgentTool(
            'get_status',
            {
                'name': 'get_status',
                'description': 'Read status',
                'inputSchema': {'json': {'type': 'object'}},
            },
            status_func,
        )
        responses = []

        def use_tool(guarded):
            responses.append(guarded._tool_func({
                'toolUseId': 'one',
                'input': {},
            }))
            responses.append(guarded._tool_func({
                'toolUseId': 'two',
                'input': {},
            }))

        tools, _, _ = build(
            configs=[config(singleSuccessTools=['get_status'])],
            build_tools=MagicMock(return_value=[status_tool]),
            agent_factory=agent_using_hidden_tool(use_tool),
        )
        response = invoke(tools[0])

        assert response['status'] == 'success'
        assert responses[0]['status'] == 'success'
        assert responses[1]['status'] == 'error'
        assert 'already ran' in responses[1]['content'][0]['text']
        assert len(calls) == 1

    def test_single_success_tool_reserves_concurrent_execution(self):
        calls = []
        entered = threading.Event()
        release = threading.Event()

        def status_func(tool_use, **_invocation_state):
            calls.append(tool_use)
            entered.set()
            assert release.wait(timeout=1)
            return {
                'toolUseId': tool_use.get('toolUseId', ''),
                'status': 'success',
                'content': [{'text': '{"status":"TRIAGING"}'}],
            }

        status_tool = PythonAgentTool(
            'get_status',
            {
                'name': 'get_status',
                'description': 'Read status',
                'inputSchema': {'json': {'type': 'object'}},
            },
            status_func,
        )
        first_response = {}
        second_response = {}

        def use_tool(guarded):
            def invoke_first():
                first_response['value'] = guarded._tool_func({
                    'toolUseId': 'one',
                    'input': {},
                })

            first_thread = threading.Thread(target=invoke_first)
            first_thread.start()
            assert entered.wait(timeout=1)
            second_response['value'] = guarded._tool_func({
                'toolUseId': 'two',
                'input': {},
            })
            release.set()
            first_thread.join(timeout=1)
            assert not first_thread.is_alive()

        tools, _, _ = build(
            configs=[config(singleSuccessTools=['get_status'])],
            build_tools=MagicMock(return_value=[status_tool]),
            agent_factory=agent_using_hidden_tool(use_tool),
        )
        response = invoke(tools[0])

        assert response['status'] == 'success'
        assert first_response['value']['status'] == 'success'
        assert second_response['value']['status'] == 'error'
        assert len(calls) == 1

    def test_single_success_tool_allows_retry_after_failure(self):
        outcomes = [
            {
                'toolUseId': 'one',
                'status': 'error',
                'content': [{'text': 'transient failure'}],
            },
            {
                'toolUseId': 'two',
                'status': 'success',
                'content': [{'text': '{"status":"TRIAGING"}'}],
            },
        ]
        calls = []

        def status_func(_tool_use, **_invocation_state):
            calls.append(True)
            return outcomes.pop(0)

        status_tool = PythonAgentTool(
            'get_status',
            {
                'name': 'get_status',
                'description': 'Read status',
                'inputSchema': {'json': {'type': 'object'}},
            },
            status_func,
        )
        responses = []

        def use_tool(guarded):
            for tool_use_id in ('one', 'two', 'three'):
                responses.append(guarded._tool_func({
                    'toolUseId': tool_use_id,
                    'input': {},
                }))

        tools, _, _ = build(
            configs=[config(singleSuccessTools=['get_status'])],
            build_tools=MagicMock(return_value=[status_tool]),
            agent_factory=agent_using_hidden_tool(use_tool),
        )
        response = invoke(tools[0])

        assert response['status'] == 'success'
        assert responses[0]['status'] == 'error'
        assert responses[1]['status'] == 'success'
        assert responses[2]['status'] == 'error'
        assert len(calls) == 2

    def test_validated_result_is_the_only_collaborator_trace_text(self):
        traces = []
        tools, _, _ = build(
            result='```json\n{"runId":"run-1","kind":"PLAN"}\n```',
            trace_callback=lambda agent_id, event, metadata: traces.append(
                (agent_id, event, metadata)
            ),
        )
        response = invoke(tools[0])

        assert response['status'] == 'success'
        assert traces == [
            ('example-specialist', 'STARTED', {'toolName': 'consult_example_specialist'}),
            ('example-specialist', 'SUCCEEDED', {
                'kind': 'PLAN',
                'schemaVersion': None,
                'toolsUsed': [],
            }),
        ]
        assert '```' not in response['content'][0]['text']

    def test_validated_json_is_recovered_from_incidental_model_prose(self):
        tools, _, _ = build(
            result=(
                'I completed the bounded task.\n'
                '{"runId":"run-1","kind":"PLAN"}\n'
                'No user-facing prose should escape.'
            ),
        )
        response = invoke(tools[0])

        assert response['status'] == 'success'
        assert json.loads(response['content'][0]['text']) == {
            'kind': 'PLAN',
            'runId': 'run-1',
        }

    def test_malformed_specialist_text_fails_closed_without_leaking_text(self):
        unsafe = 'I changed the mapping and fixed everything.'
        failures = []
        tools, _, _ = build(
            result=unsafe,
            failure_callback=failures.append,
        )
        response = invoke(tools[0])

        assert response['status'] == 'error'
        assert json.loads(response['content'][0]['text']) == {
            'error': 'COLLABORATOR_OUTPUT_INVALID',
            'retryable': False,
        }
        assert failures == ['COLLABORATOR_OUTPUT_INVALID']
        assert unsafe not in response['content'][0]['text']

    def test_schema_invalid_json_fails_closed(self):
        tools, _, _ = build(result='{"kind":"UNKNOWN"}')
        response = invoke(tools[0])

        assert response['status'] == 'error'
        assert 'COLLABORATOR_SCHEMA_VALIDATION_FAILED' in response['content'][0]['text']

    def test_specialist_invocation_failure_signals_terminal_failure(self):
        failures = []

        class FailingAgent:
            def __init__(self, **_kwargs):
                pass

            def __call__(self, _prompt, **_kwargs):
                raise RuntimeError('hidden tool failed')

        tools, _, _ = build(
            agent_factory=FailingAgent,
            failure_callback=failures.append,
        )
        response = invoke(tools[0])

        assert response['status'] == 'error'
        assert json.loads(response['content'][0]['text']) == {
            'error': 'COLLABORATOR_INVOCATION_FAILED',
            'retryable': False,
        }
        assert failures == ['COLLABORATOR_INVOCATION_FAILED']

    def test_hidden_tool_failure_signals_terminal_failure(self):
        failures = []

        def fail_hidden_tool(_tool_use, **_invocation_state):
            raise RuntimeError('enum lookup failed')

        hidden_tool = PythonAgentTool(
            'lookup_enum',
            {
                'name': 'lookup_enum',
                'description': 'Look up an enum value.',
                'inputSchema': {'json': {'type': 'object'}},
            },
            fail_hidden_tool,
        )

        class AgentUsingFailingTool:
            def __init__(self, **kwargs):
                self._tool = kwargs['tools'][0]

            def __call__(self, _prompt, **_kwargs):
                self._tool._tool_func({
                    'toolUseId': 'inner',
                    'input': {},
                })
                return '{"kind":"PLAN"}'

        tools, _, _ = build(
            build_tools=MagicMock(return_value=[hidden_tool]),
            agent_factory=AgentUsingFailingTool,
            failure_callback=failures.append,
        )
        response = invoke(tools[0])

        assert response['status'] == 'error'
        assert 'COLLABORATOR_INVOCATION_FAILED' in response['content'][0]['text']
        assert failures == ['COLLABORATOR_INVOCATION_FAILED']

    def test_invocation_input_is_schema_validated_before_specialist_runs(self):
        tools, captured, _ = build()
        response = invoke(tools[0], {'task': 7, 'extra': True})

        assert response['status'] == 'error'
        assert 'COLLABORATOR_SCHEMA_VALIDATION_FAILED' in response['content'][0]['text']
        assert 'specialist_prompt' not in captured

    def test_missing_output_schema_produces_config_error_tool(self):
        invalid = config()
        del invalid['outputSchema']
        tools, _, _ = build(configs=[invalid])
        response = invoke(tools[0])

        assert response['status'] == 'error'
        assert 'COLLABORATOR_CONFIG_INVALID' in response['content'][0]['text']

    def test_malformed_output_schema_produces_config_error_tool(self):
        tools, _, _ = build(configs=[config(outputSchema={
            'type': 'not-a-real-json-schema-type',
        })])
        response = invoke(tools[0])

        assert response['status'] == 'error'
        assert 'COLLABORATOR_CONFIG_INVALID' in response['content'][0]['text']

    def test_definition_load_failure_does_not_abort_other_collaborators(self):
        traces = []

        def load_agent_definition(agent_id):
            if agent_id == 'broken':
                raise RuntimeError('DynamoDB unavailable')
            return {
                'agent_id': agent_id,
                'base_prompt': 'You are the example specialist.',
                'foundation_model': 'model-1',
                'tool_ids': [],
            }

        tools, _, _ = build(
            configs=[
                config(agentId='broken', toolName='consult_broken'),
                config(agentId='working', toolName='consult_working'),
            ],
            load_agent_definition=load_agent_definition,
            trace_callback=lambda agent_id, event, metadata: traces.append(
                (agent_id, event, metadata)
            ),
        )

        broken = invoke(tools[0])
        working = invoke(tools[1])

        assert 'COLLABORATOR_DEFINITION_LOAD_FAILED' in broken['content'][0]['text']
        assert working['status'] == 'success'
        assert traces[0] == (
            'broken',
            'FAILED',
            {'code': 'COLLABORATOR_DEFINITION_LOAD_FAILED'},
        )

    def test_tool_load_failure_does_not_abort_other_collaborators(self):
        traces = []

        def load_agent_definition(agent_id):
            return {
                'agent_id': agent_id,
                'base_prompt': 'You are the example specialist.',
                'foundation_model': 'model-1',
                'tool_ids': ['broken-tools'] if agent_id == 'broken' else [],
            }

        def load_tool_definitions(tool_ids):
            if tool_ids == ['broken-tools']:
                raise RuntimeError('DynamoDB unavailable')
            return []

        tools, _, _ = build(
            configs=[
                config(agentId='broken', toolName='consult_broken'),
                config(agentId='working', toolName='consult_working'),
            ],
            load_agent_definition=load_agent_definition,
            load_tool_definitions=load_tool_definitions,
            trace_callback=lambda agent_id, event, metadata: traces.append(
                (agent_id, event, metadata)
            ),
        )

        broken = invoke(tools[0])
        working = invoke(tools[1])

        assert 'COLLABORATOR_TOOL_LOAD_FAILED' in broken['content'][0]['text']
        assert working['status'] == 'success'
        assert traces[0] == (
            'broken',
            'FAILED',
            {'code': 'COLLABORATOR_TOOL_LOAD_FAILED'},
        )

    def test_creates_a_fresh_specialist_for_each_invocation(self):
        created = []

        class CountingAgent:
            def __init__(self, **kwargs):
                created.append(kwargs)

            def __call__(self, _prompt, **_kwargs):
                return '{"kind":"PLAN","runId":"run-1"}'

        tools, _, _ = build(agent_factory=CountingAgent)
        invoke(tools[0])
        invoke(tools[0])

        assert len(created) == 2
        assert created[0] is not created[1]

    def test_hidden_specialist_build_tools_sanitizes_action_group_traces(self):
        supervisor_traces = []
        seen_trace_callbacks = []

        def recording_build_tools(*_args, trace_callback=None, **_kwargs):
            seen_trace_callbacks.append(trace_callback)
            if trace_callback is not None:
                trace_callback(
                    'get_status',
                    '{"status":"TRIAGING","planId":"secret-plan"}',
                    invocation_input={
                        'parameters': [
                            {'name': 'run_id', 'value': 'secret-plan'},
                        ],
                    },
                )
            return []

        tools, _, _ = build(
            tool_trace_callback=lambda *_a, **_k: supervisor_traces.append('leak'),
            build_tools=recording_build_tools,
        )
        response = invoke(tools[0])

        assert response['status'] == 'success'
        assert supervisor_traces == []
        assert len(seen_trace_callbacks) == 1
        assert callable(seen_trace_callbacks[0])

    def test_hidden_internal_tool_invocation_does_not_emit_user_traces(self):
        leaked = []

        def build_tools_with_hidden_lambda(*_args, trace_callback=None, **_kwargs):
            def get_status_func(tool_use, **_invocation_state):
                if trace_callback is not None:
                    trace_callback(
                        'get_status',
                        '{"status":"TRIAGING","internal":"must-not-leak"}',
                        invocation_input={
                            'parameters': [
                                {'name': 'run_id', 'value': 'secret-plan'},
                            ],
                        },
                    )
                return {
                    'toolUseId': tool_use.get('toolUseId', ''),
                    'status': 'success',
                    'content': [{'text': '{"status":"TRIAGING"}'}],
                }

            return [PythonAgentTool(
                'get_status',
                {
                    'name': 'get_status',
                    'description': 'Read status',
                    'inputSchema': {'json': {'type': 'object'}},
                },
                get_status_func,
            )]

        class SpecialistThatUsesTools:
            def __init__(self, **kwargs):
                self._tools = kwargs.get('tools') or []

            def __call__(self, _prompt, **_kwargs):
                self._tools[0]._tool_func({'toolUseId': 'inner', 'input': {}})
                return '{"kind":"PLAN","runId":"run-1"}'

        lifecycle = []
        tools, _, _ = build(
            build_tools=build_tools_with_hidden_lambda,
            agent_factory=SpecialistThatUsesTools,
            trace_callback=lambda agent_id, event, metadata: lifecycle.append(
                (agent_id, event, metadata)
            ),
            tool_trace_callback=lambda *_a, **_k: leaked.append('user-trace'),
        )
        response = invoke(tools[0])

        assert response['status'] == 'success'
        assert leaked == []
        assert lifecycle == [
            ('example-specialist', 'STARTED', {'toolName': 'consult_example_specialist'}),
            ('example-specialist', 'SUCCEEDED', {
                'kind': 'PLAN',
                'schemaVersion': None,
                'toolsUsed': [{
                    'name': 'get_status',
                    'inputSha256': hashlib.sha256(
                        b'{"run_id":"secret-plan"}'
                    ).hexdigest(),
                }],
            }),
        ]
        assert 'must-not-leak' not in json.dumps(response)
        assert 'secret-plan' not in json.dumps(lifecycle)

    def test_deadline_closure_wins_before_hidden_tool_admission(self):
        raw_calls = []
        inner_response = {}
        cancelled = threading.Event()

        def raw_tool(tool_use, **_invocation_state):
            raw_calls.append(tool_use)
            return {
                'toolUseId': tool_use.get('toolUseId', ''),
                'status': 'success',
                'content': [{'text': '{"status":"TRIAGING"}'}],
            }

        hidden_tool = PythonAgentTool(
            'mutating_tool',
            {
                'name': 'mutating_tool',
                'description': 'Mutates a hidden plan',
                'inputSchema': {'json': {'type': 'object'}},
            },
            raw_tool,
        )

        class AgentAfterDeadline:
            def __init__(self, **kwargs):
                self._tools = kwargs['tools']

            def cancel(self):
                cancelled.set()

            def __call__(self, _prompt, **_kwargs):
                assert cancelled.wait(timeout=1)
                inner_response['value'] = self._tools[0]._tool_func({
                    'toolUseId': 'inner',
                    'input': {},
                })
                return '{"kind":"PLAN","runId":"run-1"}'

        traces = []
        tools, _, _ = build(
            configs=[config(timeoutSeconds=0.001)],
            build_tools=MagicMock(return_value=[hidden_tool]),
            agent_factory=AgentAfterDeadline,
            trace_callback=lambda agent_id, event, metadata: traces.append(
                (agent_id, event, metadata)
            ),
        )
        response = invoke(tools[0])

        assert raw_calls == []
        assert 'COLLABORATOR_TIMEOUT' in inner_response['value']['content'][0]['text']
        assert 'COLLABORATOR_TIMEOUT' in response['content'][0]['text']
        assert all(event != 'SUCCEEDED' for _, event, _ in traces)

    def test_deadline_quarantines_tool_result_admitted_before_closure(self):
        raw_calls = []
        inner_response = {}
        cancelled = threading.Event()

        def raw_tool(tool_use, **_invocation_state):
            raw_calls.append(tool_use)
            assert cancelled.wait(timeout=1)
            return {
                'toolUseId': tool_use.get('toolUseId', ''),
                'status': 'success',
                'content': [{'text': '{"status":"TRIAGING"}'}],
            }

        hidden_tool = PythonAgentTool(
            'mutating_tool',
            {
                'name': 'mutating_tool',
                'description': 'Mutates a hidden plan',
                'inputSchema': {'json': {'type': 'object'}},
            },
            raw_tool,
        )

        class AgentWithInFlightTool:
            def __init__(self, **kwargs):
                self._tools = kwargs['tools']

            def cancel(self):
                cancelled.set()

            def __call__(self, _prompt, **_kwargs):
                inner_response['value'] = self._tools[0]._tool_func({
                    'toolUseId': 'inner',
                    'input': {},
                })
                return '{"kind":"PLAN","runId":"run-1"}'

        traces = []
        tools, _, _ = build(
            configs=[config(timeoutSeconds=0.001)],
            build_tools=MagicMock(return_value=[hidden_tool]),
            agent_factory=AgentWithInFlightTool,
            trace_callback=lambda agent_id, event, metadata: traces.append(
                (agent_id, event, metadata)
            ),
        )
        response = invoke(tools[0])

        assert len(raw_calls) == 1
        assert 'COLLABORATOR_TIMEOUT' in inner_response['value']['content'][0]['text']
        assert 'COLLABORATOR_TIMEOUT' in response['content'][0]['text']
        assert all(event != 'SUCCEEDED' for _, event, _ in traces)

    def test_closed_deadline_state_never_dispatches_raw_hidden_tool(self):
        raw_calls = []
        hidden_tool = PythonAgentTool(
            'mutating_tool',
            {
                'name': 'mutating_tool',
                'description': 'Mutates a hidden plan',
                'inputSchema': {'json': {'type': 'object'}},
            },
            lambda tool_use, **_state: raw_calls.append(tool_use),
        )
        deadline_state = _DeadlineState()
        deadline_state.start(1)
        assert deadline_state.close()

        guarded = deadline_state.guard(hidden_tool)
        response = guarded._tool_func({
            'toolUseId': 'inner',
            'input': {},
        })

        assert raw_calls == []
        assert response['status'] == 'error'
        assert 'COLLABORATOR_TIMEOUT' in response['content'][0]['text']

    def test_deadline_remains_active_through_result_string_conversion(self):
        cancelled = threading.Event()

        class SlowString:
            def __str__(self):
                assert cancelled.wait(timeout=1)
                return '{"kind":"PLAN","runId":"run-1"}'

        class AgentWithSlowStringConversion:
            def __init__(self, **_kwargs):
                pass

            def cancel(self):
                cancelled.set()

            def __call__(self, _prompt, **_kwargs):
                return SlowString()

        traces = []
        tools, _, _ = build(
            configs=[config(timeoutSeconds=0.001)],
            agent_factory=AgentWithSlowStringConversion,
            trace_callback=lambda agent_id, event, metadata: traces.append(
                (agent_id, event, metadata)
            ),
        )
        response = invoke(tools[0])

        assert cancelled.is_set()
        assert response['status'] == 'error'
        assert 'COLLABORATOR_TIMEOUT' in response['content'][0]['text']
        assert all(event != 'SUCCEEDED' for _, event, _ in traces)

    def test_timeout_rejects_a_late_specialist_result(self):
        created = []

        class CancellableAgent:
            def __init__(self, **_kwargs):
                self.cancelled = threading.Event()
                created.append(self)

            def cancel(self):
                self.cancelled.set()

            def __call__(self, _prompt, **_kwargs):
                assert self.cancelled.wait(timeout=1)
                return '{"kind":"PLAN","runId":"run-1"}'

        traces = []
        tools, _, _ = build(
            configs=[config(timeoutSeconds=0.001)],
            agent_factory=CancellableAgent,
            trace_callback=lambda agent_id, event, metadata: traces.append(
                (agent_id, event, metadata)
            ),
        )
        response = invoke(tools[0])

        assert response['status'] == 'error'
        assert 'COLLABORATOR_TIMEOUT' in response['content'][0]['text']
        assert created[0].cancelled.is_set()
        assert all(event != 'SUCCEEDED' for _, event, _ in traces)

    def test_non_cooperative_timeout_is_rejected_after_return(self):
        class SlowAgent:
            def __init__(self, **_kwargs):
                pass

            def __call__(self, _prompt, **_kwargs):
                time.sleep(0.05)
                return '{"kind":"PLAN"}'

        tools, _, _ = build(
            configs=[config(timeoutSeconds=0.001)],
            agent_factory=SlowAgent,
        )
        started = time.monotonic()
        response = invoke(tools[0])
        elapsed = time.monotonic() - started

        assert response['status'] == 'error'
        assert 'COLLABORATOR_TIMEOUT' in response['content'][0]['text']
        assert elapsed >= 0.05

    def test_hidden_tool_calls_reach_the_result_callback(self):
        seen = []

        def build_tools_with_hidden_lambda(*_args, trace_callback=None, **_kwargs):
            def get_status_func(tool_use, **_invocation_state):
                trace_callback(
                    'get_status',
                    None,
                    invocation_input={'parameters': [{'name': 'run_id', 'value': 'run-1'}]},
                )
                trace_callback('get_status', '{"status":"DONE"}')
                return {
                    'toolUseId': tool_use.get('toolUseId', ''),
                    'status': 'success',
                    'content': [{'text': '{"status":"DONE"}'}],
                }

            return [PythonAgentTool(
                'get_status',
                {
                    'name': 'get_status',
                    'description': 'Read status',
                    'inputSchema': {'json': {'type': 'object'}},
                },
                get_status_func,
            )]

        class SpecialistThatUsesTools:
            def __init__(self, **kwargs):
                self._tools = kwargs.get('tools') or []

            def __call__(self, _prompt, **_kwargs):
                self._tools[0]._tool_func({'toolUseId': 'inner', 'input': {}})
                return '{"kind":"PLAN","runId":"run-1"}'

        tools, _, _ = build(
            build_tools=build_tools_with_hidden_lambda,
            agent_factory=SpecialistThatUsesTools,
            on_hidden_tool_result=lambda name, result, *, invocation_input=None: seen.append(
                (name, result, invocation_input)
            ),
        )
        response = invoke(tools[0])

        assert response['status'] == 'success'
        assert seen == [
            ('get_status', None, {'parameters': [{'name': 'run_id', 'value': 'run-1'}]}),
            ('get_status', '{"status":"DONE"}', None),
        ]
