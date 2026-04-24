"""Contract tests for DynamoDB write operations.

These tests define the exact record shapes that downstream consumers
(frontend, OpenSearch indexer, session insights) depend on.
They should NOT change as implementation evolves.
"""
import json
import pytest
from unittest.mock import patch, MagicMock


MOCK_AGENT_DEF = {
    'agent_id': 'test-agent',
    'base_prompt': 'Test prompt.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': [],
}


def _run_and_capture_ddb_writes():
    """Run handler and return all DDB put_item Items."""
    with patch('handler.dynamodb') as mock_ddb, \
         patch('handler.Agent') as MockAgent, \
         patch('handler.load_agent', return_value=MOCK_AGENT_DEF), \
         patch('handler.load_tools', return_value=[]), \
         patch('handler.build_strands_tools', return_value=[]), \
         patch('handler.get_user', return_value=None):
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {
            'Item': {'user_id': 'test-user', 'session_id': 'test-session-001'}
        }
        mock_agent = MagicMock()
        mock_agent.return_value = 'The answer is 42.'
        MockAgent.return_value = mock_agent

        ctx = MagicMock()
        ctx.get_remaining_time_in_millis.return_value = 300000

        from handler import handler
        handler({
            'body': json.dumps({
                'agentId': 'test-agent',
                'userId': 'test-user',
                'sessionId': 'test-session-001',
                'message': 'What is the meaning of life?',
            })
        }, ctx)

        return [c.kwargs.get('Item', {}) for c in mock_table.put_item.call_args_list]


class TestUserMessageRecord:
    """Contract for the user message DDB record."""

    def test_has_user_id(self):
        items = _run_and_capture_ddb_writes()
        user_msgs = [i for i in items if i.get('source') == 'user']
        assert len(user_msgs) >= 1
        assert user_msgs[0]['user_id'] == 'test-user'

    def test_has_message_id_with_session_prefix(self):
        items = _run_and_capture_ddb_writes()
        user_msgs = [i for i in items if i.get('source') == 'user']
        assert user_msgs[0]['message_id'].startswith('test-session-001:')

    def test_has_session_id(self):
        items = _run_and_capture_ddb_writes()
        user_msgs = [i for i in items if i.get('source') == 'user']
        assert user_msgs[0]['session_id'] == 'test-session-001'

    def test_has_message_text(self):
        items = _run_and_capture_ddb_writes()
        user_msgs = [i for i in items if i.get('source') == 'user']
        assert user_msgs[0]['message'] == 'What is the meaning of life?'

    def test_source_is_user(self):
        items = _run_and_capture_ddb_writes()
        user_msgs = [i for i in items if i.get('source') == 'user']
        assert user_msgs[0]['source'] == 'user'

    def test_has_iso_timestamp(self):
        """Timestamp must be ISO-8601 (string), not epoch millis.

        The message-changed Lambda's OpenSearch painless script calls
        ZonedDateTime.parse(last.timestamp) — numeric values cause
        `illegal_argument_exception: failed to execute script` and break
        session timing analytics after the first message.
        """
        items = _run_and_capture_ddb_writes()
        user_msgs = [i for i in items if i.get('source') == 'user']
        ts = user_msgs[0]['timestamp']
        assert isinstance(ts, str), (
            f'user message timestamp must be ISO-8601 string (got {type(ts).__name__})'
        )


class TestAssistantMessageRecord:
    """Contract for the assistant message DDB record."""

    def test_has_user_id(self):
        items = _run_and_capture_ddb_writes()
        bot_msgs = [i for i in items if i.get('source') == 'assistant']
        assert len(bot_msgs) >= 1
        assert bot_msgs[0]['user_id'] == 'test-user'

    def test_has_message_id_with_session_prefix(self):
        items = _run_and_capture_ddb_writes()
        bot_msgs = [i for i in items if i.get('source') == 'assistant']
        assert bot_msgs[0]['message_id'].startswith('test-session-001:')

    def test_has_session_id(self):
        items = _run_and_capture_ddb_writes()
        bot_msgs = [i for i in items if i.get('source') == 'assistant']
        assert bot_msgs[0]['session_id'] == 'test-session-001'

    def test_has_message_text(self):
        items = _run_and_capture_ddb_writes()
        bot_msgs = [i for i in items if i.get('source') == 'assistant']
        assert bot_msgs[0]['message'] == 'The answer is 42.'

    def test_source_is_assistant(self):
        items = _run_and_capture_ddb_writes()
        bot_msgs = [i for i in items if i.get('source') == 'assistant']
        assert bot_msgs[0]['source'] == 'assistant'

    def test_has_model_field(self):
        items = _run_and_capture_ddb_writes()
        bot_msgs = [i for i in items if i.get('source') == 'assistant']
        assert bot_msgs[0]['model'] == 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'

    def test_has_execution_duration(self):
        items = _run_and_capture_ddb_writes()
        bot_msgs = [i for i in items if i.get('source') == 'assistant']
        assert isinstance(bot_msgs[0]['execution_duration'], int)
        assert bot_msgs[0]['execution_duration'] >= 0

    def test_has_iso_timestamp(self):
        """Timestamp must be ISO-8601 (string), not epoch millis. See
        TestUserMessageRecord.test_has_iso_timestamp for rationale.
        """
        items = _run_and_capture_ddb_writes()
        bot_msgs = [i for i in items if i.get('source') == 'assistant']
        ts = bot_msgs[0]['timestamp']
        assert isinstance(ts, str), (
            f'assistant message timestamp must be ISO-8601 string (got {type(ts).__name__})'
        )


