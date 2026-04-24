"""
CONTRACT TESTS: inline tool support (execution_type='inline').

These tests are EXPECTED TO FAIL until inline tool execution is implemented.

Contract: tool definitions in tool-definitions-ai-bot-{stage} with
execution_type='inline' carry a `code` field containing a stringified
JavaScript function. The tool is executed in-process by embedding a
QuickJS runtime (`quickjs` PyPI package). This mirrors the TS converse
Lambda's `processInlineTool` behavior (bedrock-agent.ts), which does
`eval('(' + tool.code + ')')` and invokes the function with `(event, params)`.

Tool definition shape (from DDB):
  {
    "tool_id": "inline-example",
    "name": "inline-example",
    "execution_type": "inline",
    "code": "function random(event, params){ ...; return number; }",
    "function_schema": [{
        "name": "random-number",
        "description": "Creates a random number between min and max.",
        "parameters": {
            "min": {"type": "number", "required": true, ...},
            "max": {"type": "number", "required": true, ...},
            "precision": {"type": "number", "required": false, ...},
        },
    }]
  }

Loader must:
  - Dispatch on execution_type: 'lambda' | 'mcp' | 'inline' (new).
  - For 'inline': build one PythonAgentTool per entry in function_schema; each
    one lazily evaluates `code` in a fresh QuickJS context at invocation time.
  - The inline function body is the literal string `tool_def['code']`. At call
    time it MUST be invoked as `<fn_name>(event, params)` where:
      - `fn_name` is derived from `code` (the top-level function declaration,
        e.g. `function random(...)` → `random`); NOT `function_schema[].name`.
      - `event` is a minimal dict with sessionId + sessionAttributes context.
      - `params` is a dict of the tool-call inputs.
    Values cross the Python/JS boundary as JSON strings; the wrapper inside
    the QuickJS context calls `JSON.parse` / `JSON.stringify`.
  - Surface JS errors / timeouts / memory-limit violations as
    ToolResult{status='error'} — never raise out of the tool call.
  - Sandbox: time limit and memory limit MUST be applied to the QuickJS
    context so a runaway tool body can't consume the Lambda's 30s budget
    or exhaust memory.
"""
import pytest
from unittest.mock import MagicMock, patch


INLINE_TOOL_DEF = {
    'tool_id': 'inline-example',
    'name': 'inline-example',
    'execution_type': 'inline',
    'code': (
        "function random(event, params){\n"
        "    let min = params.min;\n"
        "    let max = params.max;\n"
        "    let range = max - min;\n"
        "    let val = (Math.random() * range) + min;\n"
        "    let factor = Math.pow(10, params.precision ?? 0);\n"
        "    return Math.round(val * factor) / factor;\n"
        "}"
    ),
    'function_schema': [{
        'name': 'random-number',
        'description': 'Creates an random number between min and max.',
        'parameters': {
            'min': {'type': 'number', 'description': 'min', 'required': True},
            'max': {'type': 'number', 'description': 'max', 'required': True},
            'precision': {'type': 'number', 'description': 'decimals', 'required': False},
        },
    }],
}


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

class TestExecutionTypeDispatch:

    def test_build_strands_tools_dispatches_inline_type(self):
        """agent_loader.build_strands_tools() must route execution_type='inline' to inline loader."""
        from agent_loader import build_strands_tools  # noqa: PLC0415

        with patch('agent_loader._build_inline_tools') as mock_inline, \
             patch('agent_loader._build_lambda_tool') as mock_lam:
            mock_inline.return_value = []
            mock_lam.return_value = []

            build_strands_tools(
                tool_defs=[
                    INLINE_TOOL_DEF,
                    {'tool_id': 'x', 'execution_type': 'lambda', 'lambda_arn': 'arn:...'},
                ],
                session_attributes={},
            )
            assert mock_inline.called, 'inline dispatch must call inline loader'

    def test_inline_does_not_warn_unknown_execution_type(self, caplog):
        """Once inline is implemented, the 'Unknown execution_type' warning must NOT fire for inline tools."""
        import logging
        from agent_loader import build_strands_tools  # noqa: PLC0415

        with caplog.at_level(logging.WARNING, logger='agent_loader'):
            build_strands_tools(tool_defs=[INLINE_TOOL_DEF], session_attributes={})
        # No "Unknown execution_type 'inline'" warning should appear.
        assert not any(
            "Unknown execution_type 'inline'" in rec.getMessage() for rec in caplog.records
        ), 'inline must be a first-class execution_type, not a skipped-unknown warning'


# ---------------------------------------------------------------------------
# Tool surfacing
# ---------------------------------------------------------------------------

