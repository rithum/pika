"""
llm-instruction debug trace.

Emits a trace containing the full instruction string (system prompt + tags +
directives + user instruction + user message) the agent was given on this turn.
The trace is gzip+base64-encoded using the exact encoding TS uses so the existing
downstream consumers keep working:

  1. Admin Answer Reasoning panel (trace.svelte) — decompresses and renders.
  2. OpenSearch message indexing (message-changed/index.ts) — filters by the
     literal substring `"type":"llm-instruction"`, gunzips, indexes as
     llm_instructions field for session-insights full-text search.
  3. Backfill tooling (backfill-messages-to-opensearch).

Wire format MUST match exactly:

  {
    "orchestrationTrace": {
      "rationale": {
        "traceId": "llm-instruction",
        "text": JSON.stringify({
          "type": "llm-instruction",
          "compressedData": "<base64(gzip(instruction))>"
        })
      }
    }
  }
"""
from __future__ import annotations

import base64
import gzip
import json
from typing import Optional


def gzip_base64_encode(s: str) -> str:
    """Encode a string as gzip -> base64, matching TS gzipAndBase64EncodeString().

    TS gzipAndBase64EncodeString() does: gzip -> hex -> decode-hex-back-to-bytes -> base64.
    The intermediate hex round-trip is a no-op; the result is base64(gzip(s)).

    The prior implementation encoded the hex string as ASCII before base64, producing
    base64(ascii(hex(gzip(s)))) which the client's gunzipBase64EncodedString cannot
    decompress — causing the LLM Instruction accordion onclick to throw, so the chevron
    never rotated and the panel never expanded.
    """
    gzipped = gzip.compress(s.encode('utf-8'))
    return base64.b64encode(gzipped).decode('ascii')


def gunzip_base64_decode(encoded: str) -> str:
    """Inverse of gzip_base64_encode(). Matches TS gunzipBase64EncodedString()."""
    gzip_bytes = base64.b64decode(encoded)
    return gzip.decompress(gzip_bytes).decode('utf-8')


def build_full_instruction(system_prompt: str = '', tags_instructions: str = '',
                           directives_instructions: str = '', user_instruction: str = '',
                           user_message: str = '') -> str:
    """Compose the full instruction string captured in the llm-instruction trace.

    Mirrors the order used by the TS path and handler.py's supervisor prompt assembly:
    system_prompt (with tag instructions folded in) → directives → user_instruction → message.
    Each non-empty section is separated by a blank line for readability in the admin view.
    """
    parts = []
    if system_prompt:
        parts.append(system_prompt)
    if tags_instructions:
        parts.append(tags_instructions)
    if directives_instructions:
        parts.append(directives_instructions)
    if user_instruction:
        parts.append(user_instruction)
    if user_message:
        parts.append(user_message)
    return '\n\n'.join(parts)


def build_llm_instruction_trace(instruction: str, trace_id: str = 'llm-instruction') -> dict:
    """Build the orchestrationTrace envelope for the llm-instruction trace.

    trace_id may be customized for collaborator variants
    (e.g. 'llm-instruction-collaborator-{agentId}') so each Swarm node can emit
    its own instruction capture.
    """
    compressed = gzip_base64_encode(instruction or '')
    # Use compact separators (no space after colon) so the serialized text
    # contains the literal substring `"type":"llm-instruction"` — the exact
    # byte sequence the message-changed Lambda's extractor greps for
    # (services/pika/src/lambda/message-changed/index.ts:207).
    return {
        'orchestrationTrace': {
            'rationale': {
                'traceId': trace_id,
                'text': json.dumps(
                    {'type': 'llm-instruction', 'compressedData': compressed},
                    separators=(',', ':'),
                ),
            }
        }
    }
