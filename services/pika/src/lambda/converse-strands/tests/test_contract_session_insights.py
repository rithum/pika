"""
CONTRACT TESTS: Session insights DDB fields for OpenSearch indexing.

These tests are EXPECTED TO FAIL until session insights support is implemented.

Session insights contract (mirrors TypeScript bedrock-agent.ts / converse/index.ts):
  - Triggered in the converse Lambda itself (NOT via DDB Streams)
  - When llmContextItems provided in request: filtered via filterLLMContextItems() (cheaper LLM)
  - For each filtered context item, builds SentContextRecord:
      {
        sourceId:    context.id,
        messageIds:  [str],        # message IDs for this turn
        contentHash: context.contentHash,
        lastSentAt:  str,          # ISO-8601 (string, NOT Date object)
        origin:      context.origin,
      }
  - updateSessionSentContexts(userId, sessionId, sentContextsUpdate) → MERGE operation on
    chatSession.sentContexts (Map<string, SentContextRecord>) in DynamoDB

Context injection format appended to user message:
  <additional-context>
  The following additional context may be relevant to answering the user's question:

  <context id="{id}" index="{1-based}">
  <description>{description}</description>
  <data>
  {data or JSON.stringify(data, null, 2)}
  </data>
  </context>
  </additional-context>

DDB Streams on the session table pick up sentContexts updates for downstream OpenSearch indexing.
"""

import json
import re
import pytest
from unittest.mock import MagicMock, patch


MOCK_AGENT_DEF = {
    'agent_id': 'agent-insights',
    'base_prompt': 'Be helpful.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': [],
}


def _make_event(context_items=None, session_id='sess-insights', message='What is the status?'):
    body = {
        'agentId': 'agent-insights',
        'userId': 'user-001',
        'sessionId': session_id,
        'message': message,
    }
    if context_items is not None:
        body['llmContextItems'] = context_items
    return {'body': json.dumps(body)}


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


# ---------------------------------------------------------------------------
# Tests: build_context_xml() — context injection format
# ---------------------------------------------------------------------------

class TestBuildContextXml:
    """Contract for context XML injection format."""

    def test_context_xml_uses_additional_context_wrapper(self):
        """Context XML must be wrapped in <additional-context>...</additional-context>.

        Contract ref: bedrock-agent.ts context injection template
        """
        from context_items import build_context_xml  # noqa: PLC0415

        items = [{'id': 'ctx-001', 'description': 'Order info', 'data': 'Order #123 is pending.'}]
        result = build_context_xml(items)

        assert '<additional-context>' in result
        assert '</additional-context>' in result

    def test_context_item_index_is_one_based(self):
        """Each <context> element must have a 1-based index attribute.

        Contract ref: bedrock-agent.ts context injection — index="{1-based}"
        """
        from context_items import build_context_xml  # noqa: PLC0415

        items = [
            {'id': 'ctx-001', 'description': 'First item', 'data': 'Data A'},
            {'id': 'ctx-002', 'description': 'Second item', 'data': 'Data B'},
        ]
        result = build_context_xml(items)

        assert 'index="1"' in result, 'First item must have index="1"'
        assert 'index="2"' in result, 'Second item must have index="2"'
        assert 'index="0"' not in result, 'Indexing must be 1-based, not 0-based'

    def test_context_item_id_in_context_tag(self):
        """Each <context> element must include the id attribute.

        Contract ref: bedrock-agent.ts <context id="{id}" index="{1-based}">
        """
        from context_items import build_context_xml  # noqa: PLC0415

        items = [{'id': 'ctx-abc-123', 'description': 'Test item', 'data': 'Some data'}]
        result = build_context_xml(items)

        assert 'id="ctx-abc-123"' in result, f'Context tag must include id attribute. Got: {result!r}'

    def test_non_string_data_json_stringified_with_2_space_indent(self):
        """Non-string context data must be JSON.stringify-ed with 2-space indentation.

        Contract ref: bedrock-agent.ts — JSON.stringify(context, null, 2) for non-string data
        """
        from context_items import build_context_xml  # noqa: PLC0415

        items = [{'id': 'ctx-obj', 'description': 'Object data', 'data': {'key': 'value', 'num': 42}}]
        result = build_context_xml(items)

        # JSON with 2-space indent
        expected_json = json.dumps({'key': 'value', 'num': 42}, indent=2)
        assert expected_json in result, (
            f'Non-string data must be JSON-stringified with 2-space indent. '
            f'Expected: {expected_json!r} in result: {result!r}'
        )

    def test_string_data_included_directly(self):
        """String context data must be included as-is (not JSON-encoded).

        Contract ref: bedrock-agent.ts — string data included directly in <data> tag
        """
        from context_items import build_context_xml  # noqa: PLC0415

        raw_text = 'Order #123 is in status: PENDING'
        items = [{'id': 'ctx-str', 'description': 'Status', 'data': raw_text}]
        result = build_context_xml(items)

        assert raw_text in result, f'String data must appear as-is in XML. Got: {result!r}'

    def test_empty_context_items_returns_empty_string(self):
        """Empty context items list must produce no <additional-context> block.

        Contract ref: bedrock-agent.ts — no context injection when llmContextItems is absent/empty
        """
        from context_items import build_context_xml  # noqa: PLC0415

        result = build_context_xml([])

        assert result == '' or result is None, (
            f'Empty context items must produce no XML. Got: {result!r}'
        )

    def test_context_xml_contains_description_tag(self):
        """Each context item must include a <description> tag.

        Contract ref: bedrock-agent.ts <description>{description}</description>
        """
        from context_items import build_context_xml  # noqa: PLC0415

        items = [{'id': 'ctx-001', 'description': 'Customer account details', 'data': 'Account data here'}]
        result = build_context_xml(items)

        assert '<description>Customer account details</description>' in result


