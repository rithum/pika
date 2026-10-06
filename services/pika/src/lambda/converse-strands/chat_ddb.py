"""DynamoDB helpers for session and message management.

Mirrors the patterns in services/pika/src/lib/chat-ddb.ts.
Key schemas:
  - Session table: PK=user_id, SK=session_id
  - Messages table: PK=user_id, SK=message_id (format: {sessionId}:{timestamp})
  - GSI user-chat-app-index: PK=user_id, SK=chat_app_sk
    Format: {chatAppId}#{source}#{lastUpdate_ISO}
All attribute names are snake_case in DynamoDB.
"""
import hashlib
import logging
import os
import time
from datetime import datetime, timezone
from decimal import Decimal

from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# Account-id field names used to decide whether a session already carries
# account context (mirrors utils.getAccountIdFieldNames / PIKA_ACCOUNT_ID_FIELD_NAMES).
DEFAULT_ACCOUNT_ID_FIELDS = ('accountId', 'account_id')


def _account_id_field_names() -> list[str]:
    env = os.environ.get('PIKA_ACCOUNT_ID_FIELD_NAMES')
    if env:
        return [s.strip() for s in env.split(',') if s.strip()]
    return list(DEFAULT_ACCOUNT_ID_FIELDS)


def _present_account_value(v) -> bool:
    """True for a usable account id. Decimal counts because boto3 returns every DynamoDB number as Decimal."""
    return (isinstance(v, str) and len(v) > 0) or isinstance(v, (int, float, Decimal))


def _has_account_context(session: dict) -> bool:
    """True if an account id is already present (in session_attributes or top-level)."""
    fields = _account_id_field_names()
    attrs = session.get('session_attributes')
    if isinstance(attrs, dict) and any(_present_account_value(attrs.get(f)) for f in fields):
        return True
    return any(_present_account_value(session.get(f)) for f in fields)


def session_token(session_id: str, user_id: str) -> str:
    """Mirror utils.createSessionToken — sha256 of '<sessionId>:<userId>'."""
    return hashlib.sha256(f'{session_id}:{user_id}'.encode()).hexdigest()


def _source_for_key(source: str | None) -> str:
    """Map source to the value used in the chat_app_sk composite key.

    Matches the TS logic in chat-ddb.ts addChatSession/updateSession:
    'user', 'component-as-user', or missing → 'user'
    'component' → 'component'
    """
    if not source or source in ('user', 'component-as-user'):
        return 'user'
    return 'component'


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_session(dynamodb_resource, table_name: str, user_id: str, session_id: str,
                   agent_id: str, chat_app_id: str, source: str = 'user',
                   user_type: str | None = None,
                   session_attributes: dict | None = None, *, _retried: bool = False) -> dict:
    """Create or retrieve a chat session. Matches ensureChatSession() in chat-apis.ts.

    Creates the session with the fields the frontend needs, including the
    chat_app_sk composite key for the user-chat-app-index GSI and the
    session_attributes map (account context, currentDate, etc.) that
    persisted-session readers such as session insights expect. The TypeScript
    path writes session_attributes on create.
    """
    table = dynamodb_resource.Table(table_name)

    key = {'user_id': user_id, 'session_id': session_id}
    response = table.get_item(Key=key, ConsistentRead=True) if _retried else table.get_item(Key=key)
    if 'Item' in response:
        existing = response['Item']
        # Self-heal: backfills only missing account fields, per key and conditionally, so a concurrent writer's pin wins; a failed write fails the turn rather than running unpinned.
        existing_attrs = existing.get('session_attributes')
        if not isinstance(existing_attrs, dict):
            existing_attrs = {}

        if session_attributes and not _has_account_context(existing):
            backfill = {
                k: session_attributes[k]
                for k in (*_account_id_field_names(), 'accountType', 'account_type', 'accountName', 'account_name', 'account')
                if session_attributes.get(k) is not None and k not in existing_attrs
            }
            if backfill:
                names = {'#sa': 'session_attributes'}
                values = {}
                set_clauses = []
                for i, (attr, value) in enumerate(backfill.items()):
                    names[f'#k{i}'] = attr
                    values[f':v{i}'] = value
                    set_clauses.append(f'#sa.#k{i} = :v{i}')
                if not isinstance(existing.get('session_attributes'), dict):
                    try:
                        table.update_item(
                            Key=key,
                            UpdateExpression='SET #sa = :empty',
                            ConditionExpression='attribute_not_exists(#sa) OR NOT attribute_type(#sa, :map)',
                            ExpressionAttributeNames={'#sa': 'session_attributes'},
                            ExpressionAttributeValues={':empty': {}, ':map': 'M'},
                        )
                    except ClientError as e:
                        if e.response['Error']['Code'] != 'ConditionalCheckFailedException':
                            raise
                try:
                    table.update_item(
                        Key=key,
                        UpdateExpression='SET ' + ', '.join(set_clauses),
                        ConditionExpression=' AND '.join(f'attribute_not_exists(#sa.#k{i})' for i in range(len(backfill))),
                        ExpressionAttributeNames=names,
                        ExpressionAttributeValues=values,
                    )
                except ClientError as e:
                    if e.response['Error']['Code'] != 'ConditionalCheckFailedException' or _retried:
                        raise
                    return ensure_session(dynamodb_resource, table_name, user_id, session_id, agent_id, chat_app_id,
                                          source=source, user_type=user_type, session_attributes=session_attributes,
                                          _retried=True)
                existing['session_attributes'] = {**existing_attrs, **backfill}
        return existing

    now_iso = _now_iso()
    sk_source = _source_for_key(source)
    session = {
        'user_id': user_id,
        'session_id': session_id,
        'agent_id': agent_id,
        'agent_alias_id': agent_id,
        'chat_app_id': chat_app_id,
        'chat_app_sk': f'{chat_app_id}#{sk_source}#{now_iso}',
        'identity_id': user_id,
        'create_date': now_iso,
        'last_update': now_iso,
        'source': source,
        'user_type': user_type or 'internal-user',
        'input_tokens': 0,
        'output_tokens': 0,
        'input_cost': Decimal('0'),
        'output_cost': Decimal('0'),
        'total_cost': Decimal('0'),
    }
    if session_attributes is not None:
        session['session_attributes'] = session_attributes
    try:
        table.put_item(
            Item=session,
            ConditionExpression='attribute_not_exists(session_id)',
        )
    except dynamodb_resource.meta.client.exceptions.ConditionalCheckFailedException:
        # Another concurrent request already created the session — read it back.
        return table.get_item(Key=key, ConsistentRead=True).get('Item', session)
    return session


