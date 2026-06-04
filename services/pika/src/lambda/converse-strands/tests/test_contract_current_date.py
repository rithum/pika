"""
CONTRACT TESTS: Current date on the user turn.

Observable behavior contract:
  - currentDate is delivered to the LLM by appending it to the message (the user turn),
    NOT the system prompt — promptSessionAttributes reach tool Lambdas, not the model,
    and putting per-request content in the system prompt would bust the prompt cache.
  - Without today's date in the prompt the model guesses the year for relative ranges
    ("year to date", "last 30 days"). Regression guard for ES-3198.
"""

import contextlib
import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _make_agent_def():
    return {
        'agent_id': 'agent-001', 'base_prompt': 'Be helpful.',
        'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'tool_ids': [],
    }


def _standard_patches(agent_instance):
    mock_ddb = MagicMock()
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}}
    return (
        patch('handler.dynamodb', mock_ddb),
        patch('handler.Agent', MagicMock(return_value=agent_instance)),
        patch('handler.load_agent', return_value=_make_agent_def()),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
        patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
        patch('handler.get_messages', return_value=[]),
        patch('handler.add_message'),
        patch('handler.ensure_session'),
    )


def _run_and_capture_prompt():
    import handler as h  # noqa: PLC0415

    agent_instance = MagicMock(return_value='ok')
    event = {
        'body': json.dumps({
            'agentId': 'agent-001', 'userId': 'user-001',
            'sessionId': 'sess-date', 'message': 'Analyze my year to date orders',
        })
    }
    with contextlib.ExitStack() as stack:
        for p in _standard_patches(agent_instance):
            stack.enter_context(p)
        h.handler(event, _make_ctx())
    agent_instance.assert_called_once()
    return agent_instance.call_args.args[0] if agent_instance.call_args.args else ''


class TestCurrentDateOnTurn:
    def test_message_contains_current_date(self):
        """The message sent to the LLM must include today's date (so relative ranges resolve)."""
        prompt = _run_and_capture_prompt()
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        assert 'current date is' in prompt.lower(), (
            f"Turn message must state the current date. Got: {prompt[-200:]!r}"
        )
        assert today in prompt, (
            f"Turn message must contain today's date ({today}). Got: {prompt[-200:]!r}"
        )

    def test_date_not_injected_into_system_prompt(self):
        """The date must NOT be in the system prompt (cache + contract): system_prompt == base_prompt."""
        import handler as h  # noqa: PLC0415

        captured = {}

        def _capture_agent(**kwargs):
            captured['system_prompt'] = kwargs.get('system_prompt', '')
            inst = MagicMock(return_value='ok')
            return inst

        event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-date-sys', 'message': 'Analyze my year to date orders',
            })
        }
        mock_ddb = MagicMock()
        mock_ddb.Table.return_value.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}}
        with patch('handler.dynamodb', mock_ddb), \
             patch('handler.Agent', _capture_agent), \
             patch('handler.load_agent', return_value=_make_agent_def()), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]), \
             patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}), \
             patch('handler.get_messages', return_value=[]), \
             patch('handler.add_message'), \
             patch('handler.ensure_session'):
            h.handler(event, _make_ctx())

        assert captured['system_prompt'] == 'Be helpful.', (
            f"Date must not be appended to system_prompt (breaks cache + base_prompt contract). "
            f"Got: {captured['system_prompt']!r}"
        )