class TestInlineToolSurfacing:

    def test_one_tool_per_function_schema_entry(self):
        """Same shape as the Lambda path: one PythonAgentTool per function_schema entry."""
        from inline_tools import build_inline_tools  # noqa: PLC0415

        tools = build_inline_tools(INLINE_TOOL_DEF)
        assert len(tools) == 1
        t = tools[0]
        # Each surfaced tool must have the function_schema name the agent can invoke
        name = getattr(t, 'tool_name', None) or getattr(t, 'name', None)
        assert name == 'random-number'

    def test_tool_spec_carries_input_schema(self):
        """The inputSchema must be built from function_schema parameters so the model can call it correctly."""
        from inline_tools import build_inline_tools  # noqa: PLC0415

        tools = build_inline_tools(INLINE_TOOL_DEF)
        spec = getattr(tools[0], 'tool_spec', None) or {}
        schema = spec.get('inputSchema', {}).get('json', {})
        assert schema.get('type') == 'object'
        assert set(schema.get('properties', {}).keys()) == {'min', 'max', 'precision'}
        assert set(schema.get('required', [])) == {'min', 'max'}

    def test_missing_code_field_yields_no_tools(self):
        """If the tool def has execution_type='inline' but no `code`, skip gracefully."""
        from inline_tools import build_inline_tools  # noqa: PLC0415
        bad = {**INLINE_TOOL_DEF, 'code': ''}
        assert build_inline_tools(bad) == []


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

class TestInlineToolExecution:

    def test_happy_path_returns_function_result_as_text(self):
        """Invoking the tool must evaluate the JS body, call the top-level function,
        and return the JS return value as ToolResult text content."""
        from inline_tools import build_inline_tools  # noqa: PLC0415

        tools = build_inline_tools(INLINE_TOOL_DEF)
        tool = tools[0]
        tool_func = getattr(tool, 'tool_func', None) or getattr(tool, '_tool_func', None)
        assert tool_func is not None

        result = tool_func(
            {'toolUseId': 'tu-1', 'input': {'min': 1, 'max': 100, 'precision': 0}},
        )
        assert result['status'] == 'success'
        text = result['content'][0]['text']
        # Result is a number serialized as a string — parse it back and assert range
        import json as _json
        try:
            val = _json.loads(text)
        except Exception:
            val = float(text)
        assert 1 <= val <= 100

    def test_js_exception_returns_error_status(self):
        """JS exceptions in the tool body must surface as ToolResult{status='error'}, not raise."""
        from inline_tools import build_inline_tools  # noqa: PLC0415

        bad = {
            **INLINE_TOOL_DEF,
            'code': "function random(event, params){ throw new Error('boom'); }",
        }
        tools = build_inline_tools(bad)
        result = tools[0].tool_func({'toolUseId': 'tu-err', 'input': {'min': 1, 'max': 2}})
        assert result['status'] == 'error'
        assert 'boom' in result['content'][0]['text'] or 'error' in result['content'][0]['text'].lower()

    def test_runaway_tool_is_time_limited(self):
        """A tool body that loops forever must be killed by the QuickJS time limit
        and surfaced as ToolResult{status='error'} — never stall the Lambda."""
        from inline_tools import build_inline_tools  # noqa: PLC0415

        runaway = {
            **INLINE_TOOL_DEF,
            'code': "function random(event, params){ while(true){} }",
        }
        tools = build_inline_tools(runaway)
        result = tools[0].tool_func({'toolUseId': 'tu-hang', 'input': {'min': 1, 'max': 2}})
        assert result['status'] == 'error'

    def test_params_are_marshaled_to_js_object(self):
        """Params passed to tool_func['input'] must reach the JS function as an object
        (not a JSON string) the function can read via dot/bracket access."""
        from inline_tools import build_inline_tools  # noqa: PLC0415

        echo = {
            **INLINE_TOOL_DEF,
            'code': (
                "function random(event, params){ "
                "return params.min + '-' + params.max + '-' + (params.precision ?? 0); }"
            ),
        }
        tools = build_inline_tools(echo)
        result = tools[0].tool_func({'toolUseId': 't', 'input': {'min': 7, 'max': 9, 'precision': 2}})
        assert result['status'] == 'success'
        assert '7-9-2' in result['content'][0]['text']

    def test_event_carries_session_context(self):
        """The JS `event` parameter must include sessionId so inline tools that key
        off session context (matching TS processInlineTool behavior) work unchanged."""
        from inline_tools import build_inline_tools  # noqa: PLC0415

        tools = build_inline_tools(
            {
                **INLINE_TOOL_DEF,
                'code': "function random(event, params){ return event.sessionId; }",
            },
            session_id='sess-abc',
        )
        result = tools[0].tool_func({'toolUseId': 't', 'input': {'min': 1, 'max': 2}})
        assert result['status'] == 'success'
        assert 'sess-abc' in result['content'][0]['text']


# ---------------------------------------------------------------------------
# Trace emission
# ---------------------------------------------------------------------------

class TestInlineTraceCallback:

    def test_trace_callback_receives_observation(self):
        """trace_callback must be invoked with the tool name and result text,
        same contract as the Lambda path, so the frontend trace panel works."""
        from inline_tools import build_inline_tools  # noqa: PLC0415

        seen = []
        def cb(name, body, **kw):
            seen.append((name, body, kw))

        tools = build_inline_tools(INLINE_TOOL_DEF, trace_callback=cb)
        tools[0].tool_func({'toolUseId': 't', 'input': {'min': 1, 'max': 2, 'precision': 0}})
        # At least one callback must carry a non-None body (the observation).
        assert any(body is not None for (_name, body, _kw) in seen)
