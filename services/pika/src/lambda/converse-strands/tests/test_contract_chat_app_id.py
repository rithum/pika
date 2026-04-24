"""
CONTRACT TESTS: chatAppId propagation through the Strands converse Lambda.

These tests are EXPECTED TO FAIL until chatAppId propagation is implemented.

Observable behavior contracts:
  - The chatAppId from the request is stored on the session and is available to the agent
    as part of the session context (e.g. for tag lookup, directive scoping, tool context).
  - The agent's session state must include chatAppId so downstream tools can scope their
    responses to the correct application.
  - When chatAppId is absent from the request, agentId is used as the effective chatAppId.
  - The resolved chatAppId is consistent across the entire request lifecycle (session creation,
    tag fetch, directive fetch, session attributes).
"""

import json
import pytest
from unittest.mock import MagicMock, patch


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _make_agent_def(agent_id='agent-001'):
    return {
        'agent_id': agent_id,
        'base_prompt': 'Be helpful.',
        'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'tool_ids': [],
    }


def _standard_patches(agent_def=None, agent_spy=None):
    """Return patches covering all handler DDB/external calls."""
    mock_ddb = MagicMock()
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}}

    return (
        patch('handler.dynamodb', mock_ddb),
        patch('handler.Agent', agent_spy or MagicMock(return_value=MagicMock(return_value='ok'))),
        patch('handler.load_agent', return_value=agent_def or _make_agent_def()),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
        patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
        patch('handler.get_messages', return_value=[]),
        patch('handler.add_message'),
        patch('handler.ensure_session'),
    )


# ---------------------------------------------------------------------------
# Tests: chatAppId in session attributes / context
# ---------------------------------------------------------------------------

class TestChatAppIdInSessionContext:
    """Contract: chatAppId must be present in the session context available to the agent."""

    def test_chat_app_id_present_in_session_attributes_passed_to_agent(self):
        """chatAppId must appear in the session attributes provided to the Strands agent.

        Observable: downstream tools that need to scope to the correct app (tag lookup,
        KB filter, directive search) rely on chatAppId being in session state.
        """
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-001',
                'chatAppId': 'my-chat-app',
                'userId': 'user-001',
                'sessionId': 'sess-001',
                'message': 'Hello',
            })
        }

        captured_attrs = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_attrs.update(kwargs.get('state', {}).get('session_attributes', {}))
            inst = MagicMock()
            inst.return_value = 'ok'
            return inst

        patches = _standard_patches(agent_spy=make_agent_spy)
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
            h.handler(event, _make_ctx())

        assert 'chatAppId' in captured_attrs or 'chat_app_id' in captured_attrs, (
            f'chatAppId must be in session_attributes passed to the agent. '
            f'Got attributes: {list(captured_attrs.keys())}'
        )
        value = captured_attrs.get('chatAppId') or captured_attrs.get('chat_app_id')
        assert value == 'my-chat-app', (
            f'chatAppId in session_attributes must equal request chatAppId "my-chat-app". '
            f'Got: {value!r}'
        )

    def test_agent_id_present_in_session_attributes(self):
        """agentId must appear in the session attributes provided to the Strands agent."""
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-xyz',
                'userId': 'user-001',
                'sessionId': 'sess-002',
                'message': 'Hello',
            })
        }

        captured_attrs = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_attrs.update(kwargs.get('state', {}).get('session_attributes', {}))
            inst = MagicMock()
            inst.return_value = 'ok'
            return inst

        patches = _standard_patches(agent_def=_make_agent_def('agent-xyz'), agent_spy=make_agent_spy)
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
            h.handler(event, _make_ctx())

        value = captured_attrs.get('agentId') or captured_attrs.get('agent_id')
        assert value == 'agent-xyz', (
            f'agentId must be in session_attributes and equal "agent-xyz". Got: {captured_attrs}'
        )

    def test_user_id_present_in_session_attributes(self):
        """userId must appear in the session attributes provided to the Strands agent."""
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-001',
                'userId': 'user-abc',
                'sessionId': 'sess-003',
                'message': 'Hello',
            })
        }

        captured_attrs = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_attrs.update(kwargs.get('state', {}).get('session_attributes', {}))
            inst = MagicMock()
            inst.return_value = 'ok'
            return inst

        patches = _standard_patches(agent_spy=make_agent_spy)
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
            # Override get_user for this specific userId
            with patch('handler.get_user', return_value={'user_id': 'user-abc', 'custom_data': {}}):
                h.handler(event, _make_ctx())

        value = captured_attrs.get('userId') or captured_attrs.get('user_id')
        assert value == 'user-abc', (
            f'userId must be in session_attributes and equal "user-abc". Got: {captured_attrs}'
        )

    def test_current_date_present_in_session_attributes(self):
        """currentDate must appear in session attributes as an ISO-8601 timestamp."""
        import handler as h  # noqa: PLC0415
        import re

        event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-004', 'message': 'Hello',
            })
        }

        captured_attrs = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_attrs.update(kwargs.get('state', {}).get('session_attributes', {}))
            inst = MagicMock()
            inst.return_value = 'ok'
            return inst

        patches = _standard_patches(agent_spy=make_agent_spy)
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
            h.handler(event, _make_ctx())

        date_val = captured_attrs.get('currentDate') or captured_attrs.get('current_date')
        assert date_val is not None, (
            f'currentDate must be in session_attributes. Got keys: {list(captured_attrs.keys())}'
        )
        assert re.match(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', str(date_val)), (
            f'currentDate must be ISO-8601 formatted. Got: {date_val!r}'
        )


# ---------------------------------------------------------------------------
# Tests: effective chatAppId fallback
# ---------------------------------------------------------------------------

class TestEffectiveChatAppIdFallback:
    """Contract: when chatAppId is absent, agentId is used as the effective chatAppId."""

    def test_agent_id_used_when_chat_app_id_absent_from_request(self):
        """When chatAppId is not in the request, agentId must serve as the chatAppId for scoping."""
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-fallback',
                'userId': 'user-001',
                'sessionId': 'sess-005',
                'message': 'Hello',
                # no chatAppId
            })
        }

        captured_attrs = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_attrs.update(kwargs.get('state', {}).get('session_attributes', {}))
            inst = MagicMock()
            inst.return_value = 'ok'
            return inst

        patches = _standard_patches(agent_def=_make_agent_def('agent-fallback'), agent_spy=make_agent_spy)
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
            h.handler(event, _make_ctx())

        effective = captured_attrs.get('chatAppId') or captured_attrs.get('chat_app_id')
        assert effective == 'agent-fallback', (
            f'When chatAppId absent, agentId must be used as effectiveChatAppId. '
            f'Got session_attributes: {captured_attrs}'
        )
