"""The streaming writer withholds trace content but never withholds it from storage."""
import json
import queue

import pytest

from trace_visibility import ACTIVITY_TRACE_ID, step_handle

SYSTEM_PROMPT_TRACE = {
    'orchestrationTrace': {
        'rationale': {
            'traceId': 'llm-instruction',
            'text': json.dumps({
                'type': 'llm-instruction',
                'compressedData': 'H4sIAAAAAAAAA1NW1EnKzE4tUgQAF5ZLmwsAAAA=',
            }),
        }
    }
}


def _writer(**kwargs):
    """A writer plus a drain() that returns everything queued up to the end sentinel."""
    from handler import _StreamWriter, _STREAM_DONE

    q = queue.Queue()
    writer = _StreamWriter(q, **kwargs)

    def drain():
        parts = []
        while True:
            item = q.get_nowait()
            if item is _STREAM_DONE:
                break
            parts.append(item)
        return ''.join(parts)

    return writer, drain


def _frames(body):
    import re
    return re.findall(r'<trace>(.*?)</trace>', body, re.DOTALL)


class TestContentWithheld:

    def test_system_prompt_does_not_reach_the_stream(self):
        writer, drain = _writer(trace_content_permitted=False)
        writer.write_trace(SYSTEM_PROMPT_TRACE)
        writer.end()
        body = drain()
        assert 'compressedData' not in body
        assert '"type":"llm-instruction"' not in body.replace(' ', '')

    def test_tool_input_and_output_do_not_reach_the_stream(self):
        writer, drain = _writer(trace_content_permitted=False)
        writer.write_tool_result_trace('get_catalog_rows', None, invocation_input={
            'function': 'get_catalog_rows',
            'parameters': [{'name': 'account', 'value': 'ACCT-TEST-0001'}],
        })
        writer.write_tool_result_trace('get_catalog_rows', 'sku,price\nA-1,9.99')
        writer.end()
        body = drain()
        for leaked in ('get_catalog_rows', 'ACCT-TEST-0001', 'sku,price', '9.99'):
            assert leaked not in body

    def test_withheld_turn_still_emits_one_frame_per_trace(self):
        """Frame cadence is the liveness signal, so the count must not change."""
        writer, drain = _writer(trace_content_permitted=False)
        for _ in range(5):
            writer.write_trace(SYSTEM_PROMPT_TRACE)
        writer.end()
        assert len(_frames(drain())) == 5

    def test_withheld_frames_are_the_neutral_activity_frame(self):
        writer, drain = _writer(trace_content_permitted=False)
        writer.write_trace(SYSTEM_PROMPT_TRACE)
        writer.end()
        frame = json.loads(_frames(drain())[0])
        assert frame['orchestrationTrace']['rationale']['traceId'] == ACTIVITY_TRACE_ID
        assert frame['orchestrationTrace']['rationale']['text'] == ''

    def test_withheld_tool_call_reaches_the_wire_as_step_frames(self):
        writer, drain = _writer(trace_content_permitted=False)
        writer.write_tool_result_trace('get_item_trace', None, invocation_input={
            'actionGroupName': 'get_item_trace', 'function': 'get_item_trace',
            'parameters': [{'name': 'sku', 'value': 'A-1'}],
            'userLabel': 'Checking how your item was processed',
            'userLabelDone': 'Checked how your item was processed',
        })
        writer.write_tool_result_trace('get_item_trace', 'sku,price\nA-1,9.99')
        writer.end()
        body = drain()
        frames = [json.loads(f) for f in _frames(body)]
        assert frames == [
            {'step': {'event': 'start', 'id': step_handle('get_item_trace'),
                      'label': 'Checking how your item was processed',
                      'labelDone': 'Checked how your item was processed'}},
            {'step': {'event': 'done', 'id': step_handle('get_item_trace')}},
        ]
        for leaked in ('get_item_trace', 'A-1', '9.99', 'parameters', 'actionGroupInvocation'):
            assert leaked not in body

    def test_withheld_frames_remain_parseable(self):
        """The client parses every frame it receives; an unparseable one logs an error."""
        writer, drain = _writer(trace_content_permitted=False)
        writer.write_trace(SYSTEM_PROMPT_TRACE)
        writer.write_tool_result_trace('t', 'out')
        writer.end()
        for frame in _frames(drain()):
            assert isinstance(json.loads(frame), dict)


class TestStorageUnaffected:

    def test_withheld_turn_still_collects_the_full_trace(self):
        writer, _ = _writer(trace_content_permitted=False)
        writer.write_trace(SYSTEM_PROMPT_TRACE)
        assert writer.traces == [SYSTEM_PROMPT_TRACE]

    def test_withheld_turn_collects_the_searchable_marker(self):
        """Search indexing filters on this literal substring in the stored trace text."""
        writer, _ = _writer(trace_content_permitted=False)
        writer.write_trace(SYSTEM_PROMPT_TRACE)
        text = writer.traces[0]['orchestrationTrace']['rationale']['text']
        assert '"type":"llm-instruction"' in text.replace(' ', '')
        assert 'compressedData' in text

    def test_withheld_turn_collects_tool_traces(self):
        writer, _ = _writer(trace_content_permitted=False)
        writer.write_tool_result_trace('my_tool', '{"result": "data"}')
        assert len(writer.traces) == 1
        observation = writer.traces[0]['orchestrationTrace']['observation']
        assert observation['actionGroupInvocationOutput']['text'] == '{"result": "data"}'

    def test_deduped_persist_payload_survives_withholding(self):
        """The space-saving stored form is chosen independently of the stream."""
        persist = {'orchestrationTrace': {'rationale': {'traceId': 'llm-instruction',
                                                        'text': '{"systemPromptRef":"abc"}'}}}
        writer, drain = _writer(trace_content_permitted=False)
        writer.write_trace(SYSTEM_PROMPT_TRACE, persist_payload=persist)
        writer.end()
        assert writer.traces == [persist]
        assert 'systemPromptRef' not in drain()

    def test_collected_traces_are_identical_either_way(self):
        withheld, _ = _writer(trace_content_permitted=False)
        permitted, _ = _writer(trace_content_permitted=True)
        for writer in (withheld, permitted):
            writer.write_trace(SYSTEM_PROMPT_TRACE)
            writer.write_tool_result_trace('my_tool', 'out')
        assert withheld.traces == permitted.traces


class TestContentPermitted:

    def test_permitted_turn_streams_the_full_payload(self):
        writer, drain = _writer(trace_content_permitted=True)
        writer.write_trace(SYSTEM_PROMPT_TRACE)
        writer.end()
        assert json.loads(_frames(drain())[0]) == SYSTEM_PROMPT_TRACE

    def test_permitted_turn_streams_tool_content(self):
        writer, drain = _writer(trace_content_permitted=True)
        writer.write_tool_result_trace('my_tool', '{"result": "data"}')
        writer.end()
        frame = json.loads(_frames(drain())[0])
        output = frame['orchestrationTrace']['observation']['actionGroupInvocationOutput']
        assert output['text'] == '{"result": "data"}'

    def test_permitted_wire_format_is_unchanged(self):
        """Byte-for-byte identical to the format before gating existed."""
        writer, drain = _writer(trace_content_permitted=True)
        writer.write_trace(SYSTEM_PROMPT_TRACE)
        writer.end()
        assert drain() == f'<trace>{json.dumps(SYSTEM_PROMPT_TRACE)}</trace>'


class TestDefaultAndToggle:

    def test_default_withholds(self):
        """A writer built without stating its intent must not leak."""
        writer, drain = _writer()
        writer.write_trace(SYSTEM_PROMPT_TRACE)
        writer.end()
        assert 'compressedData' not in drain()

    def test_permission_must_be_passed_by_keyword(self):
        """Positional passing would silently bind to a future parameter."""
        from handler import _StreamWriter
        with pytest.raises(TypeError):
            _StreamWriter(queue.Queue(), True)

    def test_setter_grants_content(self):
        writer, drain = _writer()
        writer.set_trace_content_permitted(True)
        writer.write_trace(SYSTEM_PROMPT_TRACE)
        writer.end()
        assert 'compressedData' in drain()

    def test_setter_revokes_content(self):
        writer, drain = _writer(trace_content_permitted=True)
        writer.set_trace_content_permitted(False)
        writer.write_trace(SYSTEM_PROMPT_TRACE)
        writer.end()
        assert 'compressedData' not in drain()

    def test_frames_before_the_decision_are_withheld(self):
        """An early error path emits before the request is understood."""
        writer, drain = _writer()
        writer.write_trace(SYSTEM_PROMPT_TRACE)
        writer.set_trace_content_permitted(True)
        writer.write_trace(SYSTEM_PROMPT_TRACE)
        writer.end()
        frames = _frames(drain())
        assert 'compressedData' not in frames[0]
        assert 'compressedData' in frames[1]


class TestOtherFramesUntouched:

    def test_plain_text_is_never_withheld(self):
        writer, drain = _writer(trace_content_permitted=False)
        writer.write('Here is the answer.')
        writer.end()
        assert drain() == 'Here is the answer.'

    def test_session_metadata_is_never_withheld(self):
        """It carries message ids and the chat title, which the client requires."""
        writer, drain = _writer(trace_content_permitted=False)
        metadata = {'userMessageId': 'u1', 'assistantMessageId': 'a1'}
        writer.write(f'<pika-metadata>{json.dumps(metadata)}</pika-metadata>')
        writer.end()
        body = drain()
        assert 'userMessageId' in body
        assert 'a1' in body

    def test_session_id_header_is_unaffected(self):
        from handler import _StreamWriter, _STREAM_HEADERS
        q = queue.Queue()
        writer = _StreamWriter(q, trace_content_permitted=False)
        writer.set_headers('session-001')
        sentinel, headers = q.get_nowait()
        assert sentinel is _STREAM_HEADERS
        assert headers == {'x-chatbot-session-id': 'session-001'}
        assert writer.session_id == 'session-001'