# ---------------------------------------------------------------------------
# Tests: build_sent_context_record() — SentContextRecord shape
# ---------------------------------------------------------------------------

class TestSentContextRecord:
    """Contract for SentContextRecord structure."""

    def test_sent_context_record_has_all_required_fields(self):
        """SentContextRecord must contain: sourceId, messageIds, contentHash, lastSentAt, origin.

        Contract ref: bedrock-agent.ts SentContextRecord type
        """
        from context_items import build_sent_context_record  # noqa: PLC0415

        context_item = {
            'id': 'ctx-001',
            'contentHash': 'abc123def456',
            'origin': 'tool-result',
        }
        message_ids = ['sess-001:1000', 'sess-001:1001']

        result = build_sent_context_record(context_item, message_ids)

        assert result.get('sourceId') == 'ctx-001', f'sourceId must equal context.id. Got: {result}'
        assert result.get('messageIds') == message_ids, f'messageIds must match. Got: {result}'
        assert result.get('contentHash') == 'abc123def456', f'contentHash must match. Got: {result}'
        assert result.get('origin') == 'tool-result', f'origin must match. Got: {result}'
        assert 'lastSentAt' in result, f'lastSentAt must be present. Got: {result}'

    def test_last_sent_at_is_iso8601_string_not_date_object(self):
        """lastSentAt must be an ISO-8601 string, NOT a Python datetime or Date object.

        Contract ref: bedrock-agent.ts lastSentAt: new Date().toISOString()
            Must be stored as a string for DynamoDB compatibility.
        """
        from context_items import build_sent_context_record  # noqa: PLC0415

        context_item = {'id': 'ctx-002', 'contentHash': 'xyz', 'origin': 'kb'}
        result = build_sent_context_record(context_item, ['sess-001:1000'])

        last_sent_at = result.get('lastSentAt')
        assert isinstance(last_sent_at, str), (
            f'lastSentAt must be a string (ISO-8601), not {type(last_sent_at).__name__}. Got: {last_sent_at!r}'
        )
        # Validate ISO-8601 format: contains 'T' separator
        assert 'T' in last_sent_at, (
            f'lastSentAt must be ISO-8601 format (contains "T"). Got: {last_sent_at!r}'
        )


# ---------------------------------------------------------------------------
# Tests: update_session_sent_contexts() — merge operation
# ---------------------------------------------------------------------------

