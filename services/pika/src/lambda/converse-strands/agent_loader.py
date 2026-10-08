"""Load agent definitions and build Strands tools from DynamoDB.

Fetches agent config and tool definitions, then constructs PythonAgentTool
instances that invoke the existing tool Lambdas with the Bedrock
ActionGroupInvocationInput payload format.
"""
import os
import json
import logging
from collections.abc import Callable

import boto3

# Constants for the Bedrock ActionGroupInvocationInput payload
BEDROCK_AGENT_NAME = 'INLINE_AGENT'
BEDROCK_AGENT_ALIAS = 'TSTALIASID'
BEDROCK_MESSAGE_VERSION = '1.0'
from strands.tools.tools import PythonAgentTool

logger = logging.getLogger(__name__)

AGENT_DEFINITIONS_TABLE = os.environ.get('AGENT_DEFINITIONS_TABLE', '')
TOOL_DEFINITIONS_TABLE = os.environ.get('TOOL_DEFINITIONS_TABLE', '')

lambda_client = boto3.client('lambda')
_local_tool_clients: dict[str, object] = {}


def load_agent(dynamodb_resource, agent_id: str) -> dict:
    """Fetch agent definition from DynamoDB.

    The handler has fallbacks for `foundation_model` (DEFAULT_MODEL_ID) and
    `base_prompt` (a generic helpful-assistant prompt), so a missing field
    isn't a crash condition — but silently using defaults can hide a broken
    agent record. Log a warning when we see one so operators can distinguish
    "intentionally minimal agent" from "DDB record that lost its fields."
    """
    table = dynamodb_resource.Table(AGENT_DEFINITIONS_TABLE)
    response = table.get_item(Key={'agent_id': agent_id})
    if 'Item' not in response:
        raise ValueError(f"Agent '{agent_id}' not found")
    item = response['Item']
    missing = [k for k in ('foundation_model', 'base_prompt') if not item.get(k)]
    if missing:
        logger.warning(
            f"Agent '{agent_id}' record is missing optional fields {missing!r}; "
            f"handler will fall through to defaults"
        )
    return item


def load_tools(dynamodb_resource, tool_ids: list[str]) -> list[dict]:
    """Fetch tool definitions from DynamoDB using BatchGetItem.

    Fetches all tools in a single round trip instead of N sequential get_item calls.
    """
    if not tool_ids or not TOOL_DEFINITIONS_TABLE:
        return []

    keys = [{'tool_id': tid} for tid in tool_ids]
    tools = []

    try:
        response = dynamodb_resource.batch_get_item(
            RequestItems={TOOL_DEFINITIONS_TABLE: {'Keys': keys}}
        )
        items = response.get('Responses', {}).get(TOOL_DEFINITIONS_TABLE, [])

        # Surface UnprocessedKeys — throttles or transient failures drop keys
        # from the response silently. Running with a partially-loaded toolset
        # would let the agent think it has tools it doesn't, so fall back to
        # individual gets for the missing ones.
        unprocessed = response.get('UnprocessedKeys', {}).get(TOOL_DEFINITIONS_TABLE, {}).get('Keys', [])
        if unprocessed:
            unprocessed_ids = [k.get('tool_id') for k in unprocessed]
            logger.warning(
                f"BatchGetItem returned UnprocessedKeys for tools {unprocessed_ids!r}; "
                f"retrying individually"
            )
            table = dynamodb_resource.Table(TOOL_DEFINITIONS_TABLE)
            for tid in unprocessed_ids:
                try:
                    r = table.get_item(Key={'tool_id': tid})
                    if 'Item' in r:
                        items.append(r['Item'])
                except Exception as retry_err:
                    logger.warning(f"Retry get_item failed for tool '{tid}': {retry_err}")

        # Build a lookup for ordering — BatchGetItem doesn't preserve order
        items_by_id = {item['tool_id']: item for item in items}
        for tool_id in tool_ids:
            if tool_id in items_by_id:
                tools.append(items_by_id[tool_id])
            else:
                logger.warning(f"Tool '{tool_id}' not found in DynamoDB")
    except Exception as e:
        logger.warning(f"BatchGetItem for tools failed, falling back to individual gets: {e}")
        table = dynamodb_resource.Table(TOOL_DEFINITIONS_TABLE)
        for tool_id in tool_ids:
            try:
                response = table.get_item(Key={'tool_id': tool_id})
                if 'Item' in response:
                    tools.append(response['Item'])
            except Exception:
                logger.warning(f"Tool '{tool_id}' not found in DynamoDB")

    return tools


