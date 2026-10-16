import json
import logging
import threading
import time
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

import handler
from collaborator_tools import build_tool_mode_collaborators
from tests.agent_doubles import assert_primary_path, streaming_agent_cls
from tests.hook_defaults import base_hooks, override_hooks  # noqa: F401
from tests.test_collaborator_tools import config
from tests.test_response_hooks import AGENT_DEF, _ctx, _event

pytestmark = pytest.mark.usefixtures('base_hooks')

LLAMA_MODEL_ID = 'us.meta.llama3-3-70b-instruct-v1:0'
CLAUDE_MODEL_ID = 'us.anthropic.claude-sonnet-4-6'
ERROR_TEXT = "I'm sorry, I encountered an error processing your request."


def _system_cache_points(model) -> int:
    request = model._format_request(
        [{'role': 'user', 'content': [{'text': 'hi'}]}],
        None,
        [{'text': 'You are helpful.'}],
    )
    return sum('cachePoint' in block for block in request.get('system') or [])


def test_non_caching_model_gets_no_system_cache_point(monkeypatch):
    for env_name in handler.INFERENCE_PROFILE_ENV_BY_MODEL_ID.values():
        monkeypatch.delenv(env_name, raising=False)
    model = handler._build_bedrock_model(LLAMA_MODEL_ID)
    assert _system_cache_points(model) == 0


def test_claude_model_still_gets_system_cache_point(monkeypatch):
    for env_name in handler.INFERENCE_PROFILE_ENV_BY_MODEL_ID.values():
        monkeypatch.delenv(env_name, raising=False)
    model = handler._build_bedrock_model(CLAUDE_MODEL_ID)
    assert _system_cache_points(model) == 1


def test_merge_usage_adds_numeric_values_and_starts_missing_keys_at_zero():
    base = {'inputTokens': 10, 'totalCost': Decimal('0.5'), 'label': 'x'}
    extra = {'inputTokens': 5, 'outputTokens': 3, 'totalCost': Decimal('0.25'), 'label': 'y'}
    merged = handler._merge_usage(base, extra)
    assert merged == {
        'inputTokens': 15, 'outputTokens': 3, 'totalCost': Decimal('0.75'), 'label': 'x',
    }
    assert base['inputTokens'] == 10


USAGE = {'inputTokens': 7, 'outputTokens': 3, 'cacheReadInputTokens': 2}


class _UsageResult:
    def __init__(self, text):
        self._text = text
        self.metrics = SimpleNamespace(accumulated_usage=USAGE)

    def __str__(self):
        return self._text


def _build(result_text, *, usage_callback=None, deadline_monotonic=None,
           configs=None, reserved=frozenset(), agent_cls=None, timeout_config=None):
    calls = []

    class FakeAgent:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def __call__(self, prompt, **_kwargs):
            calls.append(prompt)
            return _UsageResult(result_text)

        def cancel(self):
            pass

    tools = build_tool_mode_collaborators(
        configs or [config(**(timeout_config or {}))],
        load_agent_definition=lambda _id: {
            'agent_id': 'example-specialist',
            'base_prompt': 'You are the example specialist.',
            'foundation_model': 'model-1',
            'tool_ids': [],
        },
        load_tool_definitions=lambda _ids: [],
        build_tools=MagicMock(return_value=[]),
        build_model=lambda model_id: f'model:{model_id}',
        session_id='session-1',
        current_user_text='hello',
        session_attributes={},
        prompt_session_attributes={},
        history_messages=[],
        usage_callback=usage_callback,
        deadline_monotonic=deadline_monotonic,
        reserved_tool_names=reserved,
        agent_factory=agent_cls or FakeAgent,
    )
    return tools, calls


def _invoke(tool):
    return tool._tool_func({'toolUseId': 't1', 'input': {'task': 'go'}})


def test_usage_callback_receives_specialist_usage_on_success():
    seen = []
    tools, _ = _build(
        '{"kind":"PLAN"}', usage_callback=lambda m, u: seen.append((m, u)))
    assert _invoke(tools[0])['status'] == 'success'
    assert seen == [('model-1', USAGE)]


def test_usage_callback_receives_usage_when_output_fails_validation():
    seen = []
    tools, _ = _build(
        '{"kind":"NOT_A_KIND"}', usage_callback=lambda m, u: seen.append((m, u)))
    assert _invoke(tools[0])['status'] == 'error'
    assert seen == [('model-1', USAGE)]


def test_usage_callback_failure_does_not_break_the_tool():
    def boom(_m, _u):
        raise RuntimeError('nope')

    tools, _ = _build('{"kind":"PLAN"}', usage_callback=boom)
    assert _invoke(tools[0])['status'] == 'success'


