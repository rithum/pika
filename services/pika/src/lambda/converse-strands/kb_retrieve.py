"""KB retrieve wrapper with [[kbref:N]] citation markers.

Exposes build_retrieve_kb_tools() which returns PythonAgentTool instances that:
- Call bedrock-agent-runtime.retrieve directly via boto3
- Populate a handler-owned uri_map dict with {int_id: uri} entries
- Return a single text block per call with [[kbref:N]] markers so the model
  can cite sources; kb_citations.py then resolves markers to inline links.
"""
import json
import logging
import re
from typing import Any, Dict, List, Optional

import boto3
from strands.tools.tools import PythonAgentTool

logger = logging.getLogger(__name__)

# Matches only `{identifier}` placeholder shapes — NOT JSON structural braces
# (`{"key":…}` or `{}`). Dict-valued filter templates contain literal { and }
# from JSON encoding; the naive `'{' in filter_str` check falsely treats
# those as unresolved placeholders and drops the KB tool.
_UNRESOLVED_PLACEHOLDER = re.compile(r'\{[A-Za-z_][A-Za-z0-9_.]*\}')

_bedrock_agent_runtime = None


def _get_client():
    global _bedrock_agent_runtime
    if _bedrock_agent_runtime is None:
        _bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')
    return _bedrock_agent_runtime


def _retrieve_chunks(kb_id: str, query: str, retrieve_filter: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    kwargs: Dict[str, Any] = {
        'knowledgeBaseId': kb_id,
        'retrievalQuery': {'text': query},
    }
    config: Dict[str, Any] = {'vectorSearchConfiguration': {'numberOfResults': 5}}
    if retrieve_filter:
        config['vectorSearchConfiguration']['filter'] = retrieve_filter
    kwargs['retrievalConfiguration'] = config

    resp = _get_client().retrieve(**kwargs)
    return resp.get('retrievalResults') or []


def _extract_chunk_uri(chunk: Dict[str, Any]) -> str:
    loc = chunk.get('location') or {}
    return (
        (loc.get('s3Location') or {}).get('uri')
        or (loc.get('webLocation') or {}).get('url')
        or (loc.get('confluenceLocation') or {}).get('url')
        or (loc.get('salesforceLocation') or {}).get('url')
        or (loc.get('sharePointLocation') or {}).get('url')
        or (loc.get('customDocumentLocation') or {}).get('id')
        or ''
    )


def build_retrieve_kb_tools(
    knowledge_bases: List[Dict[str, Any]],
    custom_data: Dict[str, Any],
    uri_map: Dict[int, str],
) -> List[PythonAgentTool]:
    """Build KB retrieve tools that emit [[kbref:N]]-marked text blocks.

    uri_map is a handler-owned dict mutated by each tool invocation:
    uri_map[N] = uri for each chunk returned, where N is a global counter
    across all KB tool calls in the turn.
    """
    tools: List[PythonAgentTool] = []

    for kb in knowledge_bases:
        kb_id = kb.get('id', '')
        if not kb_id:
            continue

        description = kb.get('description', f'Search knowledge base {kb_id}')

        resolved_filter = None
        raw_filter = kb.get('filter')
        if raw_filter:
            filter_str = json.dumps(raw_filter)
            for key, value in (custom_data or {}).items():
                filter_str = filter_str.replace(f'{{{key}}}', str(value))
            unresolved = _UNRESOLVED_PLACEHOLDER.findall(filter_str)
            if unresolved:
                logger.warning(
                    f"KB {kb_id}: filter has unresolved templates {unresolved!r}, "
                    f"skipping KB tool to prevent data leakage"
                )
                continue
            resolved_filter = json.loads(filter_str)

        tool_name = f'retrieve_{kb_id}'.replace('-', '_')
        tool_spec = {
            'name': tool_name,
            'description': f'Search the "{description}" knowledge base for relevant information.',
            'inputSchema': {
                'json': {
                    'type': 'object',
                    'properties': {
                        'text': {'type': 'string', 'description': 'The search query text'},
                    },
                    'required': ['text'],
                }
            },
        }

        def make_kb_tool_func(kb_id_inner, filter_inner):
            def kb_tool_func(tool_use, **invocation_state):
                tool_input = (tool_use or {}).get('input') or {}
                query = tool_input.get('text', '')
                try:
                    chunks = _retrieve_chunks(kb_id_inner, query, filter_inner)
                except Exception as e:
                    logger.error(f"retrieve failed for KB {kb_id_inner}: {e}", exc_info=True)
                    return {
                        'toolUseId': (tool_use or {}).get('toolUseId'),
                        'status': 'error',
                        'content': [{'text': f'Retrieve error: {e}'}],
                    }

                if not chunks:
                    return {
                        'toolUseId': (tool_use or {}).get('toolUseId'),
                        'status': 'success',
                        'content': [{'text': 'No results.'}],
                    }

                chunk_parts: List[str] = []
                for chunk in chunks:
                    chunk_id = len(uri_map)
                    uri_map[chunk_id] = _extract_chunk_uri(chunk) or f'kb://{kb_id_inner}/chunk-{chunk_id}'
                    text = (chunk.get('content') or {}).get('text', '') or ''
                    chunk_parts.append(f'[[kbref:{chunk_id}]] {text}')

                # Citation instruction: the model must repeat the matching
                # [[kbref:N]] marker inline after each claim it draws from a
                # chunk, otherwise post-processing has nothing to convert to
                # a [Citation N](uri) link. Without this instruction the
                # model treats the markers as formatting noise and drops them.
                instruction = (
                    f"Retrieved {len(chunks)} document chunks. When you use "
                    "information from one of these chunks in your response, "
                    "you MUST cite it by copying the matching [[kbref:N]] "
                    "marker inline immediately after the relevant sentence "
                    "or phrase. Every claim derived from the chunks must "
                    "carry its marker. Do not invent marker ids. Markers "
                    "will be rendered as clickable [Citation N](uri) links "
                    "in the final output."
                )
                result_text = instruction + '\n\n' + '\n\n'.join(chunk_parts)
                logger.info(f"returned {len(chunks)} chunks for KB {kb_id_inner}; uri_map size={len(uri_map)}")
                return {
                    'toolUseId': (tool_use or {}).get('toolUseId'),
                    'status': 'success',
                    'content': [{'text': result_text}],
                }
            return kb_tool_func

        tools.append(PythonAgentTool(tool_name, tool_spec, make_kb_tool_func(kb_id, resolved_filter)))

    return tools
