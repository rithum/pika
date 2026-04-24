"""
CONTRACT TESTS: Post-hoc citation injection for KB-backed responses.

Context: Bedrock Converse does not emit citation deltas for document blocks
passed via toolResult.content (empirically verified during the ES-2996
spike — Bedrock returns a ValidationException). The TS converse Lambda
gets citations for free from Bedrock Agents (InvokeAgent.attribution);
Strands' Converse-based path must reconstruct that UX in our own code.

Design: the KB tool wrapper returns plain text that embeds inline markers
of the form ``[[kbref:N]]`` — one per retrieved chunk, where N is the
chunk's position in a handler-owned uri_map. After the agent turn
finishes, the handler passes the response text + uri_map through
``blocks_from_marked_text`` to produce a content-block list, then feeds
that list to the already-locked ``render_with_citations`` from
test_contract_kb_citations.py.

That split means:
  - kb_citations.render_with_citations (Part A): unchanged, already locked.
  - kb_citations.blocks_from_marked_text (this contract): the parser.
  - kb_citations.inject_citations (convenience): equivalent to passing
    blocks_from_marked_text(...) through render_with_citations(...).

Marker format: ``[[kbref:<int>]]``. The integer indexes into uri_map. Any
non-integer id or an id missing from uri_map is treated as stray model
output and left in the text verbatim (no crash, no block).
"""
import pytest


# ---------------------------------------------------------------------------
# Parser — blocks_from_marked_text
# ---------------------------------------------------------------------------

class TestBlocksFromMarkedText:

    def test_plain_text_no_markers_returns_single_text_block(self):
        from kb_citations import blocks_from_marked_text  # noqa: PLC0415

        blocks = blocks_from_marked_text('Hello world.', uri_map={})
        assert blocks == [{'text': 'Hello world.'}]

    def test_single_marker_splits_into_text_citation_text(self):
        from kb_citations import blocks_from_marked_text  # noqa: PLC0415

        blocks = blocks_from_marked_text(
            'Policy requires[[kbref:0]] two approvers.',
            uri_map={0: 'https://docs.example.com/p#1'},
        )
        assert blocks == [
            {'text': 'Policy requires'},
            {'citationsContent': {'citations': [
                {'location': {'documentChunk': {'uri': 'https://docs.example.com/p#1'}}}
            ]}},
            {'text': ' two approvers.'},
        ]

    def test_multiple_markers_preserve_order(self):
        from kb_citations import blocks_from_marked_text  # noqa: PLC0415

        blocks = blocks_from_marked_text(
            'A[[kbref:0]]B[[kbref:1]]C',
            uri_map={0: 'u0', 1: 'u1'},
        )
        assert blocks == [
            {'text': 'A'},
            {'citationsContent': {'citations': [{'location': {'documentChunk': {'uri': 'u0'}}}]}},
            {'text': 'B'},
            {'citationsContent': {'citations': [{'location': {'documentChunk': {'uri': 'u1'}}}]}},
            {'text': 'C'},
        ]

    def test_marker_at_start_of_text(self):
        from kb_citations import blocks_from_marked_text  # noqa: PLC0415

        blocks = blocks_from_marked_text('[[kbref:0]]Hello', uri_map={0: 'u'})
        # No empty text block before the citation — skip zero-length splits.
        assert blocks == [
            {'citationsContent': {'citations': [{'location': {'documentChunk': {'uri': 'u'}}}]}},
            {'text': 'Hello'},
        ]

    def test_marker_at_end_of_text(self):
        from kb_citations import blocks_from_marked_text  # noqa: PLC0415

        blocks = blocks_from_marked_text('Hello[[kbref:0]]', uri_map={0: 'u'})
        # No trailing empty text block.
        assert blocks == [
            {'text': 'Hello'},
            {'citationsContent': {'citations': [{'location': {'documentChunk': {'uri': 'u'}}}]}},
        ]

    def test_unknown_marker_id_is_left_as_text(self):
        """An id not in uri_map must be preserved verbatim — hallucinated
        markers from the model must never crash or silently vanish."""
        from kb_citations import blocks_from_marked_text  # noqa: PLC0415

        blocks = blocks_from_marked_text('A[[kbref:99]]B', uri_map={0: 'u0'})
        assert blocks == [{'text': 'A[[kbref:99]]B'}]

    def test_non_integer_marker_is_left_as_text(self):
        from kb_citations import blocks_from_marked_text  # noqa: PLC0415

        blocks = blocks_from_marked_text('A[[kbref:abc]]B', uri_map={0: 'u0'})
        assert blocks == [{'text': 'A[[kbref:abc]]B'}]

    def test_empty_text_returns_empty_list(self):
        from kb_citations import blocks_from_marked_text  # noqa: PLC0415

        assert blocks_from_marked_text('', uri_map={}) == []

    def test_duplicate_marker_ids_produce_separate_citation_blocks(self):
        """When the same id appears twice, each appearance produces its own
        citationsContent block. Deduplication to a shared [Citation N] is
        the renderer's job (render_with_citations), not the parser's."""
        from kb_citations import blocks_from_marked_text  # noqa: PLC0415

        blocks = blocks_from_marked_text(
            'X[[kbref:0]]Y[[kbref:0]]',
            uri_map={0: 'same-uri'},
        )
        assert blocks == [
            {'text': 'X'},
            {'citationsContent': {'citations': [{'location': {'documentChunk': {'uri': 'same-uri'}}}]}},
            {'text': 'Y'},
            {'citationsContent': {'citations': [{'location': {'documentChunk': {'uri': 'same-uri'}}}]}},
        ]


