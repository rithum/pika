"""Contract tests: trace offload to S3 (assistant-message persistence)."""
import gzip
import json

import boto3
from unittest.mock import MagicMock, patch

MOCK_AGENT_DEF = {
    'agent_id': 'test-agent-001',
    'base_prompt': 'You are a helpful assistant for order management.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': [],
}


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _run_handler(valid_event, offload_raises=None, prompt_upload_raises=False):
    """Drive the full handler with mocked I/O; return (put_items, s3_mock, ddb_table)."""
    mock_ddb = MagicMock()
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    mock_table.get_item.return_value = {
        'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
    }

    s3 = boto3.client('s3')  # conftest patches this to the shared MagicMock
    s3.put_object.reset_mock()
    s3.objects = {}

    def record_put(Bucket, Key, Body, **kwargs):
        if prompt_upload_raises and 'system-prompt-' in Key:
            raise RuntimeError('prompt upload failed')
        s3.objects[Key] = Body
        return {}

    s3.put_object.side_effect = record_put

    mock_agent_instance = MagicMock()
    mock_agent_instance.return_value = 'Bot response'

    patches = [
        patch('handler.dynamodb', mock_ddb),
        patch('handler.Agent', MagicMock(return_value=mock_agent_instance)),
        patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
        patch('handler.get_user', return_value={'user_id': 'test-user-001', 'custom_data': {}}),
    ]
    if offload_raises is not None:
        patches.append(patch('handler.offload_traces', side_effect=offload_raises))

    from contextlib import ExitStack
    with ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        from handler import handler
        handler(valid_event, _make_ctx())

    put_items = [c.kwargs.get('Item', {}) for c in mock_table.put_item.call_args_list]
    return put_items, s3, mock_table


def _assistant_item(put_items):
    items = [i for i in put_items if i.get('source') == 'assistant']
    assert len(items) == 1
    return items[0]


class TestTracesOffloadedToS3:
    def test_assistant_item_has_pointer_not_traces(self, valid_event):
        put_items, s3, _ = _run_handler(valid_event)
        assistant = _assistant_item(put_items)

        assert 'traces' not in assistant
        pointer = assistant['traces_s3']
        assert pointer['s3_key'].startswith('traces/test-user-001/test-session-001/')
        assert pointer['s3_key'].endswith('.json.gz')
        assert pointer['trace_count'] >= 1

    def test_s3_object_contains_full_traces_array(self, valid_event):
        put_items, s3, _ = _run_handler(valid_event)
        assistant = _assistant_item(put_items)

        body = s3.objects[assistant['traces_s3']['s3_key']]
        traces = json.loads(gzip.decompress(body).decode('utf-8'))
        assert isinstance(traces, list)
        assert assistant['traces_s3']['trace_count'] == len(traces)

    def test_persisted_llm_instruction_is_deduped(self, valid_event):
        put_items, s3, mock_table = _run_handler(valid_event)
        assistant = _assistant_item(put_items)

        body = s3.objects[assistant['traces_s3']['s3_key']]
        traces = json.loads(gzip.decompress(body).decode('utf-8'))
        llm_traces = [
            t for t in traces
            if '"type":"llm-instruction"' in (t.get('orchestrationTrace', {})
                                              .get('rationale', {}).get('text') or '')
        ]
        assert len(llm_traces) == 1
        data = json.loads(llm_traces[0]['orchestrationTrace']['rationale']['text'])
        assert data['systemPromptRef'].startswith('system-prompt-')

        # The referenced prompt object was uploaded and holds the system prompt.
        ref = data['systemPromptRef']
        prompt_keys = [k for k in s3.objects if ref in k]
        assert len(prompt_keys) == 1
        prompt = gzip.decompress(s3.objects[prompt_keys[0]]).decode('utf-8')
        assert MOCK_AGENT_DEF['base_prompt'] in prompt

        # Session records the prompt hash for later turns.
        hash_updates = [
            c for c in mock_table.update_item.call_args_list
            if 'llm_instruction_hash' in c.kwargs.get('UpdateExpression', '')
        ]
        assert len(hash_updates) == 1

    def test_prompt_upload_failure_persists_full_llm_instruction(self, valid_event):
        put_items, s3, _ = _run_handler(valid_event, prompt_upload_raises=True)
        assistant = _assistant_item(put_items)

        body = s3.objects[assistant['traces_s3']['s3_key']]
        traces = json.loads(gzip.decompress(body).decode('utf-8'))
        llm_traces = [
            t for t in traces
            if '"type":"llm-instruction"' in (t.get('orchestrationTrace', {})
                                              .get('rationale', {}).get('text') or '')
        ]
        assert len(llm_traces) == 1
        data = json.loads(llm_traces[0]['orchestrationTrace']['rationale']['text'])
        # Full form: compressedData present, no ref.
        assert 'systemPromptRef' not in data
        assert data['compressedData']


class TestS3FailureFallback:
    def test_message_persists_with_capped_inline_traces(self, valid_event):
        put_items, _, _ = _run_handler(valid_event, offload_raises=RuntimeError('s3 down'))
        assistant = _assistant_item(put_items)

        assert 'traces_s3' not in assistant
        assert isinstance(assistant['traces'], list)
        from trace_store import INLINE_TRACES_BUDGET_BYTES
        assert len(json.dumps(assistant['traces']).encode('utf-8')) <= INLINE_TRACES_BUDGET_BYTES

    def test_message_text_survives_offload_failure(self, valid_event):
        put_items, _, _ = _run_handler(valid_event, offload_raises=RuntimeError('s3 down'))
        assistant = _assistant_item(put_items)
        assert assistant['message'] == 'Bot response'
