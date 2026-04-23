"""Contract tests for the streaming response output format.

These tests define the stable wire format that the frontend depends on.
They should NOT change as implementation evolves.
"""
import json
import re
import pytest
from unittest.mock import patch, MagicMock


MOCK_AGENT_DEF = {
    'agent_id': 'test-agent',
    'base_prompt': 'Test prompt.',
    'foundation_model': 'test-model',
    'tool_ids': [],
}


def _run_handler(message='hello', agent_return='Bot response'):
    """Run handler and return the result dict."""
    with patch('handler.dynamodb') as mock_ddb, \
         patch('handler.Agent') as MockAgent, \
         patch('handler.load_agent', return_value=MOCK_AGENT_DEF), \
         patch('handler.load_tools', return_value=[]), \
         patch('handler.build_strands_tools', return_value=[]), \
         patch('handler.get_user', return_value=None):
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {
            'Item': {'user_id': 'test-user', 'session_id': 'test-session'}
        }
        mock_agent = MagicMock()
        mock_agent.return_value = agent_return
        MockAgent.return_value = mock_agent

        ctx = MagicMock()
        ctx.get_remaining_time_in_millis.return_value = 300000

        from handler import handler
        return handler({
            'body': json.dumps({
                'agentId': 'test-agent',
                'userId': 'test-user',
                'sessionId': 'test-session',
                'message': message,
            })
        }, ctx)


class TestResponseHeaders:
    """HTTP response headers contract."""

    def test_status_200_on_success(self):
        result = _run_handler()
        assert result['statusCode'] == 200

    def test_x_chatbot_session_id_present(self):
        result = _run_handler()
        assert 'x-chatbot-session-id' in result['headers']

    def test_x_chatbot_session_id_matches_request(self):
        result = _run_handler()
        assert result['headers']['x-chatbot-session-id'] == 'test-session'


class TestStreamingFormat:
    """Wire format: text + <trace>JSON</trace> + <heartbeat/> + <pika-metadata>JSON</pika-metadata>."""

    def test_pika_metadata_is_last_element(self):
        result = _run_handler()
        body = result['body']
        assert body.rstrip().endswith('</pika-metadata>')

    def test_pika_metadata_is_valid_json(self):
        result = _run_handler()
        match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', result['body'], re.DOTALL)
        assert match, "No <pika-metadata> tag in response"
        metadata = json.loads(match.group(1))
        assert isinstance(metadata, dict)

    def test_pika_metadata_has_required_fields(self):
        result = _run_handler()
        match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', result['body'], re.DOTALL)
        metadata = json.loads(match.group(1))
        assert 'userMessageId' in metadata
        assert 'assistantMessageId' in metadata
        assert 'sessionLastUpdate' in metadata
        assert 'sessionLastMessageId' in metadata

    def test_message_ids_use_session_colon_timestamp(self):
        result = _run_handler()
        match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', result['body'], re.DOTALL)
        metadata = json.loads(match.group(1))
        assert metadata['userMessageId'].startswith('test-session:')
        assert metadata['assistantMessageId'].startswith('test-session:')

    def test_session_last_update_is_iso_timestamp(self):
        result = _run_handler()
        match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', result['body'], re.DOTALL)
        metadata = json.loads(match.group(1))
        assert 'T' in metadata['sessionLastUpdate']

    def test_agent_text_appears_before_pika_metadata(self):
        result = _run_handler(agent_return='Here is the answer.')
        body = result['body']
        text_pos = body.find('Here is the answer.')
        meta_pos = body.find('<pika-metadata>')
        assert text_pos < meta_pos

    def test_trace_tags_contain_valid_json(self):
        result = _run_handler()
        traces = re.findall(r'<trace>(.*?)</trace>', result['body'], re.DOTALL)
        for trace in traces:
            parsed = json.loads(trace)
            assert isinstance(parsed, dict)


class TestErrorResponses:
    """Error response format contract."""

    def test_400_has_error_field(self):
        with patch('handler.dynamodb'), \
             patch('handler.Agent'), \
             patch('handler.load_agent', return_value=MOCK_AGENT_DEF), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]), \
             patch('handler.get_user', return_value=None):
            from handler import handler
            result = handler({'body': '{}'}, MagicMock(get_remaining_time_in_millis=lambda: 300000))
            assert result['statusCode'] == 400
            body = json.loads(result['body'])
            assert 'error' in body

    def test_agent_error_still_returns_200_with_pika_metadata(self):
        """Mid-stream errors should still include pika-metadata."""
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value=MOCK_AGENT_DEF), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]), \
             patch('handler.get_user', return_value=None):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user', 'session_id': 'test-session'}
            }
            mock_agent = MagicMock()
            mock_agent.side_effect = RuntimeError('Model crashed')
            MockAgent.return_value = mock_agent

            from handler import handler
            result = handler({
                'body': json.dumps({
                    'agentId': 'test-agent', 'userId': 'test-user',
                    'sessionId': 'test-session', 'message': 'hello',
                })
            }, MagicMock(get_remaining_time_in_millis=lambda: 300000))

            assert result['statusCode'] == 200
            assert '<pika-metadata>' in result['body']
