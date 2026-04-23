"""Unit tests for kb_retrieve.build_retrieve_kb_tools."""
import json
from unittest.mock import MagicMock, patch

import pytest


def _make_chunk(text: str, location: dict) -> dict:
    return {'content': {'text': text}, 'location': location}


def _s3_chunk(text: str, uri: str) -> dict:
    return _make_chunk(text, {'s3Location': {'uri': uri}})


def _web_chunk(text: str, url: str) -> dict:
    return _make_chunk(text, {'webLocation': {'url': url}})


def _confluence_chunk(text: str, url: str) -> dict:
    return _make_chunk(text, {'confluenceLocation': {'url': url}})


def _salesforce_chunk(text: str, url: str) -> dict:
    return _make_chunk(text, {'salesforceLocation': {'url': url}})


def _sharepoint_chunk(text: str, url: str) -> dict:
    return _make_chunk(text, {'sharePointLocation': {'url': url}})


def _custom_chunk(text: str, doc_id: str) -> dict:
    return _make_chunk(text, {'customDocumentLocation': {'id': doc_id}})


def _call_tool(tool, query: str = 'test query') -> dict:
    tool_use = {'toolUseId': 'tu-1', 'input': {'text': query}}
    return tool._tool_func(tool_use)


class TestMarkerEmission:
    """[[kbref:N]] markers appear for each chunk in the returned text block."""

    def test_markers_present_in_output(self):
        import kb_retrieve

        uri_map = {}
        chunks = [_s3_chunk('alpha content', 's3://bucket/a'), _s3_chunk('beta content', 's3://bucket/b')]

        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.return_value = {'retrievalResults': chunks}
            tools = kb_retrieve.build_retrieve_kb_tools(
                [{'id': 'kb-1', 'description': 'Test KB'}], {}, uri_map
            )
            result = _call_tool(tools[0])

        text = result['content'][0]['text']
        assert '[[kbref:0]]' in text
        assert '[[kbref:1]]' in text

    def test_chunk_text_follows_marker(self):
        import kb_retrieve

        uri_map = {}
        chunks = [_s3_chunk('hello world', 's3://b/x')]

        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.return_value = {'retrievalResults': chunks}
            tools = kb_retrieve.build_retrieve_kb_tools([{'id': 'kb-1'}], {}, uri_map)
            result = _call_tool(tools[0])

        text = result['content'][0]['text']
        assert '[[kbref:0]] hello world' in text

    def test_header_shows_chunk_count(self):
        import kb_retrieve

        uri_map = {}
        chunks = [_s3_chunk('c1', 's3://b/1'), _s3_chunk('c2', 's3://b/2')]

        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.return_value = {'retrievalResults': chunks}
            tools = kb_retrieve.build_retrieve_kb_tools([{'id': 'kb-1'}], {}, uri_map)
            result = _call_tool(tools[0])

        text = result['content'][0]['text']
        assert 'Retrieved 2 document chunks' in text
        # Instruction must be present so the model knows what the markers are for.
        assert '[[kbref:N]]' in text

    def test_single_text_block_returned(self):
        import kb_retrieve

        uri_map = {}
        chunks = [_s3_chunk('c1', 's3://b/1'), _s3_chunk('c2', 's3://b/2')]

        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.return_value = {'retrievalResults': chunks}
            tools = kb_retrieve.build_retrieve_kb_tools([{'id': 'kb-1'}], {}, uri_map)
            result = _call_tool(tools[0])

        assert len(result['content']) == 1
        assert 'text' in result['content'][0]


class TestUriMapPopulation:
    """uri_map is mutated with {chunk_id: uri} for each retrieved chunk."""

    def test_uri_map_populated(self):
        import kb_retrieve

        uri_map = {}
        chunks = [_s3_chunk('text', 's3://bucket/doc.txt')]

        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.return_value = {'retrievalResults': chunks}
            tools = kb_retrieve.build_retrieve_kb_tools([{'id': 'kb-1'}], {}, uri_map)
            _call_tool(tools[0])

        assert 0 in uri_map
        assert uri_map[0] == 's3://bucket/doc.txt'

    def test_uri_map_ids_are_global_across_calls(self):
        """IDs continue from where uri_map left off (cross-KB global counter)."""
        import kb_retrieve

        uri_map = {}
        chunks_a = [_s3_chunk('a', 's3://b/a')]
        chunks_b = [_s3_chunk('b', 's3://b/b')]

        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.side_effect = [
                {'retrievalResults': chunks_a},
                {'retrievalResults': chunks_b},
            ]
            tools = kb_retrieve.build_retrieve_kb_tools(
                [{'id': 'kb-1'}, {'id': 'kb-2'}], {}, uri_map
            )
            _call_tool(tools[0])
            _call_tool(tools[1])

        assert uri_map[0] == 's3://b/a'
        assert uri_map[1] == 's3://b/b'

    def test_uri_map_fallback_when_no_uri(self):
        import kb_retrieve

        uri_map = {}
        chunks = [_make_chunk('text', {})]

        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.return_value = {'retrievalResults': chunks}
            tools = kb_retrieve.build_retrieve_kb_tools([{'id': 'kb-99'}], {}, uri_map)
            _call_tool(tools[0])

        assert 0 in uri_map
        assert uri_map[0].startswith('kb://kb-99/')


