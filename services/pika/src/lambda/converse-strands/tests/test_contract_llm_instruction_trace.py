"""
CONTRACT TESTS: llm-instruction debug trace.

These tests are EXPECTED TO FAIL until the llm-instruction trace is emitted.

Contract reference:
  TS emission:     services/pika/src/lib/bedrock-agent.ts:258-268
  TS extraction:   services/pika/src/lambda/message-changed/index.ts:203-225
  Frontend render: apps/pika-chat/src/lib/client/features/chat/chat-app-main/trace.svelte:322

The TS Lambda emits a single trace per agent invocation that contains the full
instruction string (system_prompt + tags + directives + user_instruction + user
message) gzip'd and base64-encoded. Downstream consumers:

  1. OpenSearch message indexing (message-changed Lambda) — extracts via regex
     `"type":"llm-instruction"`, gunzips, indexes as llm_instructions field.
     Powers full-text search over historical agent prompts in session-insights.
  2. Admin Answer Reasoning panel — decompresses and renders in the UI when
     detailedTraces is enabled.
  3. OpenSearch backfill tooling — same extraction path.

Wire format MUST match exactly (downstream consumers parse by exact string):
  {
    "orchestrationTrace": {
      "rationale": {
        "traceId": "llm-instruction",
        "text": "{\\"type\\":\\"llm-instruction\\",\\"compressedData\\":\\"<base64>\\"}"
      }
    }
  }

Base64 payload MUST be gzipSync-compatible — a Node Buffer from gzipSync().toString('base64')
and a Python base64.b64encode(gzip.compress(s.encode())) must produce byte-for-byte identical
output on the same input. (Same gzip default compression level, same UTF-8 encoding.)

Ordering: the trace must be emitted BEFORE any agent rationale traces so it appears
at the top of Answer Reasoning. For Swarm, one trace per participating agent.
"""
import base64
import gzip
import json
import pytest


# ---------------------------------------------------------------------------
# Encoding
# ---------------------------------------------------------------------------

class TestLlmInstructionEncoding:

    def test_round_trip_gzip_base64(self):
        """gzip_base64_encode + gunzip_base64_decode must be a lossless round trip."""
        from debug_trace import gzip_base64_encode, gunzip_base64_decode  # noqa: PLC0415

        original = 'You are a helpful agent. ' * 200
        encoded = gzip_base64_encode(original)
        assert isinstance(encoded, str)
        decoded = gunzip_base64_decode(encoded)
        assert decoded == original

    def test_node_gzip_compatibility(self):
        """Payload must gunzip with Python gzip (stdlib) — compatibility with Node gzipSync."""
        from debug_trace import gzip_base64_encode  # noqa: PLC0415

        original = 'test instruction payload'
        encoded = gzip_base64_encode(original)
        raw = base64.b64decode(encoded)
        # If the encoder produced a hex-then-base64 blob (as Node does), base64 decode yields
        # the hex string; we accept either "pure gzip bytes" or "hex-of-gzip-bytes" as long as
        # it round-trips to original.
        try:
            decompressed = gzip.decompress(raw).decode('utf-8')
        except (OSError, UnicodeDecodeError):
            # Try hex path — matches Node's gzipSync(...).toString('hex')-then-base64
            decompressed = gzip.decompress(bytes.fromhex(raw.decode('ascii'))).decode('utf-8')
        assert decompressed == original


# ---------------------------------------------------------------------------
# Wire format
# ---------------------------------------------------------------------------

class TestLlmInstructionWireFormat:

    def test_trace_has_exact_shape(self):
        """Emitted trace dict must have the exact orchestrationTrace.rationale shape."""
        from debug_trace import build_llm_instruction_trace  # noqa: PLC0415

        trace = build_llm_instruction_trace(instruction='hi there', trace_id='llm-instruction')
        assert 'orchestrationTrace' in trace
        rationale = trace['orchestrationTrace'].get('rationale', {})
        assert rationale.get('traceId') == 'llm-instruction'
        parsed = json.loads(rationale['text'])
        assert parsed['type'] == 'llm-instruction'
        assert 'compressedData' in parsed

    def test_trace_text_contains_literal_type_marker(self):
        """The emitted text must contain the literal substring `"type":"llm-instruction"`.

        The downstream OpenSearch extraction in message-changed/index.ts uses this
        substring for fast filtering before JSON.parse.
        """
        from debug_trace import build_llm_instruction_trace  # noqa: PLC0415

        trace = build_llm_instruction_trace(instruction='content', trace_id='llm-instruction')
        raw = trace['orchestrationTrace']['rationale']['text']
        # Allow minor whitespace variance — TS uses JSON.stringify (no whitespace)
        normalized = raw.replace(' ', '')
        assert '"type":"llm-instruction"' in normalized


# ---------------------------------------------------------------------------
# Content
# ---------------------------------------------------------------------------

class TestLlmInstructionContent:

    def test_instruction_includes_system_prompt_and_user_message(self):
        """The compressed payload must include the system prompt AND the agent message."""
        from debug_trace import build_full_instruction  # noqa: PLC0415

        instruction = build_full_instruction(
            system_prompt='SYS',
            tags_instructions='TAGS',
            directives_instructions='DIR',
            user_instruction='USER-INST',
            user_message='HELLO',
        )
        for needle in ('SYS', 'TAGS', 'DIR', 'USER-INST', 'HELLO'):
            assert needle in instruction

    def test_per_collaborator_traces_for_swarm(self):
        """Swarm runs must emit one llm-instruction trace per participating agent
        (supervisor + each collaborator). traceId may be unique per agent.
        """
        from debug_trace import build_llm_instruction_trace  # noqa: PLC0415

        sup = build_llm_instruction_trace(instruction='sup-inst', trace_id='llm-instruction')
        col = build_llm_instruction_trace(instruction='col-inst',
                                          trace_id='llm-instruction-collaborator-foo')
        assert sup['orchestrationTrace']['rationale']['traceId'] == 'llm-instruction'
        assert col['orchestrationTrace']['rationale']['traceId'].startswith('llm-instruction')
