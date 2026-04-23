"""Session insights: context injection and sentContexts tracking.

Handles llmContextItems from the request — builds XML for prompt injection
and tracks what was sent via sentContexts on the DDB session record.
"""
import json
from datetime import datetime, timezone


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
        item_id = item.get('id', f'ctx-{i}')
        description = item.get('description', '')
        data = item.get('data', '')
        if not isinstance(data, str):
            data = json.dumps(data, indent=2)
        parts.append(f'<context id="{item_id}" index="{i}">')
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


def update_session_sent_contexts(ddb, table_name: str, user_id: str, session_id: str, sent_contexts: dict) -> None:
    """Merge new sentContexts into the session record (update, not replace)."""
    table = ddb.Table(table_name)
    for ctx_id, record in sent_contexts.items():
        table.update_item(
            Key={'user_id': user_id, 'session_id': session_id},
            UpdateExpression='SET sentContexts.#ctxId = :record',
            ExpressionAttributeNames={'#ctxId': ctx_id},
            ExpressionAttributeValues={':record': record},
        )
