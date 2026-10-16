"""Session insights: context injection and sent_contexts tracking.

Handles llmContextItems from the request: builds XML for prompt injection and tracks what
was sent via sent_contexts on the DDB session record. An item whose contentHash matches the
hash this session's sent_contexts ledger already holds for its id is emitted as
delivery="repeat" with its data omitted; the first delivery's body is replayed from the
llm_context_xml persisted on that turn's user message.
"""
import json
from datetime import datetime, timezone
from xml.sax.saxutils import escape, quoteattr


def _prior_content_hash(prior_record: dict | None) -> str | None:
    """Read contentHash off a stored SentContextRecord (snake_case or camelCase)."""
    if not isinstance(prior_record, dict):
        return None
    value = prior_record.get('content_hash', prior_record.get('contentHash'))
    return value if isinstance(value, str) and value else None


def is_repeat_delivery(
        item_id: str,
        item: dict,
        prior_sent_contexts: dict | None = None,
) -> bool:
    """True when this item's DATA was already delivered verbatim on an earlier turn.

    Byte-identity on the content hash the client computed for this payload. A missing or
    blank hash on either side never matches, so an unprovable item is delivered in full.
    """
    if not isinstance(item, dict):
        return False
    ledger = prior_sent_contexts if isinstance(prior_sent_contexts, dict) else {}
    item_hash = item.get('contentHash')
    item_hash = item_hash if isinstance(item_hash, str) and item_hash else None
    prior_hash = _prior_content_hash(ledger.get(item_id))
    return item_hash is not None and item_hash == prior_hash


def build_context_xml(context_items: list[dict], prior_sent_contexts: dict | None = None) -> str:
    """Build <additional-context> XML from llmContextItems.

    Returns empty string if context_items is empty. `prior_sent_contexts` is the session's
    sent_contexts ledger covering prior turns only; omit it for unconditional full delivery.
    """
    if not context_items:
        return ''

    ledger = prior_sent_contexts if isinstance(prior_sent_contexts, dict) else {}

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
        is_repeat = is_repeat_delivery(item_id, item, ledger)
        # Client-controlled strings are escaped so a crafted value cannot close an element and forge prompt structure.
        id_attr = quoteattr(str(item_id))
        description = escape('' if description is None else str(description))
        data = escape(data)

        if is_repeat:
            parts.append(f'<context id={id_attr} index="{i}" delivery="repeat">')
            parts.append(f'<description>{description}</description>')
            parts.append('<data-omitted reason="unchanged-since-first-delivery"/>')
            parts.append('</context>')
            continue

        parts.append(f'<context id={id_attr} index="{i}" delivery="first">')
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


# Persisted beside `message`, which is what the UI shows; replayed to the model only.
LLM_CONTEXT_XML_ATTR = 'llm_context_xml'
LLM_CORRECTION_ATTR = 'llm_correction'
LLM_USER_CONTENT_ATTR = 'llm_user_content'


def message_text_for_llm_replay(msg: dict) -> str:
    """Rebuild the LLM-visible turn from persisted message fields."""
    text = str(msg.get('message') or '')
    for attr in (LLM_CONTEXT_XML_ATTR, LLM_CORRECTION_ATTR):
        extra = msg.get(attr)
        if isinstance(extra, str) and extra:
            text = f'{text}\n\n{extra}'
    return text


def message_content_for_llm_replay(msg: dict) -> list[dict]:
    raw = msg.get(LLM_USER_CONTENT_ATTR)
    if isinstance(raw, str) and raw:
        try:
            texts = json.loads(raw)
        except ValueError:
            texts = None
        if isinstance(texts, list) and texts and all(isinstance(t, str) for t in texts):
            return [{'text': t} for t in texts]
    return [{'text': message_text_for_llm_replay(msg)}]


def llm_context_xml_fits_message_item(user_msg_without_context: dict, context_xml: str) -> bool:
    """Return whether context_xml can be persisted on the user message item safely."""
    if not context_xml:
        return True
    from trace_store import inline_trace_budget  # noqa: PLC0415

    budget = inline_trace_budget(user_msg_without_context)
    return len(context_xml.encode('utf-8')) <= budget


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