def test_passed_deadline_skips_specialist_and_fails_with_timeout():
    codes = []
    calls = []

    class Recorder:
        def __call__(self, code):
            codes.append(code)

    tools = build_tool_mode_collaborators(
        [config()],
        load_agent_definition=lambda _id: {
            'base_prompt': 'p', 'foundation_model': 'model-1', 'tool_ids': []},
        load_tool_definitions=lambda _ids: [],
        build_tools=MagicMock(return_value=[]),
        build_model=lambda model_id: model_id,
        session_id='s', current_user_text='hi', session_attributes={},
        prompt_session_attributes={}, history_messages=[],
        failure_callback=Recorder(),
        deadline_monotonic=time.monotonic() - 1,
        agent_factory=lambda **kw: calls.append(kw) or MagicMock(
            side_effect=AssertionError('specialist must not run')),
    )
    result = _invoke(tools[0])
    assert result['status'] == 'error'
    assert 'COLLABORATOR_TIMEOUT' in json.dumps(result)
    assert codes == ['COLLABORATOR_TIMEOUT']


def test_near_deadline_clamps_timer_and_times_out_slow_specialist():
    release = threading.Event()
    timer_args = []
    real_timer = threading.Timer

    def recording_timer(interval, fn, *a, **kw):
        timer_args.append(interval)
        return real_timer(interval, fn, *a, **kw)

    class SlowAgent:
        def __init__(self, **kwargs):
            pass

        def __call__(self, prompt, **kwargs):
            release.wait(5)
            return _UsageResult('{"kind":"PLAN"}')

        def cancel(self):
            release.set()

    tools, _ = _build(
        '', deadline_monotonic=time.monotonic() + 0.2, agent_cls=SlowAgent,
        timeout_config={'timeoutSeconds': 120})
    started = time.monotonic()
    with patch('collaborator_tools.threading.Timer', recording_timer):
        result = _invoke(tools[0])
    assert time.monotonic() - started < 1.5
    assert timer_args and timer_args[0] <= 0.2
    assert 'COLLABORATOR_TIMEOUT' in json.dumps(result)


def _names(tools):
    return [t.tool_name for t in tools]


def test_duplicate_normalized_name_builds_one_tool():
    tools, _ = _build('', configs=[
        config(agentId='a-b', toolName=None), config(agentId='a_b', toolName=None)])
    assert _names(tools) == ['consult_a_b']


def test_reserved_name_is_skipped():
    tools, _ = _build('', configs=[config(toolName='taken')], reserved={'taken'})
    assert tools == []


def test_long_agent_id_name_is_at_most_64_chars():
    tools, _ = _build('', configs=[config(agentId='x' * 200, toolName=None)])
    assert len(tools) == 1
    assert len(tools[0].tool_name) <= 64


def test_explicit_invalid_name_is_skipped():
    tools, _ = _build('', configs=[config(toolName='bad name!')])
    assert tools == []


def _run_stream_handler(agent_cls):
    mock_ddb = MagicMock()
    with (
        patch('boto3.resource', return_value=mock_ddb),
        patch('handler.Agent', agent_cls),
        patch('handler.load_agent', return_value=AGENT_DEF),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
        patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
        patch('handler.get_messages', return_value=[]),
    ):
        return handler.handler(_event(), _ctx())


TOOL_USE_EVENT = {
    'message': {'role': 'assistant', 'content': [{'toolUse': {'name': 't', 'toolUseId': '1'}}]},
}


def test_failure_after_tool_use_does_not_rerun_synchronously():
    sync_calls = []

    class _Agent:
        def __init__(self, **kwargs):
            pass

        async def stream_async(self, *_a, **_k):
            yield TOOL_USE_EVENT
            raise RuntimeError('boom')

        def __call__(self, *a, **k):
            sync_calls.append(a)
            return 'rerun'

    result = _run_stream_handler(_Agent)
    assert sync_calls == []
    assert ERROR_TEXT in result['body']


def test_missing_result_after_tool_use_does_not_rerun_synchronously():
    sync_calls = []

    class _Agent:
        def __init__(self, **kwargs):
            pass

        async def stream_async(self, *_a, **_k):
            yield TOOL_USE_EVENT

        def __call__(self, *a, **k):
            sync_calls.append(a)
            return 'rerun'

    result = _run_stream_handler(_Agent)
    assert sync_calls == []
    assert ERROR_TEXT in result['body']


def test_failure_before_tool_use_still_falls_back_to_sync():
    class _Agent:
        def __init__(self, **kwargs):
            self.callback = kwargs['callback_handler']

        async def stream_async(self, *_a, **_k):
            raise RuntimeError('boom')
            yield

        def __call__(self, *a, **k):
            self.callback(data='Sync answer.')
            return 'Sync answer.'

    result = _run_stream_handler(_Agent)
    assert 'Sync answer.' in result['body']


def test_finalize_rewrite_of_streamed_turn_logs_warning(override_hooks, caplog):
    from custom_hooks_base import FinalizeResult
    override_hooks.finalize_response = lambda final, ctx: FinalizeResult(text='Rewritten.')
    agent_cls, _ = streaming_agent_cls('Plain answer.')
    with caplog.at_level(logging.WARNING):
        _run_stream_handler(agent_cls)
    assert 'finalize_response changed a live-streamed turn' in caplog.text
    assert_primary_path(caplog)
