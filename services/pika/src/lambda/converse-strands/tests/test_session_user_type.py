"""A session records the user type it was given, and invents nothing."""
import queue
from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from chat_ddb import ensure_session


def _table_without_session():
    """A session table where the get returns nothing, so ensure_session creates."""
    table = MagicMock()
    table.get_item.return_value = {}
    resource = MagicMock()
    resource.Table.return_value = table
    return resource, table


def _created_item(table):
    return table.put_item.call_args.kwargs['Item']


def _create(user_type=None):
    resource, table = _table_without_session()
    ensure_session(resource, 'sessions', 'u-1', 's-1', 'agent-1', 'app-1',
                   user_type=user_type)
    return _created_item(table)


class TestUserTypeIsRecordedAsGiven:

    def test_internal_user_type_is_stored(self):
        assert _create('internal-user')['user_type'] == 'internal-user'

    def test_external_user_type_is_stored(self):
        assert _create('external-user')['user_type'] == 'external-user'

    def test_an_unrecognised_type_is_stored_verbatim(self):
        """Normalising here would hide a renamed type rather than surface it."""
        assert _create('partner-user')['user_type'] == 'partner-user'


class TestUnknownUserTypeIsNotInvented:

    def test_absent_user_type_is_omitted_entirely(self):
        assert 'user_type' not in _create(None)

    def test_absent_user_type_is_not_recorded_as_internal(self):
        assert _create(None).get('user_type') != 'internal-user'

    def test_default_argument_omits_it_too(self):
        resource, table = _table_without_session()
        ensure_session(resource, 'sessions', 'u-1', 's-1', 'agent-1', 'app-1')
        assert 'user_type' not in _created_item(table)


class TestTheRestOfTheSessionIsUnchanged:
    """The omission must not disturb the item every session reader expects."""

    @pytest.mark.parametrize('field', [
        'user_id', 'session_id', 'agent_id', 'agent_alias_id', 'chat_app_id',
        'chat_app_sk', 'identity_id', 'create_date', 'last_update', 'source',
        'input_tokens', 'output_tokens', 'input_cost', 'output_cost', 'total_cost',
    ])
    def test_field_still_written(self, field):
        assert field in _create(None)

    def test_costs_are_still_decimals(self):
        item = _create(None)
        for field in ('input_cost', 'output_cost', 'total_cost'):
            assert isinstance(item[field], Decimal)

    def test_session_attributes_still_written_when_given(self):
        resource, table = _table_without_session()
        ensure_session(resource, 'sessions', 'u-1', 's-1', 'agent-1', 'app-1',
                       session_attributes={'accountId': 'acct-1'})
        assert _created_item(table)['session_attributes'] == {'accountId': 'acct-1'}


class TestTheHandlerPassesWhatItRead:
    """The read in the handler must not reintroduce a default of its own."""

    def _ctx(self):
        ctx = MagicMock()
        ctx.get_remaining_time_in_millis.return_value = 300_000
        return ctx

    def _run(self, user_record):
        import json
        from unittest.mock import patch

        import handler as h

        event = {'body': json.dumps({
            'agentId': 'agent-x',
            'userId': 'user-001',
            'sessionId': 'sess-1',
            'message': 'hi',
        })}
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
        return mock_ensure.call_args.kwargs['user_type']

    def test_a_record_without_a_type_reaches_the_session_as_unknown(self):
        assert self._run({'user_id': 'user-001'}) is None

    def test_a_stored_type_is_passed_through(self):
        assert self._run({'user_id': 'user-001', 'user_type': 'external-user'}) == 'external-user'

    def test_a_stored_internal_type_is_passed_through(self):
        assert self._run({'user_id': 'user-001', 'user_type': 'internal-user'}) == 'internal-user'
