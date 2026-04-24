"""
CONTRACT TESTS: Session continuity and lastUpdate tracking.

These tests are EXPECTED TO FAIL until session management enhancements are implemented.

Observable behavior contracts for the Strands path:
  - Strands creates a fresh Agent() per invocation — there is no server-side session state.
    Therefore history is ALWAYS loaded from DDB, regardless of session age.
    (This differs from the TS path which only replays on 9-min expiry.)
  - The session's lastUpdate field must be updated after every successful response,
    so downstream consumers (session list UI, session insights) see accurate timestamps.
  - New sessions (no prior messages) work correctly with empty history.
  - The handler must track session metadata (lastUpdate, lastMessageId) for UI consistency.
"""

import json
import time
import re
import pytest
from datetime import datetime, timezone
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


def _make_ddb_message(session_id, timestamp, source, text):
    return {
        'user_id': 'user-001',
        'session_id': session_id,
        'message_id': f'{session_id}:{timestamp}',
        'message': text,
        'source': source,
        'timestamp': timestamp,
    }


def _parse_pika_metadata(body: str) -> dict:
    match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', body, re.DOTALL)
    if not match:
        return {}
    return json.loads(match.group(1))


# ---------------------------------------------------------------------------
# Tests: history always loaded (Strands has no native session memory)
# ---------------------------------------------------------------------------

class TestHistoryAlwaysLoaded:
    """Contract: Strands always loads history from DDB — no session age check needed."""

    def test_recent_session_still_receives_history(self):
        """Even a session only 1 minute old must have history loaded.

        Observable: the agent receives prior messages regardless of session age.
        Strands has no server-side session state — history must always be passed.
        """
        prior_messages = [
            _make_ddb_message('sess-001', 1000, 'user', 'What is 2+2?'),
            _make_ddb_message('sess-001', 2000, 'assistant', 'It is 4.'),
        ]

        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value=_make_agent_def()), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]), \
             patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}), \
             patch('handler.get_messages', return_value=prior_messages):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'Follow-up answer'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            event = {'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-001', 'message': 'Follow-up question',
            })}
            result = handler(event, _make_ctx())

            assert result['statusCode'] == 200

            # Agent must receive prior messages
            MockAgent.assert_called_once()
            agent_kwargs = MockAgent.call_args.kwargs
            messages = agent_kwargs.get('messages', [])
            assert len(messages) >= 2, f'Expected prior history, got {len(messages)} messages'

            # Verify the content is from the prior conversation
            all_text = ' '.join(
                str(c.get('text', '')) for m in messages for c in m.get('content', [])
            )
            assert 'What is 2+2' in all_text or 'It is 4' in all_text


class TestNewSessionEmptyHistory:
    """Contract: new session with no messages passes empty history."""

    def test_new_session_passes_empty_messages(self):
        """First message in a new session — agent receives messages=[]."""
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value=_make_agent_def()), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]), \
             patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}), \
             patch('handler.get_messages', return_value=[]):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {}

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'Hello!'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            event = {'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'message': 'Hello for the first time',
            })}
            result = handler(event, _make_ctx())

            assert result['statusCode'] == 200
            MockAgent.assert_called_once()
            agent_kwargs = MockAgent.call_args.kwargs
            messages = agent_kwargs.get('messages', [])
            assert messages == [], f'New session should have empty history, got: {messages}'


# ---------------------------------------------------------------------------
# Tests: session metadata tracking
# ---------------------------------------------------------------------------

class TestSessionMetadataTracking:
    """Contract: session lastUpdate and lastMessageId tracked in pika-metadata."""

    def test_pika_metadata_includes_session_last_update(self):
        """The pika-metadata block must include a fresh sessionLastUpdate timestamp."""
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value=_make_agent_def()), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]), \
             patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}), \
             patch('handler.get_messages', return_value=[]):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'Response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            event = {'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-001', 'message': 'test',
            })}
            result = handler(event, _make_ctx())

            metadata = _parse_pika_metadata(result.get('body', ''))
            assert 'sessionLastUpdate' in metadata
            # Should be a recent ISO timestamp
            assert 'T' in metadata['sessionLastUpdate']

    def test_pika_metadata_includes_session_last_message_id(self):
        """The pika-metadata must include sessionLastMessageId matching the assistant message."""
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value=_make_agent_def()), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]), \
             patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}), \
             patch('handler.get_messages', return_value=[]):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'Response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            event = {'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-001', 'message': 'test',
            })}
            result = handler(event, _make_ctx())

            metadata = _parse_pika_metadata(result.get('body', ''))
            assert 'sessionLastMessageId' in metadata
            assert metadata['sessionLastMessageId'] == metadata['assistantMessageId']
