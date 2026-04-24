"""Unit tests for chat_ddb.py — DynamoDB helpers."""
from decimal import Decimal
from unittest.mock import MagicMock


class TestEnsureSession:

    def test_returns_existing_session(self):
        from chat_ddb import ensure_session
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table

        existing = {'user_id': 'u1', 'session_id': 's1', 'agent_id': 'a1'}
        mock_table.get_item.return_value = {'Item': existing}

        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1')
        assert result == existing
        mock_table.put_item.assert_not_called()

    def test_creates_new_session_when_not_found(self):
        from chat_ddb import ensure_session
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1')

        mock_table.put_item.assert_called_once()
        item = mock_table.put_item.call_args.kwargs['Item']
        assert item['user_id'] == 'u1'
        assert item['session_id'] == 's1'
        assert item['agent_id'] == 'a1'
        assert item['chat_app_id'] == 'app1'
        assert item['agent_alias_id'] == 'a1'
        assert item['identity_id'] == 'u1'
        assert item['source'] == 'user'
        assert 'create_date' in item
        assert 'last_update' in item
        # chat_app_sk must be in the format used by the user-chat-app-index GSI
        assert item['chat_app_sk'].startswith('app1#user#')
        # Timestamps must be ISO 8601 strings, not epoch millis
        assert 'T' in item['create_date']
        assert 'T' in item['last_update']
        # Cost fields must be Decimal for DDB compatibility
        assert item['input_cost'] == Decimal('0')
        assert item['output_cost'] == Decimal('0')
        assert item['total_cost'] == Decimal('0')


class TestUpdateSession:

    def test_updates_session_with_usage_and_chat_app_sk(self):
        from chat_ddb import update_session
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table

        usage = {'inputCost': 0.01, 'outputCost': 0.02, 'totalCost': 0.03,
                 'inputTokens': 100, 'outputTokens': 50}

        update_session(mock_ddb, 'table', 'u1', 's1', 'msg-123',
                       usage=usage, chat_app_id='app1', source='user')

        mock_table.update_item.assert_called_once()
        kwargs = mock_table.update_item.call_args.kwargs
        assert kwargs['Key'] == {'user_id': 'u1', 'session_id': 's1'}
        assert ':messageId' in kwargs['ExpressionAttributeValues']
        assert ':chatAppSk' in kwargs['ExpressionAttributeValues']
        # chat_app_sk should contain the chat app ID and source
        sk = kwargs['ExpressionAttributeValues'][':chatAppSk']
        assert sk.startswith('app1#user#')
        # Usage values must be Decimal
        assert isinstance(kwargs['ExpressionAttributeValues'][':inputCost'], Decimal)
        # UpdateExpression should SET and ADD
        assert 'SET' in kwargs['UpdateExpression']
        assert 'ADD' in kwargs['UpdateExpression']


class TestAddMessage:

    def test_puts_item_to_table(self):
        from chat_ddb import add_message
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table

        msg = {'user_id': 'u1', 'message_id': 's1:123', 'message': 'hello'}
        add_message(mock_ddb, 'table', msg)

        mock_table.put_item.assert_called_once_with(Item=msg)


class TestGetMessages:

    def test_queries_with_begins_with(self):
        from chat_ddb import get_messages
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.query.return_value = {'Items': [{'message': 'hi'}]}

        result = get_messages(mock_ddb, 'table', 'u1', 's1')

        assert len(result) == 1
        call_kwargs = mock_table.query.call_args.kwargs
        assert 'begins_with' in call_kwargs['KeyConditionExpression']
        assert call_kwargs['ExpressionAttributeValues'][':sid_prefix'] == 's1:'


class TestGetSession:

    def test_returns_session_when_found(self):
        from chat_ddb import get_session
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': {'user_id': 'u1', 'session_id': 's1'}}

        result = get_session(mock_ddb, 'table', 'u1', 's1')
        assert result['session_id'] == 's1'

    def test_returns_none_when_not_found(self):
        from chat_ddb import get_session
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        result = get_session(mock_ddb, 'table', 'u1', 's1')
        assert result is None