def build_strands_tools(
    tool_defs: list[dict] | None = None,
    session_id: str = '',
    input_text: str = '',
    session_attributes: dict | None = None,
    prompt_session_attributes: dict | None = None,
    trace_callback: Callable[..., None] | None = None,
    *,
    tool_definitions: list[dict] | None = None,
) -> list:
    """Build agent-consumable tools from tool definitions.

    Dispatches on `execution_type`:
      - 'lambda' (or missing) → Lambda-backed PythonAgentTool, one per function
      - 'mcp'                 → remote MCP server tools via mcp_tools.build_mcp_tools
      - 'inline'              → in-process JS via quickjs (inline_tools.build_inline_tools)
      - anything else         → skipped with a warning (never raised)

    session_attributes and prompt_session_attributes mirror what the TypeScript
    converse Lambda sends in the Bedrock InlineSessionState so tool Lambdas receive
    the same context regardless of which path invoked them.

    trace_callback, when provided, is called after each tool invocation with the
    tool name and result text so the caller can emit observation traces.

    `tool_definitions` is accepted as a legacy kw-only alias for `tool_defs`.
    """
    defs = tool_defs if tool_defs is not None else (tool_definitions or [])
    strands_tools: list = []

    for tool_def in defs:
        execution_type = (tool_def.get('execution_type') or 'lambda').lower()

        if execution_type == 'mcp':
            strands_tools.extend(_build_mcp_tools(tool_def))
        elif execution_type == 'inline':
            strands_tools.extend(_build_inline_tools(
                tool_def,
                session_id=session_id,
                input_text=input_text,
                session_attributes=session_attributes or {},
                prompt_session_attributes=prompt_session_attributes or {},
                trace_callback=trace_callback,
            ))
        elif execution_type == 'lambda':
            strands_tools.extend(_build_lambda_tool(
                tool_def,
                session_id=session_id,
                input_text=input_text,
                session_attributes=session_attributes or {},
                prompt_session_attributes=prompt_session_attributes or {},
                trace_callback=trace_callback,
            ))
        else:
            logger.warning(
                f"Unknown execution_type '{execution_type}' for tool "
                f"{tool_def.get('tool_id')}; skipping"
            )

    return strands_tools


def _build_lambda_tool(
    tool_def: dict,
    *,
    session_id: str,
    input_text: str,
    session_attributes: dict,
    prompt_session_attributes: dict,
    trace_callback,
) -> list:
    """Build one PythonAgentTool per function in a Lambda-backed tool definition."""
    tool_id = tool_def['tool_id']
    lambda_arn = tool_def.get('lambda_arn', '')
    function_schema = tool_def.get('function_schema', [])
    if not isinstance(function_schema, list):
        function_schema = []

    tools = []
    for func_def in function_schema:
        func_name = func_def['name']
        func_desc = func_def.get('description') or ' '
        params = func_def.get('parameters', [])
        tools.append(_make_tool(
            tool_id=tool_id,
            lambda_arn=lambda_arn,
            func_name=func_name,
            func_desc=func_desc,
            params=params,
            session_id=session_id,
            input_text=input_text,
            session_attributes=session_attributes,
            prompt_session_attributes=prompt_session_attributes,
            trace_callback=trace_callback,
        ))
    return tools


def _build_mcp_tools(tool_def: dict) -> list:
    """Delegate to mcp_tools; kept as a thin indirection for test patching."""
    from mcp_tools import build_mcp_tools  # noqa: PLC0415
    return build_mcp_tools(tool_def)


def _build_inline_tools(
    tool_def: dict,
    *,
    session_id: str,
    input_text: str,
    session_attributes: dict,
    prompt_session_attributes: dict,
    trace_callback,
) -> list:
    """Delegate to inline_tools; kept as a thin indirection for test patching."""
    from inline_tools import build_inline_tools  # noqa: PLC0415
    return build_inline_tools(
        tool_def,
        session_id=session_id,
        input_text=input_text,
        session_attributes=session_attributes,
        prompt_session_attributes=prompt_session_attributes,
        trace_callback=trace_callback,
    )


def _normalize_params(params) -> list[dict]:
    """Normalize parameters from either dict or list format.

    DynamoDB stores parameters as a map: {param_name: {type, description, required}}
    Tests pass parameters as a list: [{name, type, description, required}]
    This normalizes both to the list format.
    """
    if isinstance(params, dict):
        return [
            {'name': name, **attrs}
            for name, attrs in params.items()
        ]
    return params


def _lambda_function_name(lambda_arn: str) -> str:
    """Return the bare function name from a Lambda ARN; other values pass through.

    A qualified ARN (``…:function:name:alias``) yields ``name`` with the alias
    dropped: local emulators register the unqualified name only.
    """
    parts = lambda_arn.split(':')
    if len(parts) >= 7 and parts[0] == 'arn' and parts[5] == 'function':
        return parts[6]
    return lambda_arn


def _read_local_tools_file(raw: str):
    """Read LOCAL_TOOLS as a JSON file path, resolved against the working directory."""
    path = os.path.abspath(os.path.join(os.getcwd(), raw))
    if not os.path.isfile(path):
        logger.warning(f'Ignoring LOCAL_TOOLS: no file at {path}')
        return {}
    try:
        with open(path, encoding='utf-8') as handle:
            return json.load(handle)
    except (OSError, ValueError) as e:
        logger.warning(f'Ignoring LOCAL_TOOLS: could not read {path}: {e}')
        return {}


def _local_tool_route(value) -> dict | None:
    """Normalize one LOCAL_TOOLS entry to {'endpoint', 'function'} or drop it.

    An entry is either an endpoint URL string, or an object holding 'endpoint'
    plus an optional 'function' that replaces the name derived from the ARN.
    A local emulator registers functions under its own stage, so a tool record
    pointing at my-app-prod-my-tool is served locally as my-app-test-my-tool; the override bridges that gap.
    """
    if isinstance(value, str):
        endpoint, function = value, None
    elif isinstance(value, dict):
        endpoint, function = value.get('endpoint'), value.get('function')
    else:
        return None
    if not isinstance(endpoint, str) or not endpoint.strip():
        return None
    if not isinstance(function, str) or not function.strip():
        function = None
    return {'endpoint': endpoint.strip(), 'function': function and function.strip()}


def _local_tool_routes() -> dict[str, dict]:
    """Map tool id or function name to a local route.

    LOCAL_TOOLS holds either inline JSON or a path to a JSON file, matching the
    file-path form the TypeScript converse path takes. Anything unreadable or
    malformed leaves every tool on its deployed Lambda.

    Re-read on every call, deliberately: the file can change mid-session
    without restarting Strands. The cost is that a transient read failure sends
    that one call to the deployed Lambda instead of failing loudly.
    """
    raw = (os.environ.get('LOCAL_TOOLS') or '').strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except ValueError:
        parsed = _read_local_tools_file(raw)
    if not isinstance(parsed, dict):
        logger.warning('Ignoring LOCAL_TOOLS: expected a JSON object of tool -> endpoint URL')
        return {}
    routes = {}
    for key, value in parsed.items():
        route = _local_tool_route(value)
        if route is None:
            logger.warning(f'Ignoring LOCAL_TOOLS entry {key!r}: expected an endpoint URL or an object with "endpoint"')
            continue
        routes[key] = route
    return routes


def _local_tool_endpoints() -> dict[str, str]:
    return {key: route['endpoint'] for key, route in _local_tool_routes().items()}


def _local_lambda_client(endpoint_url: str):
    client = _local_tool_clients.get(endpoint_url)
    if client is None:
        client = boto3.client('lambda', endpoint_url=endpoint_url)
        _local_tool_clients[endpoint_url] = client
    return client


def _resolve_tool_invocation(tool_id: str, lambda_arn: str):
    """Choose the Lambda client and FunctionName for a single tool invocation.

    A locally running Lambda emulator resolves by function name and not by ARN,
    so a tool routed through LOCAL_TOOLS is addressed by its bare name.
    """
    routes = _local_tool_routes()
    if not routes:
        return lambda_client, lambda_arn
    function_name = _lambda_function_name(lambda_arn)
    route = routes.get(tool_id) or routes.get(function_name)
    if not route:
        return lambda_client, lambda_arn
    endpoint = route['endpoint']
    function_name = route['function'] or function_name
    logger.info(f"Routing tool {tool_id} to local endpoint {endpoint} as function {function_name}")
    return _local_lambda_client(endpoint), function_name


def _make_tool(tool_id: str, lambda_arn: str, func_name: str,
               func_desc: str, params, session_id: str,
               input_text: str, session_attributes: dict | None = None,
               prompt_session_attributes: dict | None = None,
               trace_callback: Callable[..., None] | None = None) -> PythonAgentTool:
    """Create a PythonAgentTool that invokes a tool Lambda.

    Uses late-binding-safe closures — all variables captured at definition time.
    The tool_func signature is (tool_use, **invocation_state) -> ToolResult dict,
    as required by PythonAgentTool.
    """
    params = _normalize_params(params)

    # Build JSON Schema for inputSchema (must be wrapped in {"json": {...}})
    properties = {}
    required = []
    for p in params:
        properties[p['name']] = {
            'type': p.get('type', 'string'),
            'description': p.get('description') or ' ',
        }
        if p.get('required', False):
            required.append(p['name'])

    tool_spec = {
        'name': func_name,
        'description': func_desc,
        'inputSchema': {
            'json': {
                'type': 'object',
                'properties': properties,
                'required': required,
            }
        },
    }

    # Capture all closure variables explicitly
    _tool_id = tool_id
    _lambda_arn = lambda_arn
    _func_name = func_name
    _params = params
    _session_id = session_id
    _input_text = input_text
    _session_attributes = session_attributes or {}
    _prompt_session_attributes = prompt_session_attributes or {}
    _trace_callback = trace_callback

    def tool_func(tool_use, **invocation_state):
        try:
            kwargs = tool_use.get('input', {})

            # Build parameters array in Bedrock's format: [{name, type, value}]
            parameters = []
            for key, value in kwargs.items():
                param_type = 'string'
                for p in _params:
                    if p['name'] == key:
                        param_type = p.get('type', 'string')
                        break
                parameters.append({
                    'name': key,
                    'type': param_type,
                    'value': str(value) if not isinstance(value, str) else value,
                })

            payload = {
                'messageVersion': BEDROCK_MESSAGE_VERSION,
                'function': _func_name,
                'parameters': parameters,
                'inputText': _input_text,
                'sessionId': _session_id,
                'agent': {
                    'name': BEDROCK_AGENT_NAME,
                    'version': BEDROCK_AGENT_NAME,
                    'id': BEDROCK_AGENT_NAME,
                    'alias': BEDROCK_AGENT_ALIAS,
                },
                'actionGroup': _tool_id,
                'sessionAttributes': _session_attributes,
                'promptSessionAttributes': _prompt_session_attributes,
            }

            logger.info(f"Invoking tool Lambda: {_lambda_arn} function={_func_name} params={json.dumps({p['name']: p['value'] for p in parameters})}")

            # Emit invocationInput trace right before invocation so it's paired
            # with the observation trace that follows — keeps ordering correct
            # when the model makes parallel tool calls.
            if _trace_callback:
                _trace_callback(_func_name, None, invocation_input={
                    'actionGroupName': _func_name,
                    'function': _func_name,
                    'parameters': parameters,
                })

            invoke_client, invoke_target = _resolve_tool_invocation(_tool_id, _lambda_arn)
            response = invoke_client.invoke(
                FunctionName=invoke_target,
                Payload=json.dumps(payload),
            )

            response_payload = json.loads(response['Payload'].read())

            # Check for Lambda-level errors
            if response.get('FunctionError') or response_payload.get('errorMessage'):
                error_msg = response_payload.get('errorMessage', response.get('FunctionError', 'Unknown error'))
                if _trace_callback:
                    _trace_callback(_func_name, f"Error: {error_msg}")
                return {
                    'toolUseId': tool_use.get('toolUseId', ''),
                    'status': 'error',
                    'content': [{'text': f"Tool Lambda error ({_func_name}): {error_msg}"}],
                }

            # Extract response from Bedrock action group response format
            func_response = response_payload.get('response', {}).get('functionResponse', {})
            response_state = func_response.get('responseState')
            body = func_response.get('responseBody', {}).get('TEXT', {}).get('body', '')

            # Emit observation trace so the frontend shows the tool result
            if _trace_callback:
                _trace_callback(_func_name, body)

            if response_state and response_state != 'SUCCESS':
                return {
                    'toolUseId': tool_use.get('toolUseId', ''),
                    'status': 'error',
                    'content': [{'text': f"Tool error ({_func_name}): {body}"}],
                }

            return {
                'toolUseId': tool_use.get('toolUseId', ''),
                'status': 'success',
                'content': [{'text': body}],
            }

        except Exception as e:
            logger.error(f"Tool invocation error ({_func_name}): {e}")
            if _trace_callback:
                _trace_callback(_func_name, f"Error: {str(e)}")
            return {
                'toolUseId': tool_use.get('toolUseId', ''),
                'status': 'error',
                'content': [{'text': f"Tool invocation failed ({_func_name}): {str(e)}"}],
            }

    return PythonAgentTool(func_name, tool_spec, tool_func)
