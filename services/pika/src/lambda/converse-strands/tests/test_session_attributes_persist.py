"""Regression tests: Strands ensure_session persists session_attributes.

Strands-created sessions were written without a session_attributes map, so
persisted-session readers (such as session insights) saw no
account context. The handler builds the right map for the agent invocation;
these tests lock in that the same map is also written to the session item on
create, mirroring the TypeScript createChatSession path.
"""
import json
from unittest.mock import MagicMock, patch

import pytest


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
        seed, nested = [c.kwargs for c in mock_table.update_item.call_args_list]
        assert seed['UpdateExpression'] == 'SET #sa = :empty'
        assert seed['ConditionExpression'] == 'attribute_exists(session_id) AND (attribute_not_exists(#sa) OR NOT attribute_type(#sa, :map))'
        assert nested['UpdateExpression'] == 'SET #sa.#k0 = :v0'
        assert nested['ConditionExpression'] == (
            'attribute_exists(session_id) AND attribute_not_exists(#sa.#k0) AND attribute_not_exists(#sa.#a0)')
        assert nested['ExpressionAttributeValues'][':v0'] == 'acct-9'
        assert result['session_attributes']['accountId'] == 'acct-9'

    def test_self_heal_does_not_clobber_existing_keys(self):
        """Merge preserves existing session_attributes values; only adds missing ones."""
        from chat_ddb import ensure_session
        existing = {'user_id': 'u1', 'session_id': 's1',
                    'session_attributes': {'firstName': 'Keep', 'currentDate': 'old'}}
        mock_ddb, mock_table = self._existing_session_table(existing)

        ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                       session_attributes={'accountId': 'acct-9', 'firstName': 'New', 'currentDate': 'now'})

        nested = mock_table.update_item.call_args.kwargs
        assert list(nested['ExpressionAttributeValues'].values()) == ['acct-9']
        assert 'firstName' not in nested['ExpressionAttributeNames'].values()
        assert 'currentDate' not in nested['ExpressionAttributeNames'].values()

    def test_backfill_skips_non_account_keys(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table({'user_id': 'u1', 'session_id': 's1'})

        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                                session_attributes={'accountId': 'acct-9', 'currentDate': 'now',
                                                    'token': 't', 'sessionId': 's1'})

        nested = mock_table.update_item.call_args.kwargs
        assert sorted(nested['ExpressionAttributeNames'].values()) == ['accountId', 'account_id', 'session_attributes']
        assert result['session_attributes'] == {'accountId': 'acct-9'}

    def test_backfill_never_overwrites_existing_key(self):
        from chat_ddb import ensure_session
        existing = {'user_id': 'u1', 'session_id': 's1',
                    'session_attributes': {'accountType': 'kept'}}
        mock_ddb, mock_table = self._existing_session_table(existing)

        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                                session_attributes={'accountId': 'acct-9', 'accountType': 'new'})

        nested = mock_table.update_item.call_args.kwargs
        assert 'accountType' not in nested['ExpressionAttributeNames'].values()
        assert result['session_attributes'] == {'accountType': 'kept', 'accountId': 'acct-9'}

    @staticmethod
    def _client_error(code):
        from botocore.exceptions import ClientError
        return ClientError({'Error': {'Code': code, 'Message': 'x'}}, 'UpdateItem')

    def test_backfill_client_error_raises(self):
        from botocore.exceptions import ClientError
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table({'user_id': 'u1', 'session_id': 's1'})
        mock_table.update_item.side_effect = self._client_error('ProvisionedThroughputExceededException')

        with pytest.raises(ClientError):
            ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                           session_attributes={'accountId': 'acct-9'})

    def test_nested_client_error_raises(self):
        from botocore.exceptions import ClientError
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table({'user_id': 'u1', 'session_id': 's1'})
        mock_table.update_item.side_effect = [None, self._client_error('ProvisionedThroughputExceededException')]

        with pytest.raises(ClientError):
            ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                           session_attributes={'accountId': 'acct-9'})

    def test_seed_condition_failure_is_ignored(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table({'user_id': 'u1', 'session_id': 's1'})
        mock_table.update_item.side_effect = [self._client_error('ConditionalCheckFailedException'), None]

        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                                session_attributes={'accountId': 'acct-9'})

        assert result['session_attributes']['accountId'] == 'acct-9'

    def test_lost_race_rereads_consistently_and_uses_winner(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table({})
        mock_table.get_item.side_effect = [
            {'Item': {'user_id': 'u1', 'session_id': 's1'}},
            {'Item': {'user_id': 'u1', 'session_id': 's1', 'session_attributes': {'accountId': 'acct-B'}}},
        ]
        mock_table.update_item.side_effect = [None, self._client_error('ConditionalCheckFailedException')]

        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                                session_attributes={'accountId': 'acct-A'})

        assert result['session_attributes']['accountId'] == 'acct-B'
        assert mock_table.get_item.call_args_list[1].kwargs['ConsistentRead'] is True
        assert mock_table.update_item.call_count == 2

    def test_lost_race_twice_raises(self):
        from botocore.exceptions import ClientError
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table({'user_id': 'u1', 'session_id': 's1'})
        ccf = self._client_error('ConditionalCheckFailedException')
        mock_table.update_item.side_effect = [None, ccf, None, ccf]

        with pytest.raises(ClientError):
            ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                           session_attributes={'accountId': 'acct-9'})

    def test_seed_replaces_non_map_session_attributes(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table(
            {'user_id': 'u1', 'session_id': 's1', 'session_attributes': 'junk'})

        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                                session_attributes={'accountId': 'acct-9'})

        seed = mock_table.update_item.call_args_list[0].kwargs
        assert seed['ExpressionAttributeValues'] == {':empty': {}, ':map': 'M'}
        assert result['session_attributes'] == {'accountId': 'acct-9'}

    def test_create_race_rereads_consistently(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._new_session_table()
        mock_ddb.meta.client.exceptions.ConditionalCheckFailedException = type('CCF', (Exception,), {})
        mock_table.put_item.side_effect = mock_ddb.meta.client.exceptions.ConditionalCheckFailedException()
        mock_table.get_item.side_effect = [
            {},
            {'Item': {'user_id': 'u1', 'session_id': 's1', 'session_attributes': {'accountId': 'acct-B'}}},
        ]

        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                                session_attributes={'accountId': 'acct-A'})

        assert result['session_attributes']['accountId'] == 'acct-B'
        assert mock_table.get_item.call_args_list[1].kwargs['ConsistentRead'] is True

    def test_backfill_guards_every_account_id_alias(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table(
            {'user_id': 'u1', 'session_id': 's1', 'session_attributes': {'userId': 'u1'}})

        ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                       session_attributes={'account_id': 'acct-A', 'accountType': 'ent'})

        nested = mock_table.update_item.call_args.kwargs
        condition = nested['ConditionExpression']
        names = nested['ExpressionAttributeNames']
        guarded = {names[p] for p in ('#' + t.split('#sa.#')[1].rstrip(') ')
                                      for t in condition.split(' AND ') if '#sa.#' in t)}
        assert {'accountId', 'account_id', 'accountType'} <= guarded
        assert 'attribute_exists(session_id)' in condition
        assert condition.count('attribute_not_exists') == 3

    def test_alias_guard_skips_fields_already_present(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table(
            {'user_id': 'u1', 'session_id': 's1', 'session_attributes': {'accountId': ''}})

        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                                session_attributes={'account_id': 'acct-A', 'accountType': 'seller'})

        nested = mock_table.update_item.call_args.kwargs
        names = nested['ExpressionAttributeNames']
        guarded = [names['#' + t.split('#sa.#')[1].rstrip(') ')]
                   for t in nested['ConditionExpression'].split(' AND ') if '#sa.#' in t]
        assert 'accountId' not in guarded
        assert sorted(guarded) == ['accountType', 'account_id']
        assert result['session_attributes']['account_id'] == 'acct-A'

    def test_alias_race_uses_winner_without_second_write(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table({})
        mock_table.get_item.side_effect = [
            {'Item': {'user_id': 'u1', 'session_id': 's1', 'session_attributes': {'userId': 'u1'}}},
            {'Item': {'user_id': 'u1', 'session_id': 's1', 'session_attributes': {'accountId': 'acct-B'}}},
        ]
        mock_table.update_item.side_effect = [self._client_error('ConditionalCheckFailedException')]

        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                                session_attributes={'account_id': 'acct-A'})

        assert result['session_attributes'] == {'accountId': 'acct-B'}
        assert mock_table.get_item.call_args_list[1].kwargs['ConsistentRead'] is True
        assert mock_table.update_item.call_count == 1

    def test_session_deleted_mid_backfill_is_recreated_in_full(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table({})
        mock_table.get_item.side_effect = [
            {'Item': {'user_id': 'u1', 'session_id': 's1'}},
            {},
        ]
        ccf = self._client_error('ConditionalCheckFailedException')
        mock_table.update_item.side_effect = [ccf, ccf]

        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                                session_attributes={'accountId': 'acct-A'})

        put = mock_table.put_item.call_args.kwargs
        assert put['ConditionExpression'] == 'attribute_not_exists(session_id)'
        for field in ('chat_app_sk', 'create_date', 'agent_id'):
            assert field in put['Item']
        assert result == put['Item']

    def test_seed_requires_existing_session(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table(
            {'user_id': 'u1', 'session_id': 's1', 'session_attributes': 'junk'})

        ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                       session_attributes={'accountId': 'acct-9'})

        seed = mock_table.update_item.call_args_list[0].kwargs
        assert seed['ConditionExpression'].startswith('attribute_exists(session_id) AND')

    def test_create_race_with_winner_gone_raises(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._new_session_table()
        mock_ddb.meta.client.exceptions.ConditionalCheckFailedException = type('CCF', (Exception,), {})
        mock_table.put_item.side_effect = mock_ddb.meta.client.exceptions.ConditionalCheckFailedException()
        mock_table.get_item.side_effect = [{}, {}]

        with pytest.raises(RuntimeError, match='Session s1 not found after losing the create race'):
            ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                           session_attributes={'accountId': 'acct-A'})
        assert mock_table.get_item.call_args_list[1].kwargs['ConsistentRead'] is True

    def test_seed_skipped_when_session_attributes_is_a_map(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table(
            {'user_id': 'u1', 'session_id': 's1', 'session_attributes': {'userId': 'u1'}})

        result = ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                                session_attributes={'accountId': 'acct-9'})

        assert mock_table.update_item.call_count == 1
        assert mock_table.update_item.call_args.kwargs['UpdateExpression'].startswith('SET #sa.#k')
        assert result['session_attributes'] == {'userId': 'u1', 'accountId': 'acct-9'}

    def test_nested_set_names_each_key_via_expression_attribute_names(self):
        from chat_ddb import ensure_session
        mock_ddb, mock_table = self._existing_session_table({'user_id': 'u1', 'session_id': 's1'})

        ensure_session(mock_ddb, 'table', 'u1', 's1', 'a1', 'app1',
                       session_attributes={'accountId': 'acct-9', 'accountName': 'Acme'})

        nested = mock_table.update_item.call_args.kwargs
        assert nested['UpdateExpression'] == 'SET #sa.#k0 = :v0, #sa.#k1 = :v1'
        assert nested['ExpressionAttributeNames'] == {'#sa': 'session_attributes', '#k0': 'accountId', '#k1': 'accountName', '#a0': 'account_id'}
        assert nested['ExpressionAttributeValues'] == {':v0': 'acct-9', ':v1': 'Acme'}

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


class TestHasAccountContext:

    def test_true_for_top_level_account_id_without_session_attributes(self):
        from chat_ddb import _has_account_context
        assert _has_account_context({'accountId': 'acct-1'}) is True

    def test_true_for_decimal_and_int_ids(self):
        from decimal import Decimal
        from chat_ddb import _has_account_context
        assert _has_account_context({'session_attributes': {'accountId': Decimal(5)}}) is True
        assert _has_account_context({'accountId': 5}) is True

    def test_false_for_empty_string(self):
        from chat_ddb import _has_account_context
        assert _has_account_context({'session_attributes': {'accountId': ''}}) is False


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
