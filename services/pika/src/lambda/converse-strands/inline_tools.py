"""Inline tool loading for Strands.

Contract: tests/test_contract_inline_tools.py

Runs JavaScript tool bodies (`execution_type='inline'`) in-process using an
embedded QuickJS runtime. Mirrors the TS converse Lambda's processInlineTool:
    eval('(' + tool.code + ')')  →  fn(event, params)

Design choices:
  - Fresh QuickJS context per invocation → no cross-tool global pollution.
  - JSON marshaling across the Python/JS boundary (quickjs doesn't support
    direct Python dict arguments as of v1.19).
  - Sandbox limits on every context (time + memory) so a runaway tool body
    can't eat the Lambda's 30s budget.
  - Errors never escape: JS exceptions, timeouts, and memory violations all
    surface as ToolResult{status='error'}.
"""
import json
import logging
import re
from typing import Any, Callable, Dict, List, Optional

import quickjs
from strands.tools.tools import PythonAgentTool

logger = logging.getLogger(__name__)


# Per-call sandbox limits. 5s gives ample headroom over any realistic tool body
# while staying well under the 30s Lambda ceiling. 64 MB matches what a normal
# arithmetic / string-shaping tool would ever need. Time limit is seconds
# (quickjs uses C clock() under the hood).
_TIME_LIMIT_SEC = 5.0
_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024

# Top-level `function NAME(` declaration — used to discover the callable name
# so inline tools keep working without a registry (matches TS eval behavior).
_FN_NAME_RE = re.compile(r'^\s*function\s+([A-Za-z_$][\w$]*)\s*\(', re.MULTILINE)


def _extract_fn_name(code: str) -> Optional[str]:
    m = _FN_NAME_RE.search(code)
    return m.group(1) if m else None


def _normalize_params(params) -> List[dict]:
    """DDB stores parameters as a map; tests pass lists. Normalize to list of dicts."""
    if isinstance(params, dict):
        return [{'name': name, **attrs} for name, attrs in params.items()]
    return params or []


def build_inline_tools(
    tool_def: dict,
    *,
    session_id: str = '',
    input_text: str = '',
    session_attributes: Optional[Dict[str, Any]] = None,
    prompt_session_attributes: Optional[Dict[str, Any]] = None,
    trace_callback: Optional[Callable] = None,
) -> List[PythonAgentTool]:
    """Build one PythonAgentTool per entry in function_schema.

    Returns [] (never raises) if the tool def is malformed so one bad inline
    tool record can't break loading the rest of the agent's tools.
    """
    code = (tool_def.get('code') or '').strip()
    if not code:
        logger.warning(
            f"Inline tool {tool_def.get('tool_id')!r} has no `code` field; skipping"
        )
        return []

    fn_name = _extract_fn_name(code)
    if not fn_name:
        logger.warning(
            f"Inline tool {tool_def.get('tool_id')!r} code has no top-level "
            f"`function NAME(...)` declaration; skipping"
        )
        return []

    function_schema = tool_def.get('function_schema') or []
    if not isinstance(function_schema, list):
        function_schema = []

    tools: List[PythonAgentTool] = []
    for func_def in function_schema:
        tools.append(_make_inline_tool(
            tool_id=tool_def['tool_id'],
            code=code,
            fn_name=fn_name,
            func_name=func_def['name'],
            func_desc=func_def.get('description') or ' ',
            params=_normalize_params(func_def.get('parameters')),
            session_id=session_id,
            input_text=input_text,
            session_attributes=session_attributes or {},
            prompt_session_attributes=prompt_session_attributes or {},
            trace_callback=trace_callback,
        ))
    return tools


def _make_inline_tool(
    *,
    tool_id: str,
    code: str,
    fn_name: str,
    func_name: str,
    func_desc: str,
    params: List[dict],
    session_id: str,
    input_text: str,
    session_attributes: Dict[str, Any],
    prompt_session_attributes: Dict[str, Any],
    trace_callback: Optional[Callable],
) -> PythonAgentTool:
    """Wrap one inline function as a PythonAgentTool.

    Every invocation gets a fresh QuickJS context so multi-tool tests can
    share a process without their global state colliding.
    """
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

    _code = code
    _fn_name = fn_name
    _tool_id = tool_id
    _func_name = func_name
    _session_id = session_id
    _input_text = input_text
    _session_attributes = session_attributes
    _prompt_session_attributes = prompt_session_attributes
    _trace_callback = trace_callback

    def tool_func(tool_use, **invocation_state):
        params_dict = tool_use.get('input', {}) or {}
        event_dict = {
            'sessionId': _session_id,
            'inputText': _input_text,
            'actionGroup': _tool_id,
            'function': _func_name,
            'sessionAttributes': _session_attributes,
            'promptSessionAttributes': _prompt_session_attributes,
        }

        logger.info(
            f"Invoking inline tool: {_tool_id}/{_func_name} "
            f"params={json.dumps(params_dict)}"
        )

        if _trace_callback:
            _trace_callback(_func_name, None, invocation_input={
                'actionGroupName': _func_name,
                'function': _func_name,
                'parameters': [
                    {'name': k, 'value': str(v)} for k, v in params_dict.items()
                ],
            })

        try:
            ctx = quickjs.Context()
            ctx.set_time_limit(_TIME_LIMIT_SEC)
            ctx.set_memory_limit(_MEMORY_LIMIT_BYTES)
            ctx.eval(_code)
            # Invoke via eval(expression) — the sandbox time/memory limits
            # are enforced on ctx.eval() but NOT on function handles obtained
            # via ctx.get(). We JSON-encode inputs twice: once to produce a
            # valid JS object literal (json.dumps(dict)) and again to wrap
            # that literal in a JS string literal for JSON.parse at runtime.
            event_lit = json.dumps(json.dumps(event_dict))
            params_lit = json.dumps(json.dumps(params_dict))
            expr = (
                f"JSON.stringify(({_fn_name})("
                f"JSON.parse({event_lit}),JSON.parse({params_lit})))"
            )
            raw = ctx.eval(expr)
            # Result might legitimately be `undefined` → JSON.stringify yields None.
            text = raw if raw is not None else ''
        except quickjs.JSException as e:
            err = f"Inline tool error ({_func_name}): {e}"
            logger.warning(err)
            if _trace_callback:
                _trace_callback(_func_name, err)
            return {
                'toolUseId': tool_use.get('toolUseId', ''),
                'status': 'error',
                'content': [{'text': err}],
            }
        except Exception as e:
            err = f"Inline tool error ({_func_name}): {type(e).__name__}: {e}"
            logger.exception(err)
            if _trace_callback:
                _trace_callback(_func_name, err)
            return {
                'toolUseId': tool_use.get('toolUseId', ''),
                'status': 'error',
                'content': [{'text': err}],
            }

        if _trace_callback:
            _trace_callback(_func_name, text)

        return {
            'toolUseId': tool_use.get('toolUseId', ''),
            'status': 'success',
            'content': [{'text': text}],
        }

    agent_tool = PythonAgentTool(
        tool_name=func_name,
        tool_spec=tool_spec,
        tool_func=tool_func,
    )
    # Expose the callable publicly so callers (and contract tests) can invoke
    # the tool directly without touching PythonAgentTool's `_tool_func` private.
    agent_tool.tool_func = tool_func
    return agent_tool
