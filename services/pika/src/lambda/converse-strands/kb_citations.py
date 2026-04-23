"""Knowledge-base citation rendering.

Contract: tests/test_contract_kb_citations.py

Pure data transformation — takes a list of content blocks (as produced by
Strands' streaming event loop at strands/event_loop/streaming.py:300) and
returns a single rendered string where each citation becomes an inline
markdown link: ``[Citation N](uri)``.

Numbering rules:
  - 1-indexed, assigned in order each URI first appears.
  - Duplicates (same URI) reuse the earliest-assigned number.
  - Citations with no recognizable URI are skipped silently.

The renderer is intentionally agnostic about WHERE the blocks come from —
Bedrock Converse citation deltas, a mocked test payload, or a tool-result
synthesis. It only reads the block shape Bedrock/Strands emit.
"""
import logging
import re

logger = logging.getLogger(__name__)
from typing import Any, Dict, Iterable, List, Optional

# Matches [[kbref:<int>]] exactly. Capture group 1 is the integer string.
# Requirements: double brackets, lowercase 'kbref', colon, one or more digits.
MARKER_RE: re.Pattern = re.compile(r'\[\[kbref:(\d+)\]\]')


def _citation_uri(citation: Dict[str, Any]) -> Optional[str]:
    """Extract the best URI for a single citation object. None means skip."""
    location = citation.get('location') or {}

    # documentChunk.uri — the shape Bedrock Converse emits for KB chunks.
    doc_chunk = location.get('documentChunk') or {}
    uri = doc_chunk.get('uri')
    if uri:
        return uri

    # webLocation.url — web search citations.
    web = location.get('webLocation') or {}
    url = web.get('url')
    if url:
        return url

    # s3Location.uri — direct S3-backed documents.
    s3 = location.get('s3Location') or {}
    s3_uri = s3.get('uri')
    if s3_uri:
        return s3_uri

    return None


def render_with_citations(blocks: Iterable[Dict[str, Any]]) -> str:
    """Render content blocks to a string with citations as inline markdown links."""
    parts: List[str] = []
    uri_to_number: Dict[str, int] = {}
    next_number = 1

    for block in blocks or []:
        text = block.get('text')
        if text:
            parts.append(text)

        citations_block = block.get('citationsContent')
        if not citations_block:
            continue
        for citation in citations_block.get('citations') or []:
            uri = _citation_uri(citation)
            if not uri:
                continue
            number = uri_to_number.get(uri)
            if number is None:
                number = next_number
                uri_to_number[uri] = number
                next_number += 1
            parts.append(f'[Citation {number}]({uri})')

    return ''.join(parts)


def blocks_from_marked_text(text: str, uri_map: dict) -> List[Dict[str, Any]]:
    """Split *text* on ``[[kbref:N]]`` markers into a content-block list.

    Each marker whose integer id exists in *uri_map* is replaced by a
    ``citationsContent`` block. Unknown ids and non-integer ids are left
    verbatim in the surrounding text segment.  Zero-length text segments
    are never emitted.
    """
    if not text:
        return []

    blocks: List[Dict[str, Any]] = []
    pending_text_parts: List[str] = []

    def flush_text() -> None:
        combined = ''.join(pending_text_parts)
        if combined:
            blocks.append({'text': combined})
        pending_text_parts.clear()

    pos = 0
    for match in MARKER_RE.finditer(text):
        start, end = match.start(), match.end()
        raw_id = match.group(1)  # always digits thanks to \d+

        marker_id = int(raw_id)
        if marker_id not in uri_map:
            # Unknown id — per contract, preserve verbatim so hallucinated
            # markers from the model don't silently vanish (debuggability
            # signal). Log a warning so the hallucination is still observable.
            logger.warning(
                f"KB citation marker [[kbref:{marker_id}]] has no entry in "
                f"uri_map (size={len(uri_map)}); preserving verbatim per contract"
            )
            pending_text_parts.append(text[pos:end])
            pos = end
            continue

        # Valid marker: flush any accumulated text, then emit citation block.
        if start > pos:
            pending_text_parts.append(text[pos:start])
        flush_text()

        uri = uri_map[marker_id]
        blocks.append({
            'citationsContent': {
                'citations': [
                    {'location': {'documentChunk': {'uri': uri}}}
                ]
            }
        })
        pos = end

    # Remaining text after the last match.
    if pos < len(text):
        pending_text_parts.append(text[pos:])
    flush_text()

    return blocks


def inject_citations(text: str, uri_map: dict) -> str:
    """One-shot convenience: parse markers then render to markdown citation links."""
    return render_with_citations(blocks_from_marked_text(text, uri_map))
