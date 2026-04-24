"""Tests verifying DynamoDB key schemas and attribute names match the real tables.

These tests ensure the Python code uses the correct key names and attribute
conventions. Every DDB touchpoint in the handler should have a corresponding
test here so schema mismatches are caught before deployment.
"""
from unittest.mock import MagicMock, patch, call


class TestSessionTableSchema:
    """Session table: PK=user_id, SK=session_id (both snake_case)."""

    def test_ensure_session_uses_correct_key(self):
        from chat_ddb import ensure_session
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        ensure_session(mock_ddb, 'chat-session-table', 'user-123', 'sess-456', 'agent-1', 'app-1')

        mock_table.get_item.assert_called_once_with(
            Key={'user_id': 'user-123', 'session_id': 'sess-456'}
        )

    def test_ensure_session_creates_with_snake_case_keys(self):
        from chat_ddb import ensure_session
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        ensure_session(mock_ddb, 'table', 'user-1', 'sess-1', 'agent-1', 'app-1')

        item = mock_table.put_item.call_args.kwargs['Item']
        assert 'user_id' in item
        assert 'session_id' in item
        assert 'agent_id' in item
        assert 'chat_app_id' in item
        assert 'chat_app_sk' in item
        assert 'create_date' in item
        assert 'last_update' in item
        # Must NOT have camelCase variants
        assert 'userId' not in item
        assert 'sessionId' not in item

    def test_get_session_uses_correct_key(self):
        from chat_ddb import get_session
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        get_session(mock_ddb, 'table', 'user-1', 'sess-1')

        mock_table.get_item.assert_called_once_with(
            Key={'user_id': 'user-1', 'session_id': 'sess-1'}
        )


class TestMessageTableSchema:
    """Message table: PK=user_id, SK=message_id (format: {sessionId}:{timestamp})."""

    def test_add_message_item_has_snake_case_keys(self):
        from chat_ddb import add_message
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table

        msg = {
            'user_id': 'u1',
            'message_id': 'sess-1:1234567890',
            'session_id': 'sess-1',
            'message': 'hello',
            'source': 'user',
            'timestamp': 1234567890,
        }
        add_message(mock_ddb, 'table', msg)

        item = mock_table.put_item.call_args.kwargs['Item']
        assert item['user_id'] == 'u1'
        assert item['message_id'] == 'sess-1:1234567890'
        assert item['source'] == 'user'

    def test_get_messages_uses_begins_with_on_message_id(self):
        from chat_ddb import get_messages
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.query.return_value = {'Items': []}

        get_messages(mock_ddb, 'table', 'user-1', 'sess-1')

        kwargs = mock_table.query.call_args.kwargs
        assert 'user_id = :uid' in kwargs['KeyConditionExpression']
        assert 'begins_with(message_id, :sid_prefix)' in kwargs['KeyConditionExpression']
        assert kwargs['ExpressionAttributeValues'][':uid'] == 'user-1'
        assert kwargs['ExpressionAttributeValues'][':sid_prefix'] == 'sess-1:'

    def test_handler_writes_user_source(self, valid_event, fake_context):
        """User messages must have source='user', not 'human'."""
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value={
                 'agent_id': 'test', 'base_prompt': 'test',
                 'foundation_model': 'test', 'tool_ids': [],
             }), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }
            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            handler(valid_event, fake_context)

            items = [c.kwargs.get('Item', {}) for c in mock_table.put_item.call_args_list]
            user_msgs = [i for i in items if i.get('source') == 'user']
            bot_msgs = [i for i in items if i.get('source') == 'assistant']
            assert len(user_msgs) >= 1, "No messages with source='user' found"
            assert len(bot_msgs) >= 1, "No messages with source='assistant' found"
            # Verify no old-style source values
            assert not any(i.get('source') == 'human' for i in items), "Found source='human' — should be 'user'"
            assert not any(i.get('source') == 'bot' for i in items), "Found source='bot' — should be 'assistant'"


class TestUserTableSchema:
    """User table: PK=user_id (snake_case). Attributes are snake_case."""

    def test_get_user_uses_snake_case_key(self):
        from chat_ddb import get_user
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        get_user(mock_ddb, 'table', 'user-123')

        mock_table.get_item.assert_called_once_with(Key={'user_id': 'user-123'})

    def test_get_user_key_is_not_camel_case(self):
        """Regression: the key was incorrectly 'userId' (camelCase) which caused
        ValidationException against the real table."""
        from chat_ddb import get_user
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        get_user(mock_ddb, 'table', 'user-123')

        key = mock_table.get_item.call_args.kwargs['Key']
        assert 'user_id' in key, "Key should use snake_case 'user_id'"
        assert 'userId' not in key, "Key must NOT use camelCase 'userId'"

    def test_handler_reads_custom_data_snake_case(self, valid_event, fake_context):
        """Handler must read 'custom_data' (snake_case), not 'customData' (camelCase)."""
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('agent_loader.load_agent', return_value={
                 'agent_id': 'test', 'base_prompt': 'test',
                 'foundation_model': 'test', 'tool_ids': [],
             }), \
             patch('agent_loader.load_tools', return_value=[]), \
             patch('agent_loader.build_strands_tools', return_value=[]) as mock_build:
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table

            # Session lookup returns a session
            # User lookup returns a user with custom_data containing accountId
            def get_item_side_effect(Key):
                if 'session_id' in Key:
                    return {'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}}
                elif 'user_id' in Key:
                    return {'Item': {
                        'user_id': 'test-user-001',
                        'custom_data': {'accountId': '12345', 'accountType': 'retailer'},
                    }}
                return {}

            mock_table.get_item.side_effect = get_item_side_effect

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            handler(valid_event, fake_context)

            # Verify build_strands_tools received session_attributes with accountId
            if mock_build.called:
                call_kwargs = mock_build.call_args.kwargs
                session_attrs = call_kwargs.get('session_attributes', {})
                assert session_attrs.get('accountId') == '12345', \
                    f"accountId not found in session_attributes: {session_attrs}"


class TestAgentDefinitionsTableSchema:
    """Agent definitions table: PK=agent_id."""

    def test_load_agent_uses_correct_key(self):
        from agent_loader import load_agent
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': {
            'agent_id': 'order-analyzer-2',
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'base_prompt': 'Be helpful.',
        }}

        with patch('agent_loader.AGENT_DEFINITIONS_TABLE', 'agent-defs-table'):
            load_agent(mock_ddb, 'order-analyzer-2')

        mock_table.get_item.assert_called_once_with(Key={'agent_id': 'order-analyzer-2'})


class TestToolDefinitionsTableSchema:
    """Tool definitions table: PK=tool_id."""

    def test_load_tools_uses_correct_key(self):
        from agent_loader import load_tools
        mock_ddb = MagicMock()
        mock_ddb.batch_get_item.return_value = {
            'Responses': {
                'tool-defs-table': [{'tool_id': 'oa_elasticsearch'}],
            }
        }

        with patch('agent_loader.TOOL_DEFINITIONS_TABLE', 'tool-defs-table'):
            load_tools(mock_ddb, ['oa_elasticsearch'])

        mock_ddb.batch_get_item.assert_called_once()
        keys = mock_ddb.batch_get_item.call_args.kwargs['RequestItems']['tool-defs-table']['Keys']
        assert keys == [{'tool_id': 'oa_elasticsearch'}]
