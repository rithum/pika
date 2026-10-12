"""Unit tests for the Strands converse Lambda handler."""
import json
import re
import pytest
from unittest.mock import patch, MagicMock


def _parse_pika_metadata(body: str) -> dict:
    """Extract the pika-metadata JSON from a streaming response body.

    The streaming format ends with <pika-metadata>JSON</pika-metadata>.
    This helper lets tests assert on session IDs and message IDs without
    coupling to the old buffered JSON format.
    """
    match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', body, re.DOTALL)
    if not match:
        raise AssertionError(f'No <pika-metadata> tag found in response body: {body!r}')
    return json.loads(match.group(1))

MOCK_AGENT_DEF = {
    'agent_id': 'test-agent-001',
    'base_prompt': 'You are a test assistant.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': [],
}


def _patch_handler():
    """Common patches for handler tests: dynamodb, Agent, and agent_loader."""
    return (
        patch('handler.dynamodb'),
        patch('handler.Agent'),
        patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
    )


class TestHandlerValidation:

    def test_missing_agent_id_returns_400(self, event_without_agent_id, fake_context):
        p1, p2, p3, p4, p5 = _patch_handler()
        with p1, p2, p3, p4, p5:
            from handler import handler
            result = handler(event_without_agent_id, fake_context)
            assert result['statusCode'] == 400
            body = json.loads(result['body'])
            assert 'agentId' in body['error']

    def test_missing_user_id_returns_400(self, event_without_user_id, fake_context):
        p1, p2, p3, p4, p5 = _patch_handler()
        with p1, p2, p3, p4, p5:
            from handler import handler
            result = handler(event_without_user_id, fake_context)
            assert result['statusCode'] == 400
            body = json.loads(result['body'])
            assert 'userId' in body['error']

    def test_empty_body_returns_400(self, fake_context):
        p1, p2, p3, p4, p5 = _patch_handler()
        with p1, p2, p3, p4, p5:
            from handler import handler
            result = handler({'body': '{}'}, fake_context)
            assert result['statusCode'] == 400


class TestHandlerHappyPath:

    def test_successful_invocation_returns_200(self, valid_event, fake_context):
        p1, p2, p3, p4, p5 = _patch_handler()
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5:
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'Here are the pending orders for account 12345.'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            result = handler(valid_event, fake_context)

            assert result['statusCode'] == 200
            # M3: body is streaming format; metadata is in the <pika-metadata> tag
            metadata = _parse_pika_metadata(result['body'])
            # userMessageId encodes the session ID — verifies correct session was used
            assert metadata['userMessageId'].startswith('test-session-001:')
            assert 'sessionLastUpdate' in metadata

    def test_response_includes_session_header(self, valid_event, fake_context):
        p1, p2, p3, p4, p5 = _patch_handler()
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5:
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'Response text'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            result = handler(valid_event, fake_context)

            assert result['headers']['x-chatbot-session-id'] == 'test-session-001'

    def test_generates_session_id_when_not_provided(self, event_without_session_id, fake_context):
        p1, p2, p3, p4, p5 = _patch_handler()
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5:
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {}  # No existing session — will create one

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'Hello!'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            result = handler(event_without_session_id, fake_context)

            assert result['statusCode'] == 200
            metadata = _parse_pika_metadata(result['body'])
            # userMessageId = {sessionId}:{timestamp} — proves a session was generated
            assert metadata['userMessageId']
            assert ':' in metadata['userMessageId']

    def test_uses_agent_definition_from_dynamodb(self, valid_event, fake_context):
        """Handler should use base_prompt and foundation_model from agent definition."""
        custom_agent = {
            'agent_id': 'test-agent-001',
            'base_prompt': 'You are a custom analytics expert.',
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'tool_ids': [],
        }
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value=custom_agent), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'Response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            handler(valid_event, fake_context)

            # Verify Agent was created with the custom system prompt
            MockAgent.assert_called_once()
            call_kwargs = MockAgent.call_args.kwargs
            assert call_kwargs['system_prompt'] == 'You are a custom analytics expert.'


class TestHandlerDdbWrites:

    def test_writes_user_and_assistant_messages(self, valid_event, fake_context):
        p1, p2, p3, p4, p5 = _patch_handler()
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5:
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'Bot response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            handler(valid_event, fake_context)

            put_calls = mock_table.put_item.call_args_list
            items = [call.kwargs.get('Item', {}) for call in put_calls]
            human_msgs = [m for m in items if m.get('source') == 'user']
            bot_msgs = [m for m in items if m.get('source') == 'assistant']

            assert len(human_msgs) >= 1
            assert len(bot_msgs) >= 1

    def test_assistant_message_retried_without_traces_on_persist_failure(self, valid_event, fake_context):
        """A first-attempt persist failure (e.g. item too large) must not lose the
        reply: traces are dropped and the message text is retried."""
        p1, p2, p3, p4, p5 = _patch_handler()
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5:
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'Bot response'
            MockAgent.return_value = mock_agent_instance

            calls = []
            failed_once = {'done': False}

            def add_message_side_effect(_dynamodb, _table, item):
                calls.append(item)
                if item.get('source') == 'assistant' and not failed_once['done']:
                    failed_once['done'] = True
                    raise RuntimeError('ValidationException: Item size has exceeded the maximum allowed size')

            with patch('handler.add_message', side_effect=add_message_side_effect):
                from handler import handler
                handler(valid_event, fake_context)

            assistant_items = [c for c in calls if c.get('source') == 'assistant']
            assert len(assistant_items) == 2, 'expected a retry after the first persist failure'
            retried = assistant_items[-1]
            assert 'traces' not in retried and 'traces_s3' not in retried
            assert retried.get('traces_dropped') is True
            assert retried['message'] == 'Bot response'

    def test_message_id_format(self, valid_event, fake_context):
        """message_id must be {sessionId}:{timestamp} for begins_with queries."""
        p1, p2, p3, p4, p5 = _patch_handler()
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5:
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'Response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            result = handler(valid_event, fake_context)

            metadata = _parse_pika_metadata(result['body'])
            assert metadata['userMessageId'].startswith('test-session-001:')
            assert metadata['assistantMessageId'].startswith('test-session-001:')


class TestHandlerErrorHandling:

    def test_agent_error_returns_graceful_response(self, valid_event, fake_context):
        p1, p2, p3, p4, p5 = _patch_handler()
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5:
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.side_effect = RuntimeError('Model invocation failed')
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            result = handler(valid_event, fake_context)

            assert result['statusCode'] == 200
            # Graceful fallback text appears in the streaming body before pika-metadata
            body = result['body']
            assert 'error' in body.lower() or 'sorry' in body.lower()

    def test_malformed_json_body_returns_500(self, fake_context):
        from handler import handler
        result = handler({'body': 'not json'}, fake_context)
        assert result['statusCode'] == 500

    def test_missing_agent_definition_returns_500(self, valid_event, fake_context):
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent'), \
             patch('handler.load_agent', side_effect=ValueError("Agent 'test-agent-001' not found")):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }

            from handler import handler
            result = handler(valid_event, fake_context)

            assert result['statusCode'] == 500
            body = json.loads(result['body'])
            assert 'not found' in body['error']
