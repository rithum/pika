"""Regression tests for debug_trace gzip+base64 encoding (ES-3069).

The client-side decoder at apps/pika-chat/src/lib/client/util.ts does:

    const binaryString = atob(base64EncodedString);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const decompressed = gunzipSync(bytes);
    return new TextDecoder().decode(decompressed);

It expects the payload to be base64(gzip(s)) — no intermediate hex step. The
contract test in test_contract_llm_instruction_trace.py has a try/except fallback
that masks an incorrect encoding, so these tests assert the JS client decode path
WITHOUT any fallback, which is what actually runs in the browser.

Background: a prior implementation produced base64(ascii(hex(gzip(s)))) by
encoding the hex string of the gzip bytes as ASCII before base64-encoding it.
That payload could be decoded with a hex-aware path but threw inside the JS
client's gunzipSync — the onclick handler aborted before expandedTraces was
updated, so the accordion chevron never rotated.
"""
import base64
import gzip
import json

import pytest

from debug_trace import (
    build_full_instruction,
    build_llm_instruction_trace,
    gunzip_base64_decode,
    gzip_base64_encode,
)


def js_client_decode(b64: str) -> str:
    """Replicate apps/pika-chat/src/lib/client/util.ts gunzipBase64EncodedString.

    NO fallback paths. If the encoder produced base64(hex_as_ascii(gzip)) instead
    of base64(gzip), gzip.decompress raises and the test fails — which is the
    behavior we want, since this is exactly what the browser does.
    """
    raw_bytes = base64.b64decode(b64)
    return gzip.decompress(raw_bytes).decode('utf-8')


# ---------------------------------------------------------------------------
# JS client compatibility — these are the tests that would have caught the bug
# ---------------------------------------------------------------------------

class TestJsClientCompatibility:

    def test_encode_decodes_with_strict_js_client_path(self):
        """Encoded payload must decompress via the exact JS client decode path.

        Before the ES-3069 fix this raised OSError("Not a gzipped file") because
        the encoder emitted hex ASCII characters under the base64 wrapper.
        """
        original = 'You are a helpful assistant. Respond clearly and concisely.'
        encoded = gzip_base64_encode(original)
        assert js_client_decode(encoded) == original

    def test_realistic_instruction_payload(self):
        """Round-trip a payload sized like a real LLM instruction (system prompt + tags + user message)."""
        system_prompt = 'You are an analytics agent. ' * 50
        tags = '<tag>weather</tag>' * 20
        user_msg = 'What is the weather like in Salt Lake City today?'
        instruction = build_full_instruction(
            system_prompt=system_prompt, tags_instructions=tags, user_message=user_msg,
        )
        encoded = gzip_base64_encode(instruction)
        assert js_client_decode(encoded) == instruction

    def test_session_example_payload(self):
        """Sized after a real prod session (ES-3069: session 019dff15-3ce3-7722-9998-a78414259033)."""
        instruction = (
            'session_id=019dff15-3ce3-7722-9998-a78414259033\n'
            'user_id=689b92e158735e71d1419162\n\n'
            + ('System prompt with retailer-specific guidance. ' * 80)
            + '\n\nUser: Show me last week\'s sell-through by SKU.'
        )
        encoded = gzip_base64_encode(instruction)
        assert js_client_decode(encoded) == instruction

    def test_unicode_payload(self):
        """Multi-byte UTF-8 must survive the round trip."""
        original = 'こんにちは — résumé — 日本語テスト — 🚀'
        encoded = gzip_base64_encode(original)
        assert js_client_decode(encoded) == original

    def test_empty_string(self):
        """Empty input is valid (build_llm_instruction_trace passes '' when instruction is None)."""
        encoded = gzip_base64_encode('')
        assert js_client_decode(encoded) == ''

    def test_encoded_is_valid_base64_only(self):
        """The output must be base64 of gzip bytes — not base64 of hex characters.

        Hex-of-gzip would be twice the size and only contain [0-9a-f] when base64-decoded.
        The fix verification: decoded bytes start with the gzip magic number 0x1f 0x8b.
        """
        encoded = gzip_base64_encode('test')
        decoded_bytes = base64.b64decode(encoded)
        assert decoded_bytes[:2] == b'\x1f\x8b', (
            f'expected gzip magic header, got {decoded_bytes[:2]!r}. '
            f'If this is hex ASCII (e.g. b"1f"), the encoder regressed to base64(hex) form.'
        )


# ---------------------------------------------------------------------------
# Round-trip via own decoder
# ---------------------------------------------------------------------------

class TestRoundTrip:

    @pytest.mark.parametrize('payload', [
        'short',
        '',
        'a' * 10000,
        'mixed\nlines\twith\twhitespace',
        json.dumps({'nested': {'data': [1, 2, 3]}}),
    ])
    def test_encode_decode_round_trip(self, payload):
        assert gunzip_base64_decode(gzip_base64_encode(payload)) == payload


# ---------------------------------------------------------------------------
# Trace envelope shape (regression for the wire format)
# ---------------------------------------------------------------------------

class TestTraceEnvelope:

    def test_compressed_data_decodes_via_js_client_path(self):
        """The compressedData field inside the trace must be JS-client decodable."""
        trace = build_llm_instruction_trace('hello world')
        text = trace['orchestrationTrace']['rationale']['text']
        parsed = json.loads(text)
        assert js_client_decode(parsed['compressedData']) == 'hello world'

    def test_collaborator_trace_id_round_trips(self):
        trace = build_llm_instruction_trace(
            'collab instruction', trace_id='llm-instruction-collaborator-foo',
        )
        assert trace['orchestrationTrace']['rationale']['traceId'] == 'llm-instruction-collaborator-foo'
        parsed = json.loads(trace['orchestrationTrace']['rationale']['text'])
        assert js_client_decode(parsed['compressedData']) == 'collab instruction'
