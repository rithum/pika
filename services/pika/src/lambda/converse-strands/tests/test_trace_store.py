"""Unit tests for trace_store.py — S3 trace offload and inline-fallback capping."""
import gzip
import json

import pytest
from unittest.mock import MagicMock

from trace_store import (
    DDB_ITEM_SAFE_BYTES,
    INLINE_TRACES_BUDGET_BYTES,
    cap_traces_inline,
    ensure_system_prompt_object,
    inline_trace_budget,
    offload_traces,
    system_prompt_hash,
    system_prompt_s3_key,
    traces_s3_key,
)


def _make_s3():
    """Fake S3 client that records put_object bodies by key."""
    s3 = MagicMock()
    s3.objects = {}

    def put_object(Bucket, Key, Body, **kwargs):
        s3.objects[(Bucket, Key)] = Body
        return {}

    s3.put_object.side_effect = put_object
    return s3


class TestOffloadTraces:
    def test_roundtrip_returns_identical_traces(self):
        s3 = _make_s3()
        traces = [
            {'orchestrationTrace': {'observation': {'actionGroupInvocationOutput': {'text': 'x' * 50_000}}}},
            {'orchestrationTrace': {'rationale': {'traceId': 'llm-instruction', 'text': 'abc'}}},
        ]
        pointer = offload_traces(s3, 'bucket', 'u1', 's1', 's1:123', traces)

        body = s3.objects[('bucket', pointer['s3_key'])]
        assert json.loads(gzip.decompress(body).decode('utf-8')) == traces

    def test_pointer_shape(self):
        s3 = _make_s3()
        traces = [{'a': 1}, {'b': 2}]
        pointer = offload_traces(s3, 'bucket', 'u1', 's1', 's1:123', traces)

        assert pointer['s3_key'] == 'traces/u1/s1/s1:123.json.gz'
        assert pointer['trace_count'] == 2
        assert pointer['compressed_size'] == len(s3.objects[('bucket', pointer['s3_key'])])
        # Bucket intentionally absent: readers resolve it from their own env.
        assert 's3_bucket' not in pointer

    def test_unset_bucket_raises(self):
        with pytest.raises(ValueError):
            offload_traces(_make_s3(), '', 'u1', 's1', 's1:123', [{'a': 1}])

    def test_s3_error_propagates(self):
        s3 = MagicMock()
        s3.put_object.side_effect = RuntimeError('boom')
        with pytest.raises(RuntimeError):
            offload_traces(s3, 'bucket', 'u1', 's1', 's1:123', [{'a': 1}])


class TestEnsureSystemPromptObject:
    def test_uploads_when_hash_unknown(self):
        s3 = _make_s3()
        prompt = 'You are a helpful agent.' * 100
        h = ensure_system_prompt_object(s3, 'bucket', 'u1', 's1', prompt, None)

        assert h == system_prompt_hash(prompt)
        key = system_prompt_s3_key('u1', 's1', h)
        assert gzip.decompress(s3.objects[('bucket', key)]).decode('utf-8') == prompt

    def test_skips_upload_when_hash_matches(self):
        s3 = _make_s3()
        prompt = 'stable prompt'
        h = ensure_system_prompt_object(s3, 'bucket', 'u1', 's1', prompt,
                                        system_prompt_hash(prompt))
        assert h == system_prompt_hash(prompt)
        s3.put_object.assert_not_called()

    def test_reuploads_when_prompt_changes(self):
        s3 = _make_s3()
        old_hash = system_prompt_hash('old prompt')
        new_hash = ensure_system_prompt_object(s3, 'bucket', 'u1', 's1', 'new prompt', old_hash)
        assert new_hash != old_hash
        s3.put_object.assert_called_once()


