"""Session account pin.

The account stored on the session is fixed for the conversation. A request whose account
differs gets a terminal response with no model or tool invocation; a matching or
account-less request proceeds with the pinned attributes.
"""
import json
import re
import pytest
from unittest.mock import patch, MagicMock

from decimal import Decimal

from chat_ddb import _has_account_context, account_id_of, pinned_account_fields
from custom_hooks_base import ACCOUNT_PIN_MISMATCH_MESSAGE
from tests.hook_defaults import base_hooks, override_hooks  # noqa: F401

pytestmark = pytest.mark.usefixtures('base_hooks')

MOCK_AGENT_DEF = {
    'agent_id': 'test-agent-001',
    'base_prompt': 'You are a test assistant.',
    'tool_ids': [],
}

PINNED_ACCOUNT = '000000001'
OTHER_ACCOUNT = '000000002'


def _parse_pika_metadata(body: str) -> dict:
    match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', body, re.DOTALL)
    assert match, f'No <pika-metadata> tag in body: {body!r}'
    return json.loads(match.group(1))


def _event(account_id: str | None) -> dict:
    body = {
        'agentId': 'test-agent-001',
        'userId': 'test-user-001',
        'sessionId': 'test-session-001',
        'message': 'show my recent orders',
    }
    if account_id is not None:
        body['customUserData'] = {'accountId': account_id}
    return {'body': json.dumps(body)}


def _session_item(account_id: str | None) -> dict:
    item = {
        'user_id': 'test-user-001',
        'session_id': 'test-session-001',
        'chat_app_id': 'example-app',
    }
    if account_id is not None:
        item['session_attributes'] = {'accountId': account_id, 'userId': 'test-user-001'}
    return item


def _run_handler(event, fake_context, session_item):
    """Drives the real handler with a mocked DDB resource seeded with `session_item`."""
    with patch('handler.dynamodb') as mock_ddb, \
            patch('handler.Agent') as MockAgent, \
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF) as mock_load_agent, \
            patch('handler.load_tools', return_value=[]), \
            patch('handler.build_strands_tools', return_value=[]):
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': session_item}

        mock_agent_instance = MagicMock()
        mock_agent_instance.return_value = 'agent ran'
        MockAgent.return_value = mock_agent_instance

        from handler import handler
        result = handler(event, fake_context)
        return result, MockAgent, mock_load_agent, mock_table


class TestChatDdbAccountHelpers:

    def test_account_id_of_prefers_first_present_field(self):
        assert account_id_of({'accountId': '111'}) == '111'
        assert account_id_of({'account_id': 222}) == '222'
        assert account_id_of({'accountId': ''}) is None
        assert account_id_of({}) is None
        assert account_id_of(None) is None

    def test_pinned_account_fields_stringifies_every_present_field(self):
        session = {'session_attributes': {'accountId': '111', 'account_id': 111, 'userId': 'u'}}
        assert pinned_account_fields(session) == {'accountId': '111', 'account_id': '111'}
        assert pinned_account_fields({'session_attributes': {}}) == {}
        assert pinned_account_fields({}) == {}
        assert pinned_account_fields(None) == {}

    def test_decimal_account_ids_are_read(self):
        # boto3 returns every DynamoDB number as Decimal.
        assert account_id_of({'accountId': Decimal('123456789')}) == '123456789'
        assert _has_account_context({'session_attributes': {'accountId': Decimal('123456789')}})
        assert _has_account_context({'accountId': Decimal('123456789')})
        assert pinned_account_fields(
            {'session_attributes': {'accountId': Decimal('123456789')}}
        ) == {'accountId': '123456789'}

    def test_pin_falls_back_to_top_level_account_fields(self):
        # A legacy session with its account id at the TOP LEVEL is one the
        # backfill declines to touch (_has_account_context sees it there), so
        # the pin must see it too or the guard is silently disabled.
        legacy = {'user_id': 'u', 'session_id': 's', 'accountId': PINNED_ACCOUNT}
        assert _has_account_context(legacy)
        assert pinned_account_fields(legacy) == {'accountId': PINNED_ACCOUNT}
        # session_attributes wins when it carries the field itself.
        both = {'accountId': OTHER_ACCOUNT, 'session_attributes': {'accountId': PINNED_ACCOUNT}}
        assert pinned_account_fields(both) == {'accountId': PINNED_ACCOUNT}