class TestUpdateSessionSentContexts:
    """Contract: updateSessionSentContexts is a merge (not replace) operation."""

    def test_sent_contexts_update_is_merge_not_replace(self):
        """update_session_sent_contexts must MERGE new records into existing sentContexts, not replace.

        Contract ref: bedrock-agent.ts — sentContexts is a Map, new entries are merged in.
        """
        from context_items import update_session_sent_contexts  # noqa: PLC0415

        mock_ddb = MagicMock()
        update_calls = []
        mock_ddb.Table.return_value.update_item.side_effect = lambda **kw: update_calls.append(kw)

        new_contexts = {
            'ctx-new': {
                'sourceId': 'ctx-new',
                'messageIds': ['sess:1000'],
                'contentHash': 'hash-new',
                'lastSentAt': '2026-04-09T20:00:00.000Z',
                'origin': 'tool',
            }
        }

        update_session_sent_contexts(mock_ddb, 'test-session-table', 'user-001', 'sess-001', new_contexts)

        assert len(update_calls) >= 1, 'update_session_sent_contexts must call DDB update_item'

        # Verify it's using update_item (merge), not put_item (replace)
        assert mock_ddb.Table.return_value.update_item.called, (
            'Must use update_item (merge) not put_item (replace) for sentContexts'
        )
        assert not mock_ddb.Table.return_value.put_item.called, (
            'Must NOT use put_item for sentContexts — that would overwrite the entire record'
        )


# ---------------------------------------------------------------------------
# Tests: Handler integration — no context items → no sentContexts update
# ---------------------------------------------------------------------------

class TestSessionInsightsHandlerIntegration:
    """Contract: handler sends sentContexts update when llmContextItems provided."""

    def test_no_context_items_no_sent_contexts_update(self):
        """Handler must NOT call update_session_sent_contexts when llmContextItems is absent.

        Contract ref: bedrock-agent.ts — sentContexts only updated when context items provided.
        """
        import handler as h  # noqa: PLC0415

        event = _make_event()  # no llmContextItems
        mock_ddb = MagicMock()
        ctx = _make_ctx()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='ok'))),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.update_session_sent_contexts') as mock_update,
        ):
            result = h.handler(event, ctx)

        assert result['statusCode'] == 200
        assert not mock_update.called, (
            'update_session_sent_contexts must NOT be called when no llmContextItems provided'
        )

    def test_context_items_trigger_sent_contexts_update(self):
        """Handler must call update_session_sent_contexts when llmContextItems is non-empty.

        Contract ref: bedrock-agent.ts — sentContexts update fired after response
        """
        import handler as h  # noqa: PLC0415

        context_items = [
            {'id': 'ctx-001', 'description': 'Order data', 'data': 'Order is pending.',
             'contentHash': 'hash-001', 'origin': 'tool-result'},
        ]
        event = _make_event(context_items=context_items)
        mock_ddb = MagicMock()
        ctx = _make_ctx()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='ok'))),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.update_session_sent_contexts') as mock_update,
        ):
            result = h.handler(event, ctx)

        assert result['statusCode'] == 200
        assert mock_update.called, (
            'update_session_sent_contexts must be called when llmContextItems is non-empty'
        )

    def test_context_items_injected_into_prompt_as_additional_context_xml(self):
        """Handler must inject context items as <additional-context> XML into the user message/prompt.

        Contract ref: bedrock-agent.ts context injection template in prompt construction.
        """
        import handler as h  # noqa: PLC0415

        context_items = [
            {'id': 'ctx-002', 'description': 'Account status', 'data': 'Account is active.',
             'contentHash': 'hash-002', 'origin': 'kb'},
        ]
        event = _make_event(context_items=context_items)
        mock_ddb = MagicMock()
        ctx = _make_ctx()

        captured_messages = []

        class MockAgent:
            def __init__(self, **kwargs):
                pass

            def __call__(self, message, **kwargs):
                captured_messages.append(message)
                return 'ok'

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MockAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.update_session_sent_contexts'),
        ):
            result = h.handler(event, ctx)

        assert result['statusCode'] == 200
        # Verify <additional-context> was injected into the agent message
        all_text = ' '.join(str(m) for m in captured_messages)
        assert '<additional-context>' in all_text, (
            'Context items must be injected as <additional-context> XML into agent prompt or message'
        )
