"""
CONTRACT TESTS: Knowledge Base citation link rendering.

These tests are EXPECTED TO FAIL until KB citation surfacing is implemented.

Contract: when the agent uses a knowledge base and retrieves content, citation
markers in the model output must be rendered as markdown links in the final
response: "[Citation N](uri)".

Source: Bedrock Retrieve returns citation metadata per retrieved chunk.
Strands exposes `strands.types.citations.CitationsContentBlock` in streamed
responses. The renderer must extract citation metadata and emit markdown links
inline in the streamed text.

Citation numbering:
  - 1-indexed, in the order the model cites them
  - Duplicate citations (same URI) re-use the earliest-assigned number
  - Citations that don't appear in the response are not listed at the end

Examples:
  Input content blocks:
    [{"text": "The policy requires"},
     {"citationsContent": { "citations": [{"location": {"documentChunk": {...}},
                                           "sourceContent": [{"text": "...policy..."}] }] }},
     {"text": " two approvers."}]

  Rendered output:
    "The policy requires [Citation 1](https://docs.example.com/policy#chunk-3) two approvers."

Non-KB responses (no citation blocks) must pass through unchanged.
"""
import pytest


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

class TestCitationRendering:

    def test_passes_through_text_without_citations(self):
        """Plain text content blocks must render as-is."""
        from kb_citations import render_with_citations  # noqa: PLC0415

        blocks = [{'text': 'Hello world.'}]
        assert render_with_citations(blocks) == 'Hello world.'

    def test_renders_single_citation_as_markdown_link(self):
        from kb_citations import render_with_citations  # noqa: PLC0415

        blocks = [
            {'text': 'Policy requires'},
            {'citationsContent': {
                'citations': [{
                    'location': {'documentChunk': {'uri': 'https://docs.example.com/p#1'}},
                    'sourceContent': [{'text': 'policy'}],
                }],
            }},
            {'text': ' two approvers.'},
        ]
        out = render_with_citations(blocks)
        assert '[Citation 1](https://docs.example.com/p#1)' in out
        assert 'Policy requires' in out
        assert 'two approvers' in out

    def test_numbers_citations_sequentially_in_order_of_first_appearance(self):
        from kb_citations import render_with_citations  # noqa: PLC0415

        blocks = [
            {'text': 'A'},
            {'citationsContent': {'citations': [{'location': {'documentChunk': {'uri': 'u1'}}}]}},
            {'text': 'B'},
            {'citationsContent': {'citations': [{'location': {'documentChunk': {'uri': 'u2'}}}]}},
        ]
        out = render_with_citations(blocks)
        assert '[Citation 1](u1)' in out
        assert '[Citation 2](u2)' in out
        # u1 must appear BEFORE u2
        assert out.index('[Citation 1](u1)') < out.index('[Citation 2](u2)')

    def test_deduplicates_by_uri(self):
        """The same URI cited twice must reuse the same [Citation N] number."""
        from kb_citations import render_with_citations  # noqa: PLC0415

        blocks = [
            {'text': 'X'},
            {'citationsContent': {'citations': [{'location': {'documentChunk': {'uri': 'same'}}}]}},
            {'text': 'Y'},
            {'citationsContent': {'citations': [{'location': {'documentChunk': {'uri': 'same'}}}]}},
        ]
        out = render_with_citations(blocks)
        # Exactly two occurrences of [Citation 1](same), no [Citation 2]
        assert out.count('[Citation 1](same)') == 2
        assert '[Citation 2]' not in out

    def test_handles_web_and_search_result_locations(self):
        """Non-documentChunk locations (webLocation, s3Location, searchResultLocation)
        must also be rendered with their URI."""
        from kb_citations import render_with_citations  # noqa: PLC0415

        blocks = [
            {'citationsContent': {'citations': [
                {'location': {'webLocation': {'url': 'https://example.com/a'}}},
                {'location': {'s3Location': {'uri': 's3://bucket/key'}}},
            ]}},
        ]
        out = render_with_citations(blocks)
        assert '[Citation 1](https://example.com/a)' in out
        assert '[Citation 2](s3://bucket/key)' in out


# ---------------------------------------------------------------------------
# Empty / degenerate inputs
# ---------------------------------------------------------------------------

class TestCitationEdgeCases:

    def test_empty_citations_block_has_no_output(self):
        """citationsContent with empty citations list must produce no [Citation N]."""
        from kb_citations import render_with_citations  # noqa: PLC0415

        blocks = [{'text': 'A'}, {'citationsContent': {'citations': []}}, {'text': 'B'}]
        out = render_with_citations(blocks)
        assert '[Citation' not in out
        assert 'A' in out and 'B' in out

    def test_citation_missing_uri_is_skipped(self):
        """A citation object without any recognizable URI must be skipped, not crash."""
        from kb_citations import render_with_citations  # noqa: PLC0415

        blocks = [{'citationsContent': {'citations': [{'location': {}}]}}]
        out = render_with_citations(blocks)
        assert '[Citation' not in out
