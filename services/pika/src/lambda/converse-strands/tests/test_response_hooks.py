"""The consumer hooks seam wired into the handler's request and response path."""
import json
from unittest.mock import MagicMock, patch

from context_items import LLM_CORRECTION_ATTR
from custom_hooks_base import HOOK_ERROR_MESSAGE, CorrectionResult, FinalizeResult
from handler import DEFAULT_MODEL_ID
from tests.agent_doubles import assert_primary_path, streaming_agent_cls
from tests.hook_defaults import base_hooks, override_hooks  # noqa: F401

AGENT_DEF = {
    'agent_id': 'agent-hooks',
    'base_prompt': 'Be helpful.',
    'foundation_model': DEFAULT_MODEL_ID,
    'tool_ids': [],
}
VERIFY_DEF = {**AGENT_DEF, 'verification': {'enabled': True}}
VERIFY_FEATURES = {'verifyResponse': {'autoRepromptThreshold': 'C'}, 'traces': {'enabled': True}}


def _event(features=None):
    body = {
        'agentId': 'agent-hooks',
        'userId': 'user-001',
        'sessionId': 'sess-001',
        'message': 'Tell me about robots.',
    }
    if features is not None:
        body['features'] = features
    return {'body': json.dumps(body)}


def _ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _run_handler(agent_cls, agent_def=AGENT_DEF, features=None, verify_results=()):
    mock_ddb = MagicMock()
    stored = []
    mock_ddb.Table.return_value.put_item.side_effect = (
        lambda **kw: stored.append(kw.get('Item', {}))
    )

    import handler as h  # noqa: PLC0415

    with (
        patch('boto3.resource', return_value=mock_ddb),
        patch('handler.Agent', agent_cls),
        patch('handler.load_agent', return_value=agent_def),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
        patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
        patch('handler.get_messages', return_value=[]),
        patch('handler.verify_response', side_effect=list(verify_results)) as verify_mock,
    ):
        result = h.handler(_event(features), _ctx())
    return result, stored, verify_mock


def assistant(stored):
    return [m for m in stored if m.get('source') == 'assistant']


def _raises(*_args, **_kwargs):
    raise RuntimeError('boom')


def test_defaults_leave_the_answer_unchanged(base_hooks, caplog):
    agent_cls, _created = streaming_agent_cls('Plain answer.')

    result, stored, _ = _run_handler(agent_cls)

    assert result['body'].count('Plain answer.') == 1
    assert assistant(stored)[-1]['message'] == 'Plain answer.'
    assert_primary_path(caplog)


def test_begin_request_state_reaches_finalize(override_hooks, caplog):
    recorded = []

    def finalize_response(final, ctx):
        recorded.append((ctx.state, final.text, final.buffered))
        return FinalizeResult(text='Rewritten.', force_write=True)

    override_hooks.begin_request = lambda ctx: {'k': 'v'}
    override_hooks.finalize_response = finalize_response
    agent_cls, _created = streaming_agent_cls('Plain answer.')

    result, stored, _ = _run_handler(agent_cls)

    assert recorded == [({'k': 'v'}, 'Plain answer.', False)]
    assert result['body'].count('Rewritten.') == 1
    assert assistant(stored)[-1]['message'] == 'Rewritten.'
    assert_primary_path(caplog)


def test_should_buffer_hook_suppresses_live_tokens(override_hooks, caplog):
    override_hooks.should_buffer_final_response = lambda ctx: True
    agent_cls, created = streaming_agent_cls('Plain answer.', narration=('Thinking...',))

    result, _stored, _ = _run_handler(agent_cls)

    assert created[0].init_kwargs['callback_handler'] is None
    assert 'Thinking...' not in result['body']
    assert result['body'].count('Plain answer.') == 1
    assert_primary_path(caplog)


def test_fail_closed_buffers_every_turn(override_hooks, caplog):
    override_hooks.HOOKS_FAIL_CLOSED = True
    agent_cls, created = streaming_agent_cls('Plain answer.', narration=('Thinking...',))

    result, _stored, _ = _run_handler(agent_cls)

    assert created[0].init_kwargs['callback_handler'] is None
    assert 'Thinking...' not in result['body']
    assert result['body'].count('Plain answer.') == 1
    assert_primary_path(caplog)


def test_begin_request_error_fail_open_continues(override_hooks, caplog):
    recorded = []

    def finalize_response(final, ctx):
        recorded.append(ctx.state)
        return FinalizeResult(text=final.text)

    override_hooks.begin_request = _raises
    override_hooks.finalize_response = finalize_response
    agent_cls, _created = streaming_agent_cls('Plain answer.')

    _result, stored, _ = _run_handler(agent_cls)

    assert recorded == [None]
    assert assistant(stored)[-1]['message'] == 'Plain answer.'
    assert_primary_path(caplog)


def test_begin_request_error_fail_closed_ends_turn(override_hooks):
    override_hooks.HOOKS_FAIL_CLOSED = True
    override_hooks.begin_request = _raises
    agent_cls, created = streaming_agent_cls('Plain answer.')

    result, stored, _ = _run_handler(agent_cls)

    assert created == []
    assert HOOK_ERROR_MESSAGE in result['body']
    assert '<pika-metadata>' in result['body']
    assistants = assistant(stored)
    assert len(assistants) == 1
    assert assistants[0]['message'] == HOOK_ERROR_MESSAGE
    user_item = next(m for m in stored if m.get('source') == 'user' and 'message_id' in m)
    assert (int(assistants[0]['message_id'].split(':')[-1])
            > int(user_item['message_id'].split(':')[-1]))


def test_finalize_error_fail_open_keeps_model_text(override_hooks, caplog):
    override_hooks.finalize_response = _raises
    agent_cls, _created = streaming_agent_cls('Plain answer.')

    _result, stored, _ = _run_handler(agent_cls)

    assert assistant(stored)[-1]['message'] == 'Plain answer.'
    assert_primary_path(caplog)


def test_finalize_error_fail_closed_writes_error_and_skips_verification(override_hooks, caplog):
    override_hooks.HOOKS_FAIL_CLOSED = True
    override_hooks.finalize_response = _raises
    agent_cls, _created = streaming_agent_cls('Plain answer.')

    result, stored, verify_mock = _run_handler(
        agent_cls, VERIFY_DEF, VERIFY_FEATURES, verify_results=[])

    assert result['body'].count(HOOK_ERROR_MESSAGE) == 1
    assert 'Plain answer.' not in result['body']
    assert assistant(stored)[-1]['message'] == HOOK_ERROR_MESSAGE
    assert verify_mock.call_count == 0
    assert_primary_path(caplog)


def test_skip_verification_result_skips_verification(override_hooks, caplog):
    override_hooks.finalize_response = (
        lambda final, ctx: FinalizeResult(text=final.text, skip_verification=True))
    agent_cls, _created = streaming_agent_cls('Plain answer.')

    _result, stored, verify_mock = _run_handler(
        agent_cls, VERIFY_DEF, VERIFY_FEATURES, verify_results=[])

    assert verify_mock.call_count == 0
    assert 'verifications' not in assistant(stored)[-1]
    assert_primary_path(caplog)


def test_filter_correction_text_and_replay(override_hooks, caplog):
    override_hooks.filter_correction = (
        lambda text, ctx: CorrectionResult(text='Filtered.', replay=False))
    agent_cls, _created = streaming_agent_cls('Main.', corrections=['Raw correction.'])

    result, stored, verify_mock = _run_handler(
        agent_cls, VERIFY_DEF, VERIFY_FEATURES,
        verify_results=[{'classification': 'C', 'explanation': 'x'},
                        {'classification': 'A', 'explanation': 'y'}])

    assert '[Correction] Filtered.' in result['body']
    assert 'Raw correction.' not in result['body']
    assert verify_mock.call_args_list[1].args[1] == 'Main.\n\nFiltered.'
    assert LLM_CORRECTION_ATTR not in assistant(stored)[-1]
    assert_primary_path(caplog)


def test_filter_correction_error_fail_closed_drops_correction(override_hooks, caplog):
    override_hooks.HOOKS_FAIL_CLOSED = True
    override_hooks.filter_correction = _raises
    agent_cls, _created = streaming_agent_cls('Main.', corrections=['Raw correction.'])

    result, stored, verify_mock = _run_handler(
        agent_cls, VERIFY_DEF, VERIFY_FEATURES,
        verify_results=[{'classification': 'C', 'explanation': 'x'},
                        {'classification': 'A', 'explanation': 'y'}])

    assert '[Correction]' not in result['body']
    assert verify_mock.call_count == 1
    assert LLM_CORRECTION_ATTR not in assistant(stored)[-1]
    assert assistant(stored)[-1]['verifications'] == {'main': 'C'}
    assert_primary_path(caplog)


def test_filter_correction_error_fail_open_uses_raw_text(override_hooks, caplog):
    override_hooks.filter_correction = _raises
    agent_cls, _created = streaming_agent_cls('Main.', corrections=['Raw correction.'])

    result, stored, _ = _run_handler(
        agent_cls, VERIFY_DEF, VERIFY_FEATURES,
        verify_results=[{'classification': 'C', 'explanation': 'x'},
                        {'classification': 'A', 'explanation': 'y'}])

    assert '[Correction] Raw correction.' in result['body']
    assert assistant(stored)[-1][LLM_CORRECTION_ATTR] == 'Raw correction.'
    assert_primary_path(caplog)
