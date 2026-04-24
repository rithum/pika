"""Contract tests for the ConverseRequest input format.

These tests define the stable API contract that callers depend on.
They should NOT change as implementation evolves.
"""
import json
import pytest
from unittest.mock import patch, MagicMock


MOCK_AGENT_DEF = {
    'agent_id': 'test-agent',
    'base_prompt': 'Test prompt.',
    'foundation_model': 'test-model',
    'tool_ids': [],
}


def _make_event(body_overrides=None):
    body = {
        'agentId': 'test-agent',
        'userId': 'test-user',
        'sessionId': 'test-session',
        'message': 'hello',
    }
    if body_overrides:
        body.update(body_overrides)
    return {'body': json.dumps(body)}


def _fake_context():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300000
    return ctx


def _standard_patches():
    return (
        patch('handler.dynamodb'),
        patch('handler.Agent'),
        patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
        patch('handler.get_user', return_value=None),
    )


class TestRequiredFields:
    """ConverseRequest must have agentId and userId."""

    def test_missing_agent_id_returns_400(self):
        p = _standard_patches()
        with p[0], p[1], p[2], p[3], p[4], p[5]:
            from handler import handler
            result = handler(_make_event({'agentId': None}), _fake_context())
            assert result['statusCode'] == 400

    def test_missing_user_id_returns_400(self):
        p = _standard_patches()
        with p[0], p[1], p[2], p[3], p[4], p[5]:
            from handler import handler
            result = handler(_make_event({'userId': None}), _fake_context())
            assert result['statusCode'] == 400

    def test_empty_body_returns_400(self):
        p = _standard_patches()
        with p[0], p[1], p[2], p[3], p[4], p[5]:
            from handler import handler
            result = handler({'body': '{}'}, _fake_context())
            assert result['statusCode'] == 400

    def test_malformed_json_returns_500(self):
        from handler import handler
        result = handler({'body': 'not json'}, _fake_context())
        assert result['statusCode'] == 500


class TestOptionalFields:
    """Optional fields should be handled gracefully."""

    def test_missing_session_id_auto_generates(self):
        p = _standard_patches()
        with p[0] as mock_ddb, p[1] as MockAgent, p[2], p[3], p[4], p[5]:
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {}
            mock_agent = MagicMock()
            mock_agent.return_value = 'response'
            MockAgent.return_value = mock_agent

            from handler import handler
            body = {'agentId': 'test-agent', 'userId': 'test-user', 'message': 'hi'}
            result = handler({'body': json.dumps(body)}, _fake_context())

            assert result['statusCode'] == 200
            assert result['headers']['x-chatbot-session-id']

    def test_missing_message_defaults_to_empty(self):
        p = _standard_patches()
        with p[0] as mock_ddb, p[1] as MockAgent, p[2], p[3], p[4], p[5]:
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user', 'session_id': 'test-session'}
            }
            mock_agent = MagicMock()
            mock_agent.return_value = 'response'
            MockAgent.return_value = mock_agent

            from handler import handler
            body = {'agentId': 'test-agent', 'userId': 'test-user', 'sessionId': 'test-session'}
            result = handler({'body': json.dumps(body)}, _fake_context())
            assert result['statusCode'] == 200

    def test_custom_user_data_merges_into_session_attributes(self):
        """customUserData in request body should merge into session attributes."""
        captured = {}

        def fake_build(tool_defs, session_id, input_text, session_attributes=None, prompt_session_attributes=None, trace_callback=None):
            captured['session_attributes'] = session_attributes
            return []

        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value={**MOCK_AGENT_DEF, 'tool_ids': ['t1']}), \
             patch('handler.load_tools', return_value=[{'tool_id': 't1'}]), \
             patch('handler.build_strands_tools', side_effect=fake_build), \
             patch('handler.get_user', return_value={'user_id': 'test-user', 'custom_data': {}}):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user', 'session_id': 'test-session'}
            }
            mock_agent = MagicMock()
            mock_agent.return_value = 'response'
            MockAgent.return_value = mock_agent

            from handler import handler
            event = _make_event({'customUserData': {'accountId': '12345'}})
            result = handler(event, _fake_context())

            assert result['statusCode'] == 200
            assert captured['session_attributes']['accountId'] == '12345'


class TestChatAppId:
    """chatAppId should flow into session attributes when provided."""

    def test_chat_app_id_in_session_attributes(self):
        captured = {}

        def fake_build(tool_defs, session_id, input_text, session_attributes=None, prompt_session_attributes=None, trace_callback=None):
            captured['session_attributes'] = session_attributes
            return []

        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value={**MOCK_AGENT_DEF, 'tool_ids': ['t1']}), \
             patch('handler.load_tools', return_value=[{'tool_id': 't1'}]), \
             patch('handler.build_strands_tools', side_effect=fake_build), \
             patch('handler.get_user', return_value=None):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user', 'session_id': 'test-session'}
            }
            mock_agent = MagicMock()
            mock_agent.return_value = 'response'
            MockAgent.return_value = mock_agent

            from handler import handler
            event = _make_event({'chatAppId': 'rithum-bot'})
            result = handler(event, _fake_context())

            assert captured['session_attributes'].get('chatAppId') == 'rithum-bot'