class TestUriFallbackChain:
    """_extract_chunk_uri returns the correct URI for each location type."""

    def _extract(self, chunk):
        import kb_retrieve
        return kb_retrieve._extract_chunk_uri(chunk)

    def test_s3_uri(self):
        assert self._extract(_s3_chunk('', 's3://bucket/key')) == 's3://bucket/key'

    def test_web_url(self):
        assert self._extract(_web_chunk('', 'https://example.com/page')) == 'https://example.com/page'

    def test_confluence_url(self):
        assert self._extract(_confluence_chunk('', 'https://wiki.example.com/page')) == 'https://wiki.example.com/page'

    def test_salesforce_url(self):
        assert self._extract(_salesforce_chunk('', 'https://sf.example.com/doc')) == 'https://sf.example.com/doc'

    def test_sharepoint_url(self):
        assert self._extract(_sharepoint_chunk('', 'https://sp.example.com/doc')) == 'https://sp.example.com/doc'

    def test_custom_document_id(self):
        assert self._extract(_custom_chunk('', 'custom-doc-id-123')) == 'custom-doc-id-123'

    def test_s3_takes_priority_over_web(self):
        chunk = _make_chunk('', {'s3Location': {'uri': 's3://b/k'}, 'webLocation': {'url': 'https://x.com'}})
        assert self._extract(chunk) == 's3://b/k'

    def test_empty_location_returns_empty_string(self):
        assert self._extract(_make_chunk('', {})) == ''

    def test_none_location_returns_empty_string(self):
        assert self._extract({'content': {'text': 'x'}}) == ''


class TestEmptyResults:
    """When retrieve returns no chunks, return 'No results.' with no markers."""

    def test_no_results_text(self):
        import kb_retrieve

        uri_map = {}
        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.return_value = {'retrievalResults': []}
            tools = kb_retrieve.build_retrieve_kb_tools([{'id': 'kb-1'}], {}, uri_map)
            result = _call_tool(tools[0])

        assert result['content'][0]['text'] == 'No results.'
        assert result['status'] == 'success'

    def test_no_results_does_not_mutate_uri_map(self):
        import kb_retrieve

        uri_map = {}
        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.return_value = {'retrievalResults': []}
            tools = kb_retrieve.build_retrieve_kb_tools([{'id': 'kb-1'}], {}, uri_map)
            _call_tool(tools[0])

        assert len(uri_map) == 0

    def test_none_retrieval_results_treated_as_empty(self):
        import kb_retrieve

        uri_map = {}
        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.return_value = {}
            tools = kb_retrieve.build_retrieve_kb_tools([{'id': 'kb-1'}], {}, uri_map)
            result = _call_tool(tools[0])

        assert result['content'][0]['text'] == 'No results.'


class TestFilterTemplateUnresolvedSkip:
    """KBs with unresolved filter placeholders are skipped to prevent data leakage."""

    def test_unresolved_placeholder_skips_kb(self):
        import kb_retrieve

        uri_map = {}
        kb = {'id': 'kb-secure', 'filter': {'equals': {'key': 'userId', 'value': '{userId}'}}}
        tools = kb_retrieve.build_retrieve_kb_tools([kb], {}, uri_map)
        assert len(tools) == 0

    def test_resolved_string_placeholder_includes_kb(self):
        """A filter whose serialized form contains no { after resolution is included.

        Note: filters with nested dict objects always contain { from JSON braces,
        so this test uses a string-value filter to validate the resolution path.
        """
        import kb_retrieve

        uri_map = {}
        # Simple flat filter whose only { is the placeholder — after resolution no { remains.
        kb = {'id': 'kb-secure', 'filter': '{userId}'}
        chunks = [_s3_chunk('result', 's3://b/doc')]

        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.return_value = {'retrievalResults': chunks}
            tools = kb_retrieve.build_retrieve_kb_tools([kb], {'userId': 'user-42'}, uri_map)

        assert len(tools) == 1

    def test_partially_resolved_filter_skips_kb(self):
        import kb_retrieve

        uri_map = {}
        kb = {
            'id': 'kb-secure',
            'filter': {'and': [
                {'equals': {'key': 'userId', 'value': '{userId}'}},
                {'equals': {'key': 'dept', 'value': '{department}'}},
            ]}
        }
        tools = kb_retrieve.build_retrieve_kb_tools([kb], {'userId': 'user-42'}, uri_map)
        assert len(tools) == 0

    def test_no_filter_includes_kb(self):
        import kb_retrieve

        uri_map = {}
        kb = {'id': 'kb-open'}
        chunks = [_s3_chunk('result', 's3://b/doc')]

        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.return_value = {'retrievalResults': chunks}
            tools = kb_retrieve.build_retrieve_kb_tools([kb], {}, uri_map)

        assert len(tools) == 1

    def test_kb_without_id_skipped(self):
        import kb_retrieve

        uri_map = {}
        tools = kb_retrieve.build_retrieve_kb_tools([{'description': 'no id'}], {}, uri_map)
        assert len(tools) == 0


class TestRetrieveError:
    """Retrieve API errors return an error ToolResult, not an exception."""

    def test_retrieve_error_returns_error_result(self):
        import kb_retrieve

        uri_map = {}
        with patch.object(kb_retrieve, '_get_client') as mock_client:
            mock_client.return_value.retrieve.side_effect = Exception('connection timeout')
            tools = kb_retrieve.build_retrieve_kb_tools([{'id': 'kb-1'}], {}, uri_map)
            result = _call_tool(tools[0])

        assert result['status'] == 'error'
        assert 'connection timeout' in result['content'][0]['text']
