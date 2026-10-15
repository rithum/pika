"""The verifyResponse correction is persisted on the assistant turn and replayed on later turns."""
import json
import pytest
from unittest.mock import MagicMock, patch

from context_items import LLM_CONTEXT_XML_ATTR, LLM_CORRECTION_ATTR, message_text_for_llm_replay
from handler import DEFAULT_MODEL_ID
from tests.agent_doubles import assert_primary_path, streaming_agent_cls
from tests.hook_defaults import base_hooks  # noqa: F401

pytestmark = pytest.mark.usefixtures('base_hooks')


MOCK_AGENT_DEF = {
    'agent_id': 'agent-verify',
    'base_prompt': 'Be helpful.',
    'foundation_model': DEFAULT_MODEL_ID,
    'tool_ids': [],
    'verification': {'enabled': True},
}


def _event(features=None):
    body = {
        'agentId': 'agent-verify',
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


def _run_handler(event, ctx, agent_def, agent_cls, verify_results):
    mock_ddb = MagicMock()
    stored_messages = []
    mock_ddb.Table.return_value.put_item.side_effect = (
        lambda **kw: stored_messages.append(kw.get('Item', {}))
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
        patch('handler.verify_response', side_effect=verify_results) as verify_mock,
    ):
        result = h.handler(event, ctx)

    assistant_msgs = [m for m in stored_messages if m.get('source') == 'assistant']
    return result, assistant_msgs, verify_mock


class TestReplayText:
    def test_assistant_correction_is_appended_for_replay(self):
        msg = {'source': 'assistant', 'message': 'Main.', LLM_CORRECTION_ATTR: 'Assumption: X.'}
        assert message_text_for_llm_replay(msg) == 'Main.\n\nAssumption: X.'

    def test_no_correction_returns_message_only(self):
        assert message_text_for_llm_replay({'source': 'assistant', 'message': 'Main.'}) == 'Main.'

    def test_user_context_xml_still_appended(self):
        msg = {'source': 'user', 'message': 'Q?', LLM_CONTEXT_XML_ATTR: '<ctx/>'}
        assert message_text_for_llm_replay(msg) == 'Q?\n\n<ctx/>'


class TestCorrectionPersistence:
    def test_correction_persisted_on_assistant_turn_not_in_message(self, caplog):
        main_answer = 'Main answer with an unstated assumption.'
        correction = 'Assumption: robots need power.'
        agent_cls, _created = streaming_agent_cls(main_answer, corrections=[correction])

        result, assistant_msgs, verify_mock = _run_handler(
            _event(features={'verifyResponse': {'autoRepromptThreshold': 'C'}}),
            _ctx(),
            MOCK_AGENT_DEF,
            agent_cls,
            verify_results=[
                {'classification': 'C', 'explanation': 'Assumptions not stated.'},
                {'classification': 'A', 'explanation': 'Now stated.'},
            ],
        )

        assert result['statusCode'] == 200
        assert assistant_msgs[-1]['message'] == main_answer
        assert assistant_msgs[-1][LLM_CORRECTION_ATTR] == correction
        assert_primary_path(caplog)

    def test_no_reprompt_leaves_no_correction_attr(self, caplog):
        agent_cls, _created = streaming_agent_cls('Main answer.')

        result, assistant_msgs, verify_mock = _run_handler(
            _event(features={'verifyResponse': {'autoRepromptThreshold': 'C'}}),
            _ctx(),
            MOCK_AGENT_DEF,
            agent_cls,
            verify_results=[{'classification': 'B', 'explanation': 'Assumption stated.'}],
        )

        assert result['statusCode'] == 200
        assert LLM_CORRECTION_ATTR not in assistant_msgs[-1]
        assert_primary_path(caplog)


class TestCorrectionReplayedNextTurn:
    def test_history_replay_includes_prior_correction(self):
        prior_messages = [
            {
                'source': 'user',
                'message': 'Tell me about robots.',
                'message_id': 'sess-001:1',
                'timestamp': '2026-09-01T00:00:00Z',
            },
            {
                'source': 'assistant',
                'message': 'Robots need power.',
                LLM_CORRECTION_ATTR: 'Assumption: mains power.',
                'message_id': 'sess-001:2',
                'timestamp': '2026-09-01T00:00:01Z',
            },
        ]
        agent_def = {**MOCK_AGENT_DEF, 'verification': {'enabled': False}}
        agent_cls, created = streaming_agent_cls('New answer.')
        mock_ddb = MagicMock()

        import handler as h  # noqa: PLC0415

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', agent_cls),
            patch('handler.load_agent', return_value=agent_def),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=prior_messages),
        ):
            result = h.handler(_event(), _ctx())

        assert result['statusCode'] == 200
        agent_kwargs = created[0].init_kwargs
        assert 'messages' in agent_kwargs, (
            f"history is not passed to Agent(...) as a 'messages' kwarg; "
            f"got kwargs: {list(agent_kwargs.keys())}"
        )
        messages = agent_kwargs['messages']
        assistant_entry = next(m for m in messages if m['role'] == 'assistant')
        assert assistant_entry['content'][0]['text'] == 'Robots need power.\n\nAssumption: mains power.'
