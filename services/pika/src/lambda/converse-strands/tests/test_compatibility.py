"""Compatibility tests for ES-2996 Milestone 3.

Verifies that the Strands converse Lambda produces output that is
wire-compatible with the TypeScript converse Lambda so the frontend
can switch between the two paths transparently.

Test areas:
  1. Streaming format  — plain text, <trace>JSON</trace>, <heartbeat/>, <pika-metadata>
  2. Session attributes — userId, accountId/customData, currentDate in tool payloads
  3. DynamoDB records  — source, model, timestamp fields match TypeScript path
  4. Response headers  — x-chatbot-session-id present
"""
import json
import queue
import re
import time
import threading
import pytest
from unittest.mock import patch, MagicMock, call


def _make_sw():
    """Create a _StreamWriter with a queue and return (writer, drain_fn).

    drain_fn() reads all chunks from the queue up to _STREAM_DONE and returns
    the concatenated string — replaces the old get_buffered_body() API.
    """
    from handler import _StreamWriter, _STREAM_DONE
    q = queue.Queue()
    sw = _StreamWriter(q)

    def drain():
        parts = []
        while True:
            item = q.get_nowait()
            if item is _STREAM_DONE:
                break
            parts.append(item)
        return ''.join(parts)

    return sw, drain


# ---------------------------------------------------------------------------
# Shared helpers / constants
# ---------------------------------------------------------------------------

MOCK_AGENT_DEF = {
    'agent_id': 'test-agent-001',
    'base_prompt': 'You are a test assistant.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': [],
}

MOCK_TOOL_DEF = {
    'tool_id': 'oa_elasticsearch',
    'name': 'oa_elasticsearch',
    'lambda_arn': 'arn:aws:lambda:us-east-1:123456789:function:test-tool',
    'function_schema': [
        {
            'name': 'search',
            'description': 'Search for data',
            'parameters': [
                {'name': 'query', 'type': 'string', 'description': 'query', 'required': True},
            ],
        }
    ],
}


def _handler_patches(agent_return='Bot response', custom_data=None):
    """Return a context manager that patches all external I/O for handler tests.

    agent_return: what str(agent_result) returns
    custom_data: dict to return as the user's custom_data (default: empty)
    """
    user_record = {'user_id': 'test-user-001', 'custom_data': custom_data or {}}

    mock_ddb = MagicMock()
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    mock_table.get_item.return_value = {
        'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
    }

    mock_agent_instance = MagicMock()
    mock_agent_instance.return_value = agent_return
    MockAgent = MagicMock(return_value=mock_agent_instance)

    return (
        patch('handler.dynamodb', mock_ddb),
        patch('handler.Agent', MockAgent),
        patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
        patch('handler.get_user', return_value=user_record),
        mock_ddb,
        mock_table,
        MockAgent,
    )


# ---------------------------------------------------------------------------
# 1. Streaming format
# ---------------------------------------------------------------------------

class TestStreamWriter:
    """Unit tests for _StreamWriter (the queue-based streaming abstraction)."""

    def test_write_puts_chunks_on_queue(self):
        from handler import _StreamWriter, _STREAM_DONE
        q = queue.Queue()
        sw = _StreamWriter(q)
        sw.write('hello ')
        sw.write('world')
        assert q.get_nowait() == 'hello '
        assert q.get_nowait() == 'world'

    def test_write_converts_bytes_to_str(self):
        from handler import _StreamWriter
        q = queue.Queue()
        sw = _StreamWriter(q)
        sw.write(b'bytes chunk')
        assert q.get_nowait() == 'bytes chunk'

    def test_end_puts_sentinel_on_queue(self):
        from handler import _StreamWriter, _STREAM_DONE
        q = queue.Queue()
        sw = _StreamWriter(q)
        sw.write('data')
        sw.end()
        q.get_nowait()  # skip 'data'
        assert q.get_nowait() is _STREAM_DONE

    def test_set_headers_stores_session_id(self):
        from handler import _StreamWriter
        q = queue.Queue()
        sw = _StreamWriter(q)
        sw.set_headers('sess-123')
        assert sw.session_id == 'sess-123'