class TestSessionRecord:
    """Contract for session creation."""

    def test_new_session_has_required_fields(self):
        from chat_ddb import ensure_session
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        ensure_session(mock_ddb, 'table', 'user-1', 'sess-1', 'agent-1', 'app-1')

        item = mock_table.put_item.call_args.kwargs['Item']
        assert item['user_id'] == 'user-1'
        assert item['session_id'] == 'sess-1'
        assert item['agent_id'] == 'agent-1'
        assert item['chat_app_id'] == 'app-1'
        assert item['chat_app_sk'].startswith('app-1#user#')
        assert item['identity_id'] == 'user-1'
        assert 'create_date' in item
        assert 'last_update' in item
        assert item['source'] == 'user'


class TestSessionAttributesContract:
    """Contract for session attributes passed to tool Lambdas."""

    def _run_and_capture_attrs(self, custom_data=None, custom_user_data=None):
        captured = {}

        def fake_build(tool_defs, session_id, input_text, session_attributes=None, prompt_session_attributes=None, trace_callback=None):
            captured['sa'] = session_attributes
            captured['psa'] = prompt_session_attributes
            return []

        user_record = {'user_id': 'test-user', 'custom_data': custom_data or {}}
        body = {
            'agentId': 'test-agent', 'userId': 'test-user',
            'sessionId': 'test-session', 'message': 'hello',
        }
        if custom_user_data:
            body['customUserData'] = custom_user_data

        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value={**MOCK_AGENT_DEF, 'tool_ids': ['t1']}), \
             patch('handler.load_tools', return_value=[{'tool_id': 't1'}]), \
             patch('handler.build_strands_tools', side_effect=fake_build), \
             patch('handler.get_user', return_value=user_record):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user', 'session_id': 'test-session'}
            }
            mock_agent = MagicMock()
            mock_agent.return_value = 'r'
            MockAgent.return_value = mock_agent

            from handler import handler
            handler({'body': json.dumps(body)}, MagicMock(get_remaining_time_in_millis=lambda: 300000))
        return captured

    def test_session_attrs_has_user_id(self):
        c = self._run_and_capture_attrs()
        assert c['sa']['userId'] == 'test-user'

    def test_session_attrs_has_agent_id(self):
        c = self._run_and_capture_attrs()
        assert c['sa']['agentId'] == 'test-agent'

    def test_session_attrs_has_current_date_iso(self):
        c = self._run_and_capture_attrs()
        assert 'T' in c['sa']['currentDate']

    def test_prompt_session_attrs_has_message_id(self):
        c = self._run_and_capture_attrs()
        assert c['psa']['messageId'].startswith('test-session:')

    def test_custom_data_spread_into_attrs(self):
        c = self._run_and_capture_attrs(custom_data={'accountId': '12345', 'accountType': 'retailer'})
        assert c['sa']['accountId'] == '12345'
        assert c['sa']['accountType'] == 'retailer'

    def test_custom_user_data_overrides_ddb(self):
        c = self._run_and_capture_attrs(
            custom_data={'accountId': 'from-ddb'},
            custom_user_data={'accountId': 'from-request'},
        )
        assert c['sa']['accountId'] == 'from-request'

    def test_all_values_are_strings(self):
        c = self._run_and_capture_attrs(custom_data={'numVal': 42, 'boolVal': True})
        for k, v in c['sa'].items():
            assert isinstance(v, str), f"session_attributes['{k}'] = {v!r} is not a string"
