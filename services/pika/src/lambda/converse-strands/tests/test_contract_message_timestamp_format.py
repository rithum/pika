"""
CONTRACT TESTS: message timestamp format.

Message records written by the Strands converse Lambda must use ISO-8601
timestamps (e.g. "2026-04-20T21:02:09.712772+00:00"), NOT epoch milliseconds.

Why this contract exists:
  The message-changed Lambda runs a painless script on every message write to
  update per-session timing analytics in OpenSearch (messages_analysis field).
  The script calls `ZonedDateTime.parse(last.timestamp)` expecting an ISO-8601
  string. If Strands writes timestamps as epoch-millis integers, the script
  fails on the 2nd+ message in a session with:

    illegal_argument_exception: [illegal_argument_exception] Reason: failed to
    execute script

  Result: FAILED_REPLICATION on every assistant message, and session-level
  timing analytics (response time, think time, gap distributions) stop
  updating after the first message.

  The TS Bedrock converse Lambda writes ISO strings. Strands must match.

See also:
  - services/pika/src/lambda/message-changed/index.ts:356-483
    (updateMessagesAnalysis — the painless script consumer)
  - chat_ddb.py::_now_iso()
"""
import re
from unittest.mock import MagicMock, patch

import pytest


# ISO-8601 UTC format: YYYY-MM-DDTHH:MM:SS(.ffffff)?(+HH:MM|Z)
_ISO_8601_UTC = re.compile(
    r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$'
)


def _collect_add_message_calls(mock_add_message) -> list[dict]:
    """Extract the `item` kwarg (3rd positional) from every add_message call."""
    items = []
    for call in mock_add_message.call_args_list:
        # add_message(dynamodb, table_name, item)
        args, kwargs = call
        if 'item' in kwargs:
            items.append(kwargs['item'])
        elif len(args) >= 3:
            items.append(args[2])
    return items


class TestMessageTimestampIsIso:
    """Contract: every add_message call must write an ISO-8601 timestamp."""

    def test_now_iso_helper_matches_iso_8601(self):
        """_now_iso() itself must return a valid ISO-8601 UTC timestamp."""
        from chat_ddb import _now_iso
        value = _now_iso()
        assert isinstance(value, str), f'_now_iso must return str; got {type(value)}'
        assert _ISO_8601_UTC.match(value), (
            f'_now_iso returned {value!r} which is not ISO-8601 UTC. '
            f'ZonedDateTime.parse (OpenSearch painless) will reject this.'
        )

    def test_now_iso_is_parseable_by_fromisoformat(self):
        """Sanity check: Python can round-trip its own ISO output.

        ZonedDateTime.parse on the OpenSearch side is stricter but accepts
        the same format Python produces.
        """
        from datetime import datetime
        from chat_ddb import _now_iso
        datetime.fromisoformat(_now_iso())  # must not raise

    def test_user_message_timestamp_is_iso(self, valid_event, fake_context):
        """Handler must write the user message with an ISO timestamp."""
        from handler import handler as lambda_handler

        with patch('handler.dynamodb'), \
             patch('handler.get_user', return_value={'user_id': 'test-user-001',
                                                     'user_type': 'internal-user'}), \
             patch('handler.ensure_session'), \
             patch('handler.get_messages', return_value=[]), \
             patch('handler.add_message') as mock_add, \
             patch('handler.load_agent', return_value={
                 'agent_id': 'test-agent-001', 'base_prompt': 'x',
                 'foundation_model': 'test-model', 'tool_ids': [], 'collaborators': [],
             }), \
             patch('handler.Agent'):
            lambda_handler(valid_event, fake_context)

        items = _collect_add_message_calls(mock_add)
        user_items = [i for i in items if i.get('source') == 'user']
        assert user_items, 'handler must write at least one user message'
        for item in user_items:
            ts = item.get('timestamp')
            assert isinstance(ts, str), (
                f"user message timestamp must be an ISO string; got {type(ts).__name__} "
                f"value {ts!r} — the OpenSearch painless script will fail on ZonedDateTime.parse"
            )
            assert _ISO_8601_UTC.match(ts), (
                f"user message timestamp {ts!r} must match ISO-8601 UTC format"
            )

    def test_assistant_message_timestamp_is_iso(self, valid_event, fake_context):
        """Handler must write the assistant message with an ISO timestamp."""
        from handler import handler as lambda_handler

        fake_agent = MagicMock()
        fake_agent.return_value = MagicMock(
            message={'content': [{'text': 'hi'}]},
            metrics=MagicMock(accumulated_usage={'inputTokens': 1, 'outputTokens': 1}),
        )

        with patch('handler.dynamodb'), \
             patch('handler.get_user', return_value={'user_id': 'test-user-001',
                                                     'user_type': 'internal-user'}), \
             patch('handler.ensure_session'), \
             patch('handler.update_session'), \
             patch('handler.get_messages', return_value=[]), \
             patch('handler.add_message') as mock_add, \
             patch('handler.load_agent', return_value={
                 'agent_id': 'test-agent-001', 'base_prompt': 'x',
                 'foundation_model': 'test-model', 'tool_ids': [], 'collaborators': [],
             }), \
             patch('handler.Agent', return_value=fake_agent):
            lambda_handler(valid_event, fake_context)

        items = _collect_add_message_calls(mock_add)
        assistant_items = [i for i in items if i.get('source') == 'assistant']
        # Not strictly required that an assistant message gets persisted in every
        # test path — but if one is, its timestamp must be ISO.
        for item in assistant_items:
            ts = item.get('timestamp')
            assert isinstance(ts, str), (
                f"assistant message timestamp must be an ISO string; got {type(ts).__name__} "
                f"value {ts!r}"
            )
            assert _ISO_8601_UTC.match(ts), (
                f"assistant message timestamp {ts!r} must match ISO-8601 UTC format"
            )

    def test_no_integer_timestamps_in_handler_writes(self):
        """Regression guard: scan the handler source for bare `_now_ms()` used
        as the `'timestamp'` value in add_message dicts. If this test ever
        trips, someone reintroduced the epoch-millis bug.
        """
        import os
        import handler as _handler_module  # noqa: F401 — just to locate the file

        handler_path = os.path.join(
            os.path.dirname(os.path.abspath(_handler_module.__file__)), 'handler.py'
        )
        with open(handler_path, 'r') as f:
            src = f.read()

        # Search for "'timestamp': _now_ms()" (or double-quoted variant) used
        # in add_message item dicts. The synthetic turn-taking repair uses
        # `'timestamp': 0` which is in-memory only — that's allowed.
        bad_patterns = [
            "'timestamp': _now_ms()",
            '"timestamp": _now_ms()',
        ]
        for pat in bad_patterns:
            assert pat not in src, (
                f"handler.py contains `{pat}` — this regresses the message-changed "
                f"OpenSearch painless script compatibility. Use _now_iso() instead."
            )