class TestCallback:
    """Tests for the _make_callback Strands callback handler."""

    def test_text_chunk_written_as_plain_text(self):
        from handler import _make_callback
        sw, drain = _make_sw()
        cb = _make_callback(sw)
        cb(data='Hello, world!', event={})
        sw.end()
        assert drain() == 'Hello, world!'

    def test_empty_data_writes_nothing(self):
        from handler import _make_callback
        sw, drain = _make_sw()
        cb = _make_callback(sw)
        cb(data='', event={})
        sw.end()
        assert drain() == ''

    def test_multiple_chunks_concatenate(self):
        from handler import _make_callback
        sw, drain = _make_sw()
        cb = _make_callback(sw)
        cb(data='Hello', event={})
        cb(data=', ', event={})
        cb(data='world!', event={})
        sw.end()
        assert drain() == 'Hello, world!'

    def test_tool_use_event_does_not_write_trace(self):
        """Tool traces are now emitted from agent_loader tool wrappers, not the callback.

        This ensures correct ordering when the model makes parallel tool calls.
        """
        from handler import _make_callback
        sw, drain = _make_sw()
        cb = _make_callback(sw)
        event = {
            'contentBlockStart': {
                'start': {
                    'toolUse': {'toolUseId': 'abc', 'name': 'search'}
                }
            }
        }
        cb(data='', event=event)
        sw.end()
        body = drain()
        assert body == ''  # callback should NOT emit tool traces

    def test_write_tool_result_trace_invocation_input(self):
        """write_tool_result_trace emits invocationInput when invocation_input is provided."""
        sw, drain = _make_sw()
        sw.write_tool_result_trace('my_tool', None, invocation_input={
            'actionGroupName': 'my_tool',
            'function': 'my_tool',
            'parameters': [{'name': 'q', 'type': 'string', 'value': 'test'}],
        })
        sw.end()
        body = drain()
        assert body.startswith('<trace>')
        inner = json.loads(body[len('<trace>'):-len('</trace>')])
        inv_input = inner['orchestrationTrace']['invocationInput']
        assert inv_input['invocationType'] == 'ACTION_GROUP'
        assert inv_input['actionGroupInvocationInput']['function'] == 'my_tool'

    def test_write_tool_result_trace_observation(self):
        """write_tool_result_trace emits observation when result_text is provided."""
        sw, drain = _make_sw()
        sw.write_tool_result_trace('my_tool', '{"result": "data"}')
        sw.end()
        body = drain()
        assert '<trace>' in body
        inner = json.loads(body[len('<trace>'):-len('</trace>')])
        obs = inner['orchestrationTrace']['observation']
        assert obs['actionGroupInvocationOutput']['text'] == '{"result": "data"}'

    def test_non_tool_event_writes_no_trace(self):
        from handler import _make_callback
        sw, drain = _make_sw()
        cb = _make_callback(sw)
        cb(data='text', event={'someOtherKey': {}})
        sw.end()
        assert '<trace>' not in drain()


class TestHeartbeat:
    """Tests for the _Heartbeat class."""

    def test_heartbeat_fires_heartbeat_tag(self):
        from handler import _Heartbeat, HEARTBEAT_INTERVAL_SECONDS
        sw, drain = _make_sw()
        hb = _Heartbeat(sw)
        # Fire manually instead of waiting 15 seconds
        hb._fire()
        sw.end()
        assert '<heartbeat/>' in drain()

    def test_heartbeat_stop_prevents_further_fires(self):
        from handler import _Heartbeat
        sw, drain = _make_sw()
        hb = _Heartbeat(sw)
        hb.stop()
        hb._fire()  # should be a no-op because _stopped is set
        sw.end()
        assert drain() == ''

    def test_heartbeat_interval_is_15_seconds(self):
        from handler import HEARTBEAT_INTERVAL_SECONDS
        assert HEARTBEAT_INTERVAL_SECONDS == 15


class TestStreamingFormat:
    """End-to-end streaming format tests via the full handler."""

    def _run_handler(self, event, context, custom_data=None):
        """Run the handler in buffered mode and return (result, mock_table)."""
        p1, p2, p3, p4, p5, p6, mock_ddb, mock_table, MockAgent = _handler_patches(
            agent_return='Answer text', custom_data=custom_data
        )
        with p1, p2, p3, p4, p5, p6:
            from handler import handler
            result = handler(event, context)
        return result, mock_table

    def test_body_contains_pika_metadata_tag(self, valid_event, fake_context):
        result, _ = self._run_handler(valid_event, fake_context)
        assert result['statusCode'] == 200
        assert '<pika-metadata>' in result['body']
        assert '</pika-metadata>' in result['body']

    def test_pika_metadata_is_valid_json(self, valid_event, fake_context):
        result, _ = self._run_handler(valid_event, fake_context)
        match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', result['body'])
        assert match, 'No pika-metadata tag found'
        parsed = json.loads(match.group(1))
        assert isinstance(parsed, dict)

    def test_pika_metadata_contains_required_keys(self, valid_event, fake_context):
        """pika-metadata must include userMessageId, assistantMessageId,
        sessionLastUpdate, sessionLastMessageId — matching TypeScript shape."""
        result, _ = self._run_handler(valid_event, fake_context)
        match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', result['body'])
        parsed = json.loads(match.group(1))
        assert 'userMessageId' in parsed
        assert 'assistantMessageId' in parsed
        assert 'sessionLastUpdate' in parsed
        assert 'sessionLastMessageId' in parsed

    def test_pika_metadata_message_ids_start_with_session_id(self, valid_event, fake_context):
        result, _ = self._run_handler(valid_event, fake_context)
        match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', result['body'])
        parsed = json.loads(match.group(1))
        assert parsed['userMessageId'].startswith('test-session-001:')
        assert parsed['assistantMessageId'].startswith('test-session-001:')

    def test_response_has_session_id_header(self, valid_event, fake_context):
        """x-chatbot-session-id header must be present in the response."""
        result, _ = self._run_handler(valid_event, fake_context)
        assert result['headers']['x-chatbot-session-id'] == 'test-session-001'


# ---------------------------------------------------------------------------
# 2. Session attributes
# ---------------------------------------------------------------------------

class TestSessionAttributes:
    """Verify sessionAttributes and promptSessionAttributes in tool Lambda payloads."""

    def _invoke_tool(self, session_attributes, prompt_session_attributes=None):
        """Build a tool with the given session attributes and invoke it, returning the payload."""
        from agent_loader import _make_tool

        mock_payload = MagicMock()
        mock_payload.read.return_value = json.dumps({
            'response': {
                'functionResponse': {
                    'responseState': 'SUCCESS',
                    'responseBody': {'TEXT': {'body': 'ok'}},
                }
            }
        }).encode()

        with patch('agent_loader.lambda_client') as mock_lambda:
            mock_lambda.invoke.return_value = {'Payload': mock_payload}

            tool = _make_tool(
                tool_id='oa_es',
                lambda_arn='arn:test',
                func_name='search',
                func_desc='Search',
                params=[{'name': 'query', 'type': 'string', 'description': 'q', 'required': True}],
                session_id='sess-1',
                input_text='find something',
                session_attributes=session_attributes,
                prompt_session_attributes=prompt_session_attributes or {},
            )

            tool._tool_func({'toolUseId': 'u1', 'input': {'query': 'test'}})

            payload = json.loads(mock_lambda.invoke.call_args.kwargs['Payload'])
        return payload

    def test_session_attributes_passed_through_to_payload(self):
        attrs = {'userId': 'user-abc', 'currentDate': '2025-01-01T00:00:00+00:00'}
        payload = self._invoke_tool(attrs)
        assert payload['sessionAttributes'] == attrs

    def test_prompt_session_attributes_passed_through_to_payload(self):
        prompt_attrs = {'userId': 'user-abc', 'currentDate': '2025-01-01T00:00:00+00:00'}
        payload = self._invoke_tool({'userId': 'u'}, prompt_attrs)
        assert payload['promptSessionAttributes'] == prompt_attrs

    def test_empty_session_attributes_sends_empty_dict(self):
        payload = self._invoke_tool({})
        assert payload['sessionAttributes'] == {}

    def test_none_session_attributes_sends_empty_dict(self):
        payload = self._invoke_tool(None)
        assert payload['sessionAttributes'] == {}

    def test_account_id_from_custom_data_is_in_session_attributes(self):
        """accountId from user's customData should be spread into sessionAttributes."""
        attrs = {'accountId': '99999', 'userId': 'user-abc', 'currentDate': '2025-01-01T00:00:00+00:00'}
        payload = self._invoke_tool(attrs)
        assert payload['sessionAttributes']['accountId'] == '99999'

    def test_user_id_in_session_attributes(self):
        attrs = {'userId': 'user-abc', 'currentDate': '2025-01-01T00:00:00+00:00'}
        payload = self._invoke_tool(attrs)
        assert payload['sessionAttributes']['userId'] == 'user-abc'

    def test_current_date_in_session_attributes_is_iso_string(self):
        """currentDate must be an ISO 8601 string (not epoch ms)."""
        iso_date = '2025-01-15T12:00:00+00:00'
        attrs = {'userId': 'u', 'currentDate': iso_date}
        payload = self._invoke_tool(attrs)
        # Must be a string, not an int
        assert isinstance(payload['sessionAttributes']['currentDate'], str)
        # Must parse as ISO 8601
        from datetime import datetime
        datetime.fromisoformat(payload['sessionAttributes']['currentDate'])


class TestHandlerSessionAttributesPopulation:
    """Verify the handler correctly builds sessionAttributes from user's DynamoDB record."""

    def _run_and_capture_tool_build_call(self, valid_event, fake_context, custom_data):
        """Run handler and capture the kwargs passed to build_strands_tools."""
        user_record = {'user_id': 'test-user-001', 'custom_data': custom_data}
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {
            'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
        }

        captured = {}

        def fake_build_tools(tool_defs, session_id, input_text, session_attributes=None, prompt_session_attributes=None, trace_callback=None):
            captured['session_attributes'] = session_attributes
            captured['prompt_session_attributes'] = prompt_session_attributes
            return []

        mock_agent_def = {**MOCK_AGENT_DEF, 'tool_ids': ['oa_es']}

        with patch('handler.dynamodb', mock_ddb), \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value=mock_agent_def), \
             patch('handler.load_tools', return_value=[MOCK_TOOL_DEF]), \
             patch('handler.build_strands_tools', side_effect=fake_build_tools), \
             patch('handler.get_user', return_value=user_record):

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            handler(valid_event, fake_context)

        return captured

    def test_user_id_in_session_attributes(self, valid_event, fake_context):
        captured = self._run_and_capture_tool_build_call(valid_event, fake_context, {})
        assert captured['session_attributes']['userId'] == 'test-user-001'

    def test_agent_id_in_session_attributes(self, valid_event, fake_context):
        captured = self._run_and_capture_tool_build_call(valid_event, fake_context, {})
        assert captured['session_attributes']['agentId'] == 'test-agent-001'

    def test_current_date_in_session_attributes(self, valid_event, fake_context):
        captured = self._run_and_capture_tool_build_call(valid_event, fake_context, {})
        current_date = captured['session_attributes']['currentDate']
        assert isinstance(current_date, str)
        from datetime import datetime
        datetime.fromisoformat(current_date)

    def test_custom_data_spread_into_session_attributes(self, valid_event, fake_context):
        """accountId from user.customData must be present in sessionAttributes."""
        captured = self._run_and_capture_tool_build_call(
            valid_event, fake_context, {'accountId': '12345'}
        )
        assert captured['session_attributes']['accountId'] == '12345'

    def test_custom_data_values_coerced_to_strings(self, valid_event, fake_context):
        """Bedrock requires all session attribute values to be strings."""
        captured = self._run_and_capture_tool_build_call(
            valid_event, fake_context, {'numericField': 42}
        )
        assert captured['session_attributes']['numericField'] == '42'

    def test_user_id_in_prompt_session_attributes(self, valid_event, fake_context):
        captured = self._run_and_capture_tool_build_call(valid_event, fake_context, {})
        assert captured['prompt_session_attributes']['userId'] == 'test-user-001'

    def test_current_date_in_prompt_session_attributes(self, valid_event, fake_context):
        captured = self._run_and_capture_tool_build_call(valid_event, fake_context, {})
        current_date = captured['prompt_session_attributes']['currentDate']
        from datetime import datetime
        datetime.fromisoformat(current_date)

    def test_message_id_in_prompt_session_attributes(self, valid_event, fake_context):
        captured = self._run_and_capture_tool_build_call(valid_event, fake_context, {})
        msg_id = captured['prompt_session_attributes']['messageId']
        assert msg_id.startswith('test-session-001:')

    def test_no_user_record_still_populates_user_id(self, valid_event, fake_context):
        """get_user returning None must not crash — userId is still populated."""
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {
            'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
        }

        captured = {}

        def fake_build_tools(tool_defs, session_id, input_text, session_attributes=None, prompt_session_attributes=None, trace_callback=None):
            captured['session_attributes'] = session_attributes
            return []

        mock_agent_def = {**MOCK_AGENT_DEF, 'tool_ids': ['oa_es']}

        with patch('handler.dynamodb', mock_ddb), \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value=mock_agent_def), \
             patch('handler.load_tools', return_value=[MOCK_TOOL_DEF]), \
             patch('handler.build_strands_tools', side_effect=fake_build_tools), \
             patch('handler.get_user', return_value=None):

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'resp'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            handler(valid_event, fake_context)

        assert captured['session_attributes']['userId'] == 'test-user-001'


# ---------------------------------------------------------------------------
# 3. DynamoDB records
# ---------------------------------------------------------------------------

