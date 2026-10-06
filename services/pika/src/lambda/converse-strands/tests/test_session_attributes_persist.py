"""Regression tests: Strands ensure_session persists session_attributes.

Strands-created sessions were written without a session_attributes map, so
persisted-session readers (such as session insights) saw no
account context. The handler builds the right map for the agent invocation;
these tests lock in that the same map is also written to the session item on
create, mirroring the TypeScript createChatSession path.
"""
import json
from unittest.mock import MagicMock, patch


class TestEnsureSessionPersistsAttributes:

    def _new_session_table(self):
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {}  # session does not exist yet
        return mock_ddb, mock_table

    def test_writes_session_attributes_on_create(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._new_session_table()

        attrs = {'accountId': 'acct-1', 'userId': 'u1', 'currentDate': '2026-06-15T00:00:00+00:00'}
        ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1', session_attributes=attrs)

        item = mock_table.put_item.call_args.kwargs['Item']
        assert item['session_attributes'] == attrs

    def test_omits_attribute_when_not_provided(self):
        """No session_attributes arg → key absent (preserves prior behavior for other callers)."""
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._new_session_table()

        ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1')

        item = mock_table.put_item.call_args.kwargs['Item']
        assert 'session_attributes' not in item

    def _existing_session_table(self, item):
        from unittest.mock import MagicMock
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': item}
        return mock_ddb, mock_table

    def test_self_heals_existing_session_without_account_context(self):
        """Existing session lacking account context gets the attributes merged in (no put_item)."""
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table({'user_id': 'u1', 'session_id': 's1'})

        attrs = {'accountId': 'acct-9', 'userId': 'u1', 'currentDate': 'now'}
        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1', session_attributes=attrs)

        mock_table.put_item.assert_not_called()
        update = mock_table.update_item.call_args.kwargs
        assert update['UpdateExpression'] == 'SET session_attributes = :sa'
        assert update['ExpressionAttributeValues'][':sa']['accountId'] == 'acct-9'
        assert result['session_attributes']['accountId'] == 'acct-9'

    def test_self_heal_does_not_clobber_existing_keys(self):
        """Merge preserves existing session_attributes values; only adds missing ones."""
        from chat_ddb import ensure_session
        existing = {'user_id': 'u1', 'session_id': 's1',
                    'session_attributes': {'firstName': 'Keep', 'currentDate': 'old'}}
        mock_ddb, mock_table = self._existing_session_table(existing)

        ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                       session_attributes={'accountId': 'acct-9', 'firstName': 'New', 'currentDate': 'now'})

        merged = mock_table.update_item.call_args.kwargs['ExpressionAttributeValues'][':sa']
        assert merged['accountId'] == 'acct-9'       # added
        assert merged['firstName'] == 'Keep'         # existing value preserved
        assert merged['currentDate'] == 'old'        # existing value preserved

    def test_skips_self_heal_when_account_context_present(self):
        """Existing session that already has account context is returned untouched."""
        from chat_ddb import ensure_session
        existing = {'user_id': 'u1', 'session_id': 's1',
                    'session_attributes': {'accountId': 'already-here'}}
        mock_ddb, mock_table = self._existing_session_table(existing)

        ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                       session_attributes={'accountId': 'acct-9'})

        mock_table.put_item.assert_not_called()
        mock_table.update_item.assert_not_called()

    def test_no_self_heal_without_session_attributes(self):
        """No session_attributes arg → existing session returned untouched (back-compat)."""
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table({'user_id': 'u1', 'session_id': 's1'})

        ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1')

        mock_table.put_item.assert_not_called()
        mock_table.update_item.assert_not_called()



class TestHandlerPassesSessionAttributes:

    def _ctx(self):
        ctx = MagicMock()
        ctx.get_remaining_time_in_millis.return_value = 300_000
        return ctx

    def test_handler_passes_account_context_to_ensure_session(self):
        import handler as h

        event = {'body': json.dumps({
            'agentId': 'agent-x',
            'userId': 'user-001',
            'sessionId': 'sess-1',
            'message': 'hi',
        })}
        user_record = {
            'user_id': 'user-001',
            'custom_data': {'accountId': 'acct-123', 'accountType': 'enterprise', 'firstName': 'Jane'},
        }

        with (
            patch('boto3.resource', return_value=MagicMock()),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='ok'))),
            patch('handler.load_agent', return_value={'agent_id': 'agent-x', 'base_prompt': 'hi',
                                                      'foundation_model': 'm', 'tool_ids': []}),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value=user_record),
            patch('handler.get_messages', return_value=[]),
            patch('handler.ensure_session') as mock_ensure,
        ):
            result = h.handler(event, self._ctx())

        assert result['statusCode'] == 200
        assert mock_ensure.called
        attrs = mock_ensure.call_args.kwargs['session_attributes']
        # Account context from custom_data + the explicit identity/date fields.
        assert attrs['accountId'] == 'acct-123'
        assert attrs['accountType'] == 'enterprise'
        assert attrs['userId'] == 'user-001'
        assert attrs['chatAppId'] == 'agent-x'  # resolves to agentId when no chatAppId in body
        assert attrs['agentId'] == 'agent-x'
        assert attrs['sessionId'] == 'sess-1'
        assert 'currentDate' in attrs
        # Full TS-shape parity: token mirrors createSessionToken(sessionId, userId).
        import hashlib
        assert attrs['token'] == hashlib.sha256('sess-1:user-001'.encode()).hexdigest()
        # Bedrock requires string values.
        assert all(isinstance(v, str) for v in attrs.values())