# ---------------------------------------------------------------------------
# Convenience one-shot — inject_citations
# ---------------------------------------------------------------------------

class TestInjectCitationsConvenience:

    def test_inject_citations_produces_markdown_links(self):
        from kb_citations import inject_citations  # noqa: PLC0415

        out = inject_citations(
            'Policy requires[[kbref:0]] two approvers.',
            uri_map={0: 'https://docs.example.com/p#1'},
        )
        assert out == 'Policy requires[Citation 1](https://docs.example.com/p#1) two approvers.'

    def test_inject_citations_dedupes_same_uri_to_same_number(self):
        """End-to-end sanity: when the same id appears twice with the same
        URI, the final rendered text uses [Citation 1] both times."""
        from kb_citations import inject_citations  # noqa: PLC0415

        out = inject_citations(
            'X[[kbref:0]]Y[[kbref:0]]',
            uri_map={0: 'same-uri'},
        )
        assert out == 'X[Citation 1](same-uri)Y[Citation 1](same-uri)'
        assert '[Citation 2]' not in out

    def test_inject_citations_distinct_uris_get_distinct_numbers(self):
        from kb_citations import inject_citations  # noqa: PLC0415

        out = inject_citations(
            'A[[kbref:0]]B[[kbref:1]]',
            uri_map={0: 'u0', 1: 'u1'},
        )
        assert '[Citation 1](u0)' in out
        assert '[Citation 2](u1)' in out
        assert out.index('[Citation 1](u0)') < out.index('[Citation 2](u1)')

    def test_inject_citations_no_markers_passes_through(self):
        from kb_citations import inject_citations  # noqa: PLC0415

        assert inject_citations('Just some text.', uri_map={}) == 'Just some text.'


# ---------------------------------------------------------------------------
# Marker regex — exported for the KB tool wrapper
# ---------------------------------------------------------------------------

class TestMarkerRegex:

    def test_marker_regex_matches_canonical_form(self):
        """Exported so the KB tool wrapper and the parser agree on the
        marker shape. Must match ``[[kbref:<int>]]``."""
        from kb_citations import MARKER_RE  # noqa: PLC0415

        m = MARKER_RE.search('foo [[kbref:42]] bar')
        assert m is not None
        assert m.group(1) == '42'

    def test_marker_regex_does_not_match_malformed(self):
        from kb_citations import MARKER_RE  # noqa: PLC0415

        for bad in ['[kbref:0]', '[[kbref:]]', '[[kbref 0]]', '[[KBREF:0]]']:
            assert MARKER_RE.search(bad) is None, f'should not match {bad!r}'