def update_session(dynamodb_resource, table_name: str, user_id: str, session_id: str,
                   last_message_id: str, usage: dict | None = None,
                   chat_app_id: str | None = None, source: str | None = None) -> None:
    """Update session after a response. Matches updateSession() in chat-ddb.ts.

    Sets last_message_id, last_update, chat_app_sk, and accumulates token/cost counters.
    """
    table = dynamodb_resource.Table(table_name)
    timestamp = _now_iso()

    set_parts = ['last_message_id = :messageId', 'last_update = :timestamp']
    expr_values = {
        ':messageId': last_message_id,
        ':timestamp': timestamp,
        ':inputCost': Decimal(str(usage.get('inputCost', 0))) if usage else Decimal('0'),
        ':inputTokens': usage.get('inputTokens', 0) if usage else 0,
        ':outputCost': Decimal(str(usage.get('outputCost', 0))) if usage else Decimal('0'),
        ':outputTokens': usage.get('outputTokens', 0) if usage else 0,
        ':totalCost': Decimal(str(usage.get('totalCost', 0))) if usage else Decimal('0'),
    }

    if chat_app_id:
        sk_source = _source_for_key(source)
        set_parts.append('chat_app_sk = :chatAppSk')
        expr_values[':chatAppSk'] = f'{chat_app_id}#{sk_source}#{timestamp}'

    table.update_item(
        Key={'user_id': user_id, 'session_id': session_id},
        UpdateExpression=f"SET {', '.join(set_parts)} ADD input_cost :inputCost, input_tokens :inputTokens, output_cost :outputCost, output_tokens :outputTokens, total_cost :totalCost",
        ExpressionAttributeValues=expr_values,
    )


def add_message(dynamodb_resource, table_name: str, message: dict) -> None:
    """Store a chat message. Matches addChatMessage() in chat-apis.ts.

    The message_id format MUST be {sessionId}:{timestamp} — this is load-bearing
    for the begins_with query pattern used to fetch all messages in a session.
    """
    table = dynamodb_resource.Table(table_name)
    table.put_item(Item=message)


def get_messages(dynamodb_resource, table_name: str, user_id: str, session_id: str) -> list[dict]:
    """Fetch all messages for a session. Uses begins_with on message_id.

    Must follow LastEvaluatedKey: assistant messages carry full traces (tool
    results + llm-instruction), so long sessions exceed DynamoDB's 1 MB
    per-query cap. Items return oldest-first — a single unpaginated query
    silently drops the NEWEST turns, freezing the agent's view of the
    conversation at the 1 MB boundary.
    """
    table = dynamodb_resource.Table(table_name)
    items: list[dict] = []
    query_kwargs = {
        'KeyConditionExpression': 'user_id = :uid AND begins_with(message_id, :sid_prefix)',
        'ExpressionAttributeValues': {
            ':uid': user_id,
            ':sid_prefix': f"{session_id}:",
        },
    }
    while True:
        response = table.query(**query_kwargs)
        items.extend(response.get('Items', []))
        last_key = response.get('LastEvaluatedKey')
        # Continue only on a real key dict — guards against non-dict values
        # (e.g. test doubles) turning this loop infinite.
        if not isinstance(last_key, dict) or not last_key:
            return items
        query_kwargs['ExclusiveStartKey'] = last_key


def get_session(dynamodb_resource, table_name: str, user_id: str, session_id: str) -> dict | None:
    """Fetch a session record."""
    table = dynamodb_resource.Table(table_name)
    response = table.get_item(Key={'user_id': user_id, 'session_id': session_id})
    return response.get('Item')


def get_user(dynamodb_resource, table_name: str, user_id: str) -> dict | None:
    """Fetch a user record from the chat user table.

    The table PK is snake_case `user_id` (matching all other pika DDB tables).
    """
    table = dynamodb_resource.Table(table_name)
    response = table.get_item(Key={'user_id': user_id})
    return response.get('Item')
