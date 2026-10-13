"""S3 offload for assistant-message traces and the per-session system prompt.

Keys are traces/{user_id}/{session_id}/{message_id}.json.gz and
traces/{user_id}/{session_id}/system-prompt-{hash}.txt.gz. Readers resolve the bucket
from PIKA_S3_BUCKET and reconstitute the full form (services/pika/src/lib/trace-store.ts).
"""
from __future__ import annotations

import gzip
import hashlib
import json
import logging

logger = logging.getLogger(__name__)

# Inline-fallback budget for the traces attribute when S3 offload fails.
# Leaves ample headroom under DynamoDB's 400 KB item cap for the message
# text and metadata attributes. Used as the default ceiling; callers that
# know the rest-of-item size should pass a budget from inline_trace_budget().
INLINE_TRACES_BUDGET_BYTES = 300_000

# DynamoDB hard-caps items at 400 KB (409,600 bytes). Stay well under it to
# absorb per-attribute name overhead and the JSON-vs-DDB sizing difference, so
# the inline-fallback item still fits once message text and metadata are added.
DDB_ITEM_SAFE_BYTES = 380_000

# Per-string floor the capper truncates down to before giving up. Keeps at
# least a useful prefix of every trace visible in the fallback.
_TRUNCATION_FLOOR_CHARS = 1_000

_TRUNCATION_MARKER = '…[truncated: exceeded inline trace budget; see CloudWatch logs]'


def traces_s3_key(user_id: str, session_id: str, message_id: str) -> str:
    return f'traces/{user_id}/{session_id}/{message_id}.json.gz'


def system_prompt_s3_key(user_id: str, session_id: str, prompt_hash: str) -> str:
    return f'traces/{user_id}/{session_id}/system-prompt-{prompt_hash}.txt.gz'


def system_prompt_hash(system_prompt: str) -> str:
    return hashlib.sha256((system_prompt or '').encode('utf-8')).hexdigest()[:16]


def offload_traces(s3_client, bucket: str, user_id: str, session_id: str,
                   message_id: str, traces: list[dict]) -> dict:
    """Upload the traces array to S3 and return the pointer dict.

    Raises on any failure — the caller decides the fallback (inline capped).
    """
    if not bucket:
        raise ValueError('PIKA_S3_BUCKET is unset; cannot offload traces')
    key = traces_s3_key(user_id, session_id, message_id)
    body = gzip.compress(json.dumps(traces).encode('utf-8'))
    s3_client.put_object(Bucket=bucket, Key=key, Body=body,
                         ContentType='application/json', ContentEncoding='gzip')
    return {
        's3_key': key,
        'trace_count': len(traces),
        'compressed_size': len(body),
    }


def ensure_system_prompt_object(s3_client, bucket: str, user_id: str, session_id: str,
                                system_prompt: str, known_hash: str | None) -> str:
    """Upload the system prompt object iff its hash isn't the session's known one."""
    prompt_hash = system_prompt_hash(system_prompt)
    if prompt_hash == known_hash:
        return prompt_hash
    if not bucket:
        raise ValueError('PIKA_S3_BUCKET is unset; cannot upload system prompt object')
    key = system_prompt_s3_key(user_id, session_id, prompt_hash)
    body = gzip.compress((system_prompt or '').encode('utf-8'))
    s3_client.put_object(Bucket=bucket, Key=key, Body=body,
                         ContentType='text/plain', ContentEncoding='gzip')
    return prompt_hash


def _truncate_trace_strings(trace: dict, max_chars: int) -> tuple[dict, bool]:
    """Return a copy of *trace* with every long string truncated to max_chars."""
    truncated = False

    def walk(node):
        nonlocal truncated
        if isinstance(node, dict):
            return {k: walk(v) for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v) for v in node]
        if isinstance(node, str) and len(node) > max_chars:
            truncated = True
            return node[:max_chars] + _TRUNCATION_MARKER
        return node

    return walk(trace), truncated


def inline_trace_budget(item_without_traces: dict) -> int:
    """Bytes available for an inline traces array on *item_without_traces*."""
    rest_bytes = len(json.dumps(item_without_traces, default=str).encode('utf-8'))
    return max(0, min(INLINE_TRACES_BUDGET_BYTES, DDB_ITEM_SAFE_BYTES - rest_bytes))


def cap_traces_inline(traces: list[dict], budget_bytes: int = INLINE_TRACES_BUDGET_BYTES) -> list[dict]:
    """Shrink traces to fit *budget_bytes* of serialized JSON for inline fallback."""
    def size_of(t: list[dict]) -> int:
        return len(json.dumps(t).encode('utf-8'))

    if size_of(traces) <= budget_bytes:
        return traces

    max_chars = 64_000
    capped = traces
    while max_chars >= _TRUNCATION_FLOOR_CHARS:
        capped = []
        for trace in traces:
            shrunk, was_truncated = _truncate_trace_strings(trace, max_chars)
            if was_truncated:
                shrunk['truncated'] = True
            capped.append(shrunk)
        if size_of(capped) <= budget_bytes:
            return capped
        max_chars //= 2

    # Still over budget at the floor: drop largest traces, keep stubs.
    sized = sorted(range(len(capped)), key=lambda i: len(json.dumps(capped[i])), reverse=True)
    for idx in sized:
        capped[idx] = {'truncated': True, 'dropped': True}
        if size_of(capped) <= budget_bytes:
            break
    return capped
