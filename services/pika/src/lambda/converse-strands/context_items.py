"""Session insights: context injection and sent_contexts tracking.

Handles llmContextItems from the request — builds XML for prompt injection
and tracks what was sent via sent_contexts on the DDB session record.
"""
import json
from datetime import datetime, timezone
from xml.sax.saxutils import escape, quoteattr


def build_context_xml(context_items: list[dict]) -> str:
    """Build <additional-context> XML from llmContextItems.

    Returns empty string if context_items is empty.
    """
    if not context_items:
        return ''

    parts = [
        '<additional-context>',
        'The following additional context may be relevant to answering the user\'s question:',
        '',
    ]
    for i, item in enumerate(context_items, start=1):
        item_id = item.get('id') or f'ctx-{i}'
        description = item.get('description')
        # The client sends the payload under context; data is a legacy fallback.
        data = item.get('context')
        if data is None:
            data = item.get('data', '')
        if data is None:
            data = ''
        if not isinstance(data, str):
            data = json.dumps(data, indent=2)
        # Client-controlled strings are escaped so a crafted value cannot close an element and forge prompt structure.
        id_attr = quoteattr(str(item_id))
        description = escape('' if description is None else str(description))
        data = escape(data)
        parts.append(f'<context id={id_attr} index="{i}">')
        parts.append(f'<description>{description}</description>')
        parts.append('<data>')
        parts.append(data)
        parts.append('</data>')
        parts.append('</context>')
    parts.append('</additional-context>')
    return '\n'.join(parts)


def build_sent_context_record(context_item: dict, message_ids: list[str]) -> dict:
    """Build a SentContextRecord for DDB storage."""
    return {
        'sourceId': context_item.get('id', ''),
        'messageIds': message_ids,
        'contentHash': context_item.get('contentHash', ''),
        'lastSentAt': datetime.now(timezone.utc).isoformat(),
        'origin': context_item.get('origin', ''),
    }


SENT_CONTEXTS_ATTR = 'sent_contexts'

_RECORD_KEY_TO_SNAKE = {
    'sourceId': 'source_id',
    'messageIds': 'message_ids',
    'contentHash': 'content_hash',
    'lastSentAt': 'last_sent_at',
    'origin': 'origin',
}


def _record_to_snake_case(record: dict) -> dict:
    """Convert a SentContextRecord's keys to their snake_case storage form."""
    return {_RECORD_KEY_TO_SNAKE.get(k, k): v for k, v in record.items()}


def update_session_sent_contexts(ddb, table_name: str, user_id: str, session_id: str, sent_contexts: dict) -> None:
    """Merge new sent context records into the session record (update, not replace).

    Setting a nested path (sent_contexts.<id>) requires the parent map to already
    exist — DynamoDB does not auto-create intermediate path components and raises
    ValidationException ("document path ... invalid for update") otherwise. Seed the
    map with if_not_exists once (preserving any existing entries), then set each key.
    """
    if not sent_contexts:
        return

    key = {'user_id': user_id, 'session_id': session_id}
    table = ddb.Table(table_name)

    # Seeded in its own call: combined with the nested sets below, #sc and #sc.<key>
    # would overlap in one expression, which DynamoDB rejects.
    table.update_item(
        Key=key,
        UpdateExpression='SET #sc = if_not_exists(#sc, :empty)',
        ExpressionAttributeNames={'#sc': SENT_CONTEXTS_ATTR},
        ExpressionAttributeValues={':empty': {}},
    )

    names = {'#sc': SENT_CONTEXTS_ATTR}
    values: dict = {}
    set_clauses = []
    for i, (ctx_id, record) in enumerate(sent_contexts.items()):
        names[f'#k{i}'] = ctx_id
        values[f':v{i}'] = _record_to_snake_case(record)
        set_clauses.append(f'#sc.#k{i} = :v{i}')

    table.update_item(
        Key=key,
        UpdateExpression='SET ' + ', '.join(set_clauses),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )
