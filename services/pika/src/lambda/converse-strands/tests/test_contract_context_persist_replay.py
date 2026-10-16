"""Integration tests: context XML persistence and LLM history replay.

A repeat delivery omits <data> from the live prompt, so the first delivery's body is
persisted on the user message and replayed from there.
"""
import json
from unittest.mock import MagicMock, patch

import pytest

from tests.hook_defaults import base_hooks  # noqa: F401

pytestmark = pytest.mark.usefixtures('base_hooks')

MOCK_AGENT_DEF = {
    'agent_id': 'agent-insights',
    'base_prompt': 'Be helpful.',
    'tool_ids': [],
}

SOURCE_ID = 'example.context.order-status'
BODY = {'orderId': 'ORD-123', 'status': 'ON_HOLD', 'field': 'package_height'}
HASH_V1 = 'hash-v1'


def _context_item():
    return {
        'id': SOURCE_ID,
        'description': 'The order the user asked about',
        'context': BODY,
        'contentHash': HASH_V1,
        'origin': 'auto',
    }


def _ledger():
    return {
        SOURCE_ID: {
            'source_id': SOURCE_ID,
            'message_ids': ['sess:1000'],
            'content_hash': HASH_V1,
            'last_sent_at': '2026-07-28T00:00:00+00:00',
            'origin': 'auto',
        }
    }


def _make_event(context_items=None, session_id='sess-replay', message='What is wrong?'):
    body = {
        'agentId': 'agent-insights',
        'userId': 'user-001',
        'sessionId': session_id,
        'message': message,
    }
    if context_items is not None:
        body['llmContextItems'] = context_items
    return {'body': json.dumps(body)}


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


class TestContextPersistReplayIntegration:
    def test_first_delivery_persists_llm_context_xml_separate_from_user_message(self):
        import handler as h  # noqa: PLC0415

        event = _make_event(context_items=[_context_item()])
        mock_ddb = MagicMock()
        ctx = _make_ctx()
        captured_agent = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=captured_agent)),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.update_session_sent_contexts'),
        ):
            captured_agent.return_value = 'ok'
            result = h.handler(event, ctx)

        assert result['statusCode'] == 200
        user_items = [
            call.kwargs.get('Item', call.args[1] if len(call.args) > 1 else {})
            for call in mock_ddb.Table.return_value.put_item.call_args_list
        ]
        user_messages = [
            item for item in user_items
            if item.get('source') == 'user' and item.get('message') == 'What is wrong?'
        ]
        assert len(user_messages) == 1
        user_msg = user_messages[0]
        assert user_msg['message'] == 'What is wrong?'
        assert '<additional-context>' in user_msg['llm_context_xml']
        assert 'package_height' in user_msg['llm_context_xml']
        assert '<additional-context>' not in user_msg['message']

    def test_repeat_turn_replays_first_delivery_body_from_persisted_llm_context_xml(self):
        from context_items import LLM_CONTEXT_XML_ATTR, message_text_for_llm_replay  # noqa: PLC0415

        first_context_xml = (
            '<additional-context>\n'
            '<context id="example.context.order-status" index="1" delivery="first">\n'
            '<description>Listing error</description>\n'
            '<data>\n{"orderId": "ORD-123"}\n</data>\n'
            '</context>\n</additional-context>'
        )
        prior_user = {
            'user_id': 'user-001',
            'message_id': 'sess-replay:1000',
            'session_id': 'sess-replay',
            'message': 'What is wrong?',
            'source': 'user',
            LLM_CONTEXT_XML_ATTR: first_context_xml,
        }
        replay_text = message_text_for_llm_replay(prior_user)
        assert 'package_height' not in replay_text  # first fixture used package_height only in live test
        assert '{"orderId": "ORD-123"}' in replay_text
        assert '<additional-context>' in replay_text
        assert replay_text.startswith('What is wrong?')

        import handler as h  # noqa: PLC0415

        event = _make_event(context_items=[_context_item()])
        mock_ddb = MagicMock()
        ctx = _make_ctx()
        captured_messages = []

        def _capture_agent(*_args, **kwargs):
            captured_messages.extend(kwargs.get('messages') or _args[1] if len(_args) > 1 else [])
            agent = MagicMock()
            agent.return_value = 'ok'
            return agent

        session_item = {'user_id': 'user-001', 'session_id': 'sess-replay', 'sent_contexts': _ledger()}

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent') as MockAgent,
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[prior_user]),
            patch('handler.ensure_session', return_value=session_item),
            patch('handler.update_session_sent_contexts'),
        ):
            mock_agent = MagicMock(return_value='ok')
            MockAgent.side_effect = lambda **kwargs: mock_agent
            result = h.handler(event, ctx)

        assert result['statusCode'] == 200
        strands_messages = MockAgent.call_args.kwargs['messages']
        user_turns = [m for m in strands_messages if m['role'] == 'user']
        assert len(user_turns) == 1
        replayed = user_turns[0]['content'][0]['text']
        assert '{"orderId": "ORD-123"}' in replayed
        assert '<additional-context>' in replayed

        turn2_user = [
            call.kwargs.get('Item', {})
            for call in mock_ddb.Table.return_value.put_item.call_args_list
            if call.kwargs.get('Item', {}).get('source') == 'user'
        ][0]
        assert turn2_user['message'] == 'What is wrong?'
        assert '<data-omitted' in turn2_user['llm_context_xml']

    def test_oversized_context_skips_persist_and_sent_contexts_ledger(self):
        import handler as h  # noqa: PLC0415

        huge_item = _context_item()
        huge_item['context'] = {'blob': 'x' * 500_000}
        event = _make_event(context_items=[huge_item])
        mock_ddb = MagicMock()
        ctx = _make_ctx()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent') as MockAgent,
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.update_session_sent_contexts') as mock_update,
        ):
            mock_agent = MagicMock(return_value='ok')
            MockAgent.return_value = mock_agent
            result = h.handler(event, ctx)

        assert result['statusCode'] == 200
        user_items = [
            call.kwargs.get('Item', {})
            for call in mock_ddb.Table.return_value.put_item.call_args_list
        ]
        user_msg = next(
            item for item in user_items
            if item.get('source') == 'user' and item.get('message') == 'What is wrong?'
        )
        assert 'llm_context_xml' not in user_msg
        assert not mock_update.called
        agent_turn = mock_agent.call_args[0][0]
        assert '<additional-context>' in agent_turn