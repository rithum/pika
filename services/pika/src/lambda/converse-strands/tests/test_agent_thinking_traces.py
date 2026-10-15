"""Reasoning traces on the plain-agent path."""
import json
import re
from unittest.mock import MagicMock, patch

import pytest

from handler import DEFAULT_MODEL_ID, _is_tool_use_message
from tests.agent_doubles import assert_primary_path
from tests.hook_defaults import base_hooks  # noqa: F401

pytestmark = pytest.mark.usefixtures('base_hooks')

AGENT_ID = 'test-agent-001'

MOCK_AGENT_DEF = {
    'agent_id': AGENT_ID,
    'base_prompt': 'You are a test assistant.',
    'foundation_model': DEFAULT_MODEL_ID,
    'tool_ids': ['test-tools'],
}


class _FakeResult:
    def __init__(self, text):
        self._text = text

    def __str__(self):
        return self._text


def _tool_use_message(text, tool_name):
    return {
        'message': {
            'role': 'assistant',
            'content': [{'text': text}, {'toolUse': {'name': tool_name, 'input': {}}}],
        }
    }


def _tool_result_message():
    return {'message': {'role': 'user', 'content': [{'toolResult': {'status': 'success'}}]}}


def _streamer(events):
    async def stream_async(*_args, **_kwargs):
        for event in events:
            yield event
    return stream_async


def _run_handler(valid_event, fake_context, *, events=None, sync_return='sync answer',
                 stream_raises=None):
    with patch('handler.dynamodb') as mock_ddb, \
         patch('handler.Agent') as MockAgent, \
         patch('handler.load_agent', return_value=MOCK_AGENT_DEF), \
         patch('handler.load_tools', return_value=[{'tool_id': 'test-tools'}]), \
         patch('handler.build_strands_tools', return_value=[MagicMock()]):
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {
            'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
        }

        agent_instance = MagicMock()
        agent_instance.return_value = _FakeResult(sync_return)
        if stream_raises is not None:
            agent_instance.stream_async.side_effect = stream_raises
        else:
            agent_instance.stream_async = _streamer(events or [])
        MockAgent.return_value = agent_instance

        from handler import handler
        result = handler(valid_event, fake_context)
        return result, agent_instance


def _traces(body):
    return [json.loads(t) for t in re.findall(r'<trace>(.*?)</trace>', body, re.DOTALL)]


def _thinking_traces(body):
    found = []
    for trace in _traces(body):
        rationale = trace.get('orchestrationTrace', {}).get('rationale')
        if rationale and rationale.get('traceId', '').startswith('agent-thinking-'):
            found.append(rationale)
    return found


def _body_without_traces(body):
    return re.sub(r'<trace>.*?</trace>', '', body, flags=re.DOTALL)


class TestIsToolUseMessage:

    def test_assistant_message_with_tool_use(self):
        assert _is_tool_use_message(
            {'role': 'assistant', 'content': [{'toolUse': {'name': 'x'}}]}
        )

    def test_assistant_message_without_tool_use(self):
        assert not _is_tool_use_message(
            {'role': 'assistant', 'content': [{'text': 'just an answer'}]}
        )

    def test_tool_result_message_is_not_a_tool_use(self):
        assert not _is_tool_use_message(
            {'role': 'user', 'content': [{'toolResult': {'status': 'success'}}]}
        )

    def test_non_message_values(self):
        assert not _is_tool_use_message(None)
        assert not _is_tool_use_message('assistant')
        assert not _is_tool_use_message({'role': 'assistant'})
        assert not _is_tool_use_message({'role': 'assistant', 'content': 'toolUse'})


class TestRationaleEmission:

    def test_pre_tool_narration_becomes_a_rationale_trace(self, valid_event, fake_context, caplog):
        result, _ = _run_handler(valid_event, fake_context, events=[
            {'data': 'I should look up the order first.'},
            _tool_use_message('I should look up the order first.', 'get_order'),
            _tool_result_message(),
            {'data': 'The order shipped Tuesday.'},
            {'result': _FakeResult('The order shipped Tuesday.')},
        ])

        thinking = _thinking_traces(result['body'])
        assert len(thinking) == 1
        assert thinking[0]['traceId'] == f'agent-thinking-{AGENT_ID}-1'
        assert thinking[0]['text'] == 'I should look up the order first.'
        assert_primary_path(caplog)

    def test_data_and_tool_use_on_one_event_still_flush_the_trace(self, valid_event, fake_context, caplog):
        combined = {'data': ' Checking now.', **_tool_use_message('Checking now.', 'get_order')}
        result, _ = _run_handler(valid_event, fake_context, events=[
            {'data': 'I should look up the order first.'},
            combined,
            _tool_result_message(),
            {'data': 'Then verify shipping.'},
            _tool_use_message('Then verify shipping.', 'get_shipment'),
            _tool_result_message(),
            {'result': _FakeResult('Shipped Tuesday.')},
        ])

        thinking = _thinking_traces(result['body'])
        assert [t['text'] for t in thinking] == [
            'I should look up the order first. Checking now.',
            'Then verify shipping.',
        ]
        assert_primary_path(caplog)

    def test_reasoning_stays_out_of_the_answer_body(self, valid_event, fake_context, caplog):
        result, _ = _run_handler(valid_event, fake_context, events=[
            {'data': 'I should look up the order first.'},
            _tool_use_message('I should look up the order first.', 'get_order'),
            _tool_result_message(),
            {'data': 'The order shipped Tuesday.'},
            {'result': _FakeResult('The order shipped Tuesday.')},
        ])

        answer = _body_without_traces(result['body'])
        assert 'I should look up the order first.' not in answer
        assert 'The order shipped Tuesday.' in answer
        assert_primary_path(caplog)

    def test_each_tool_decision_gets_its_own_trace(self, valid_event, fake_context, caplog):
        result, _ = _run_handler(valid_event, fake_context, events=[
            {'data': 'First I need the order.'},
            _tool_use_message('First I need the order.', 'get_order'),
            _tool_result_message(),
            {'data': 'Now I need the shipment.'},
            _tool_use_message('Now I need the shipment.', 'get_shipment'),
            _tool_result_message(),
            {'data': 'It shipped Tuesday.'},
            {'result': _FakeResult('It shipped Tuesday.')},
        ])

        thinking = _thinking_traces(result['body'])
        assert [t['traceId'] for t in thinking] == [
            f'agent-thinking-{AGENT_ID}-1',
            f'agent-thinking-{AGENT_ID}-2',
        ]
        assert [t['text'] for t in thinking] == [
            'First I need the order.',
            'Now I need the shipment.',
        ]
        assert_primary_path(caplog)

    def test_final_turn_text_is_never_emitted_as_rationale(self, valid_event, fake_context, caplog):
        result, _ = _run_handler(valid_event, fake_context, events=[
            {'data': 'A direct answer with no tools.'},
            {'result': _FakeResult('A direct answer with no tools.')},
        ])

        assert _thinking_traces(result['body']) == []
        assert 'A direct answer with no tools.' in _body_without_traces(result['body'])
        assert_primary_path(caplog)

    def test_silent_tool_decision_emits_no_empty_trace(self, valid_event, fake_context, caplog):
        result, _ = _run_handler(valid_event, fake_context, events=[
            _tool_use_message('', 'get_order'),
            _tool_result_message(),
            {'data': 'Shipped Tuesday.'},
            {'result': _FakeResult('Shipped Tuesday.')},
        ])

        assert _thinking_traces(result['body']) == []
        assert_primary_path(caplog)

    def test_whitespace_only_narration_emits_no_trace(self, valid_event, fake_context, caplog):
        result, _ = _run_handler(valid_event, fake_context, events=[
            {'data': '   \n  '},
            _tool_use_message('   ', 'get_order'),
            _tool_result_message(),
            {'data': 'Shipped Tuesday.'},
            {'result': _FakeResult('Shipped Tuesday.')},
        ])

        assert _thinking_traces(result['body']) == []
        assert_primary_path(caplog)

    def test_answer_comes_from_the_streamed_agent_result(self, valid_event, fake_context, caplog):
        result, agent_instance = _run_handler(valid_event, fake_context, events=[
            {'data': 'thinking'},
            _tool_use_message('thinking', 'get_order'),
            _tool_result_message(),
            {'data': 'streamed answer'},
            {'result': _FakeResult('streamed answer')},
        ])

        assert 'streamed answer' in _body_without_traces(result['body'])
        agent_instance.assert_not_called()
        assert_primary_path(caplog)


class TestSyncFallback:

    def test_stream_failure_falls_back_to_the_sync_call(self, valid_event, fake_context):
        result, agent_instance = _run_handler(
            valid_event, fake_context,
            stream_raises=RuntimeError('stream broke'),
            sync_return='sync answer',
        )

        assert 'sync answer' in _body_without_traces(result['body'])
        agent_instance.assert_called_once()

    def test_stream_without_a_result_event_falls_back(self, valid_event, fake_context):
        result, agent_instance = _run_handler(valid_event, fake_context, events=[
            {'data': 'narration with no result event'},
        ], sync_return='sync answer')

        assert 'sync answer' in _body_without_traces(result['body'])
        agent_instance.assert_called_once()

    def test_successful_stream_does_not_call_the_agent_twice(self, valid_event, fake_context):
        _, agent_instance = _run_handler(valid_event, fake_context, events=[
            {'data': 'answer'},
            {'result': _FakeResult('answer')},
        ])

        agent_instance.assert_not_called()