class TestDdbMessageFormat:
    """Verify that DynamoDB message records match the TypeScript converse path format."""

    def _get_put_items(self, valid_event, fake_context):
        """Run handler and collect all items passed to table.put_item."""
        p1, p2, p3, p4, p5, p6, mock_ddb, mock_table, MockAgent = _handler_patches(
            agent_return='Bot response'
        )
        mock_agent_instance = MockAgent.return_value
        mock_agent_instance.return_value = 'Bot response'

        with p1, p2, p3, p4, p5, p6:
            from handler import handler
            handler(valid_event, fake_context)

        return [c.kwargs.get('Item', {}) for c in mock_table.put_item.call_args_list]

    def test_user_message_source_is_user(self, valid_event, fake_context):
        """source for the user message must be 'user', not 'human'."""
        items = self._get_put_items(valid_event, fake_context)
        user_msgs = [i for i in items if i.get('message') == 'What orders are pending for account 12345?']
        assert len(user_msgs) >= 1
        assert user_msgs[0]['source'] == 'user'

    def test_assistant_message_source_is_assistant(self, valid_event, fake_context):
        """source for the assistant message must be 'assistant', not 'bot'."""
        items = self._get_put_items(valid_event, fake_context)
        bot_msgs = [i for i in items if i.get('model')]
        assert len(bot_msgs) >= 1
        assert bot_msgs[0]['source'] == 'assistant'

    def test_assistant_message_has_model_field(self, valid_event, fake_context):
        """The assistant message must have a 'model' field — TypeScript always writes it."""
        items = self._get_put_items(valid_event, fake_context)
        bot_msgs = [i for i in items if i.get('source') == 'assistant']
        assert len(bot_msgs) >= 1
        assert 'model' in bot_msgs[0]
        assert bot_msgs[0]['model']  # non-empty

    def test_all_messages_have_message_id(self, valid_event, fake_context):
        items = self._get_put_items(valid_event, fake_context)
        chat_msgs = [i for i in items if 'source' in i]
        for msg in chat_msgs:
            assert 'message_id' in msg

    def test_message_ids_use_session_colon_timestamp_format(self, valid_event, fake_context):
        """message_id must be {sessionId}:{timestamp} for begins_with queries."""
        items = self._get_put_items(valid_event, fake_context)
        chat_msgs = [i for i in items if 'source' in i]
        for msg in chat_msgs:
            assert msg['message_id'].startswith('test-session-001:')


# ---------------------------------------------------------------------------
# 4. Response headers
# ---------------------------------------------------------------------------

class TestResponseHeaders:
    """Verify x-chatbot-session-id is present in all success responses."""

    def _run(self, event, context):
        p1, p2, p3, p4, p5, p6, *_ = _handler_patches()
        with p1, p2, p3, p4, p5, p6:
            from handler import handler
            return handler(event, context)

    def test_session_id_header_present_with_provided_session_id(self, valid_event, fake_context):
        result = self._run(valid_event, fake_context)
        assert 'x-chatbot-session-id' in result['headers']
        assert result['headers']['x-chatbot-session-id'] == 'test-session-001'

    def test_session_id_header_present_when_session_generated(self, event_without_session_id, fake_context):
        p1, p2, p3, p4, p5, p6, mock_ddb, mock_table, _ = _handler_patches()
        mock_table.get_item.return_value = {}
        with p1, p2, p3, p4, p5, p6:
            from handler import handler
            result = handler(event_without_session_id, fake_context)
        assert 'x-chatbot-session-id' in result['headers']
        assert result['headers']['x-chatbot-session-id']  # non-empty UUID


# ---------------------------------------------------------------------------
# 5. build_strands_tools backward compatibility
# ---------------------------------------------------------------------------

class TestBuildStrandsToolsBackwardCompat:
    """Ensure build_strands_tools still works without session attributes."""

    def test_omitting_session_attributes_defaults_to_empty_dict(self):
        """Existing callers that don't pass session_attributes must still work."""
        from agent_loader import build_strands_tools
        tools = build_strands_tools([MOCK_TOOL_DEF], 'sess-1', 'hello')
        assert len(tools) == 1

    def test_tool_invocation_with_no_session_attributes_sends_empty_dicts(self):
        from agent_loader import build_strands_tools

        mock_payload = MagicMock()
        mock_payload.read.return_value = json.dumps({
            'response': {'functionResponse': {'responseState': 'SUCCESS',
                                              'responseBody': {'TEXT': {'body': 'ok'}}}}
        }).encode()

        with patch('agent_loader.lambda_client') as mock_lambda:
            mock_lambda.invoke.return_value = {'Payload': mock_payload}
            tools = build_strands_tools([MOCK_TOOL_DEF], 'sess-1', 'hello')
            tools[0]._tool_func({'toolUseId': 'u1', 'input': {'query': 'q'}})
            payload = json.loads(mock_lambda.invoke.call_args.kwargs['Payload'])

        assert payload['sessionAttributes'] == {}
        assert payload['promptSessionAttributes'] == {}