class TestCapTracesInline:
    def test_small_traces_pass_through_unmodified(self):
        traces = [{'orchestrationTrace': {'rationale': {'text': 'short'}}}]
        assert cap_traces_inline(traces) is traces

    def test_oversized_traces_fit_budget_and_are_marked(self):
        traces = [
            {'orchestrationTrace': {'observation': {'actionGroupInvocationOutput': {'text': 'x' * 200_000}}}}
            for _ in range(4)
        ]
        capped = cap_traces_inline(traces)

        assert len(json.dumps(capped).encode('utf-8')) <= INLINE_TRACES_BUDGET_BYTES
        assert all(t.get('truncated') for t in capped)
        assert len(capped) == len(traces)

    def test_truncated_text_keeps_prefix_and_marker(self):
        traces = [{'text': 'y' * 200_000} for _ in range(4)]
        capped = cap_traces_inline(traces)
        assert capped[0]['text'].startswith('yyy')
        assert 'truncated' in capped[0]['text'] or capped[0].get('truncated')

    def test_pathological_many_traces_drop_to_stubs(self):
        # Thousands of medium traces: per-string truncation alone can't fit, so
        # the capper must drop whole traces while staying under budget.
        traces = [{'text': 'z' * 2_000, 'i': i} for i in range(2_000)]
        capped = cap_traces_inline(traces)
        assert len(json.dumps(capped).encode('utf-8')) <= INLINE_TRACES_BUDGET_BYTES
        assert any(t.get('dropped') for t in capped)

    def test_originals_never_mutated(self):
        traces = [{'text': 'x' * 200_000}]
        cap_traces_inline(traces)
        assert len(traces[0]['text']) == 200_000
        assert 'truncated' not in traces[0]


class TestInlineTraceBudget:
    def test_small_item_gets_full_ceiling(self):
        item = {'message': 'hi', 'source': 'assistant'}
        assert inline_trace_budget(item) == INLINE_TRACES_BUDGET_BYTES

    def test_large_message_shrinks_budget_below_ceiling(self):
        # A big reply must eat into the trace budget so the combined item stays
        # under the DDB cap — the core fix: budget is not a flat constant.
        item = {'message': 'm' * 200_000, 'source': 'assistant'}
        budget = inline_trace_budget(item)
        assert budget < INLINE_TRACES_BUDGET_BYTES
        assert budget == DDB_ITEM_SAFE_BYTES - len(json.dumps(item).encode('utf-8'))

    def test_oversized_item_clamps_to_zero(self):
        item = {'message': 'm' * (DDB_ITEM_SAFE_BYTES + 10_000)}
        assert inline_trace_budget(item) == 0

    def test_capping_against_derived_budget_keeps_whole_item_under_cap(self):
        # End-to-end: a large message plus oversized traces, capped against the
        # derived budget, yields a full item that fits under the DDB item cap.
        item = {'message': 'm' * 150_000, 'source': 'assistant', 'model': 'x'}
        traces = [{'text': 'x' * 200_000} for _ in range(4)]
        item['traces'] = cap_traces_inline(traces, inline_trace_budget(item))
        assert len(json.dumps(item).encode('utf-8')) <= DDB_ITEM_SAFE_BYTES


class TestDedupedTraceBuilder:
    def test_deduped_trace_format(self):
        from debug_trace import build_llm_instruction_trace_deduped, gunzip_base64_decode

        trace = build_llm_instruction_trace_deduped('user message part', 'abcd1234')
        text = trace['orchestrationTrace']['rationale']['text']
        # Literal substring is load-bearing for message-changed's filter.
        assert '"type":"llm-instruction"' in text

        data = json.loads(text)
        assert data['systemPromptRef'] == 'system-prompt-abcd1234'
        assert gunzip_base64_decode(data['compressedData']) == 'user message part'

    def test_full_and_deduped_share_trace_id(self):
        from debug_trace import build_llm_instruction_trace, build_llm_instruction_trace_deduped

        full = build_llm_instruction_trace('whole instruction')
        deduped = build_llm_instruction_trace_deduped('delta', 'ffff0000')
        assert (full['orchestrationTrace']['rationale']['traceId']
                == deduped['orchestrationTrace']['rationale']['traceId']
                == 'llm-instruction')