class TestAccountPinMismatch:

    def test_mismatch_returns_terminal_response_without_model_or_tools(self, fake_context):
        result, MockAgent, mock_load_agent, mock_table = _run_handler(
            _event(OTHER_ACCOUNT), fake_context, _session_item(PINNED_ACCOUNT))

        assert result['statusCode'] == 200
        body = result['body']

        # Zero model / tool invocation — the agent was never even loaded.
        assert MockAgent.call_count == 0
        assert mock_load_agent.call_count == 0

        assert ACCOUNT_PIN_MISMATCH_MESSAGE in body
        meta = _parse_pika_metadata(body)
        assert meta['assistantMessageId'].startswith('test-session-001:')
        assert meta['userMessageId'].startswith('test-session-001:')

        # No account ids leaked in the response text.
        assert PINNED_ACCOUNT not in body
        assert OTHER_ACCOUNT not in body

        # The terminal response is persisted as an assistant message.
        assistant_puts = [
            c.kwargs.get('Item') or c.args[0]
            for c in mock_table.put_item.call_args_list
            if (c.kwargs.get('Item') or (c.args[0] if c.args else {})).get('source') == 'assistant'
        ]
        assert len(assistant_puts) == 1
        assert assistant_puts[0]['message'] == ACCOUNT_PIN_MISMATCH_MESSAGE

    def test_terminal_message_id_cannot_collide_with_the_user_message(self, fake_context):
        # message_id is the messages-table sort key, and only the user message
        # separates the two writes — so a same-millisecond clock must still
        # yield distinct ids or the user turn is silently overwritten.
        with patch('handler._now_ms', return_value=1_755_000_000_000):
            result, _agent, _load, mock_table = _run_handler(
                _event(OTHER_ACCOUNT), fake_context, _session_item(PINNED_ACCOUNT))

        meta = _parse_pika_metadata(result['body'])
        assert meta['userMessageId'] != meta['assistantMessageId']

        persisted = [
            (c.kwargs.get('Item') or (c.args[0] if c.args else {}))
            for c in mock_table.put_item.call_args_list
        ]
        message_ids = [p['message_id'] for p in persisted if p.get('session_id')]
        assert len(message_ids) == len(set(message_ids)), f'colliding sort keys: {message_ids}'

    def test_top_level_pin_still_refuses_a_switched_account(self, fake_context):
        # End-to-end for the legacy top-level shape: no session_attributes, so
        # the backfill is skipped (_has_account_context sees the top-level id).
        # The guard must still fire rather than falling open.
        legacy = {'user_id': 'test-user-001', 'session_id': 'test-session-001',
                  'chat_app_id': 'example-app', 'accountId': PINNED_ACCOUNT}
        result, MockAgent, mock_load_agent, _table = _run_handler(
            _event(OTHER_ACCOUNT), fake_context, legacy)

        assert result['statusCode'] == 200
        assert MockAgent.call_count == 0
        assert mock_load_agent.call_count == 0
        assert ACCOUNT_PIN_MISMATCH_MESSAGE in result['body']

    def test_same_account_proceeds_to_agent(self, fake_context):
        result, MockAgent, _load, _table = _run_handler(
            _event(PINNED_ACCOUNT), fake_context, _session_item(PINNED_ACCOUNT))

        assert result['statusCode'] == 200
        assert MockAgent.call_count == 1
        assert ACCOUNT_PIN_MISMATCH_MESSAGE not in result['body']

    def test_request_without_account_uses_pin_and_proceeds(self, fake_context):
        result, MockAgent, _load, _table = _run_handler(
            _event(None), fake_context, _session_item(PINNED_ACCOUNT))

        assert result['statusCode'] == 200
        assert MockAgent.call_count == 1

    def test_legacy_session_without_pin_backfills_once_and_proceeds(self, fake_context):
        # Existing session with NO account context: ensure_session's backfill
        # pins this request's account, so the same turn can never mismatch.
        result, MockAgent, _load, mock_table = _run_handler(
            _event(PINNED_ACCOUNT), fake_context, _session_item(None))

        assert result['statusCode'] == 200
        assert MockAgent.call_count == 1
        # The backfill wrote session_attributes onto the legacy session.
        update_calls = [c for c in mock_table.update_item.call_args_list
                        if (c.kwargs.get('UpdateExpression') or '').startswith('SET #sa.#k')]
        assert len(update_calls) == 1
        assert PINNED_ACCOUNT in update_calls[0].kwargs['ExpressionAttributeValues'].values()


class TestAccountPinSettings:

    def test_mismatch_message_override_is_used(self, override_hooks, fake_context):
        override_hooks.ACCOUNT_PIN_MISMATCH_MESSAGE = 'Custom pin text.'
        result, MockAgent, _load, _table = _run_handler(
            _event(OTHER_ACCOUNT), fake_context, _session_item(PINNED_ACCOUNT))

        assert 'Custom pin text.' in result['body']
        assert ACCOUNT_PIN_MISMATCH_MESSAGE not in result['body']
        assert MockAgent.call_count == 0

    def test_pin_disabled_mismatch_proceeds_to_agent(self, override_hooks, fake_context):
        override_hooks.ACCOUNT_PIN_ENABLED = False
        result, MockAgent, _load, _table = _run_handler(
            _event(OTHER_ACCOUNT), fake_context, _session_item(PINNED_ACCOUNT))

        assert MockAgent.call_count == 1
        assert ACCOUNT_PIN_MISMATCH_MESSAGE not in result['body']

    def test_same_account_rewrites_turn_attributes_from_pin(self, fake_context):
        item = _session_item(PINNED_ACCOUNT)
        item['session_attributes']['account_id'] = PINNED_ACCOUNT
        _result, MockAgent, _load, _table = _run_handler(_event(PINNED_ACCOUNT), fake_context, item)

        assert MockAgent.call_count == 1
        assert MockAgent.call_args.kwargs['state']['session_attributes']['account_id'] == PINNED_ACCOUNT

    def test_pin_disabled_skips_rewrite(self, override_hooks, fake_context):
        override_hooks.ACCOUNT_PIN_ENABLED = False
        item = _session_item(PINNED_ACCOUNT)
        item['session_attributes']['account_id'] = PINNED_ACCOUNT
        _result, MockAgent, _load, _table = _run_handler(_event(PINNED_ACCOUNT), fake_context, item)

        assert MockAgent.call_count == 1
        assert 'account_id' not in MockAgent.call_args.kwargs['state']['session_attributes']
