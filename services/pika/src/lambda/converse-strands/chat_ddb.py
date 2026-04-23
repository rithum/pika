"""DynamoDB helpers for session and message management.

Mirrors the patterns in services/pika/src/lib/chat-ddb.ts.
Key schemas:
  - Session table: PK=user_id, SK=session_id
  - Messages table: PK=user_id, SK=message_id (format: {sessionId}:{timestamp})
  - GSI user-chat-app-index: PK=user_id, SK=chat_app_sk
    Format: {chatAppId}#{source}#{lastUpdate_ISO}
All attribute names are snake_case in DynamoDB.
"""
import time
from datetime import datetime, timezone
from decimal import Decimal


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
                   user_type: str | None = None) -> dict:
    """Create or retrieve a chat session. Matches ensureChatSession() in chat-apis.ts.

    Creates the session with all fields required by the frontend, including the
    chat_app_sk composite key used by the user-chat-app-index GSI.
    """
    table = dynamodb_resource.Table(table_name)

    response = table.get_item(Key={'user_id': user_id, 'session_id': session_id})
    if 'Item' in response:
        return response['Item']

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
    try:
        table.put_item(
            Item=session,
            ConditionExpression='attribute_not_exists(session_id)',
        )
    except dynamodb_resource.meta.client.exceptions.ConditionalCheckFailedException:
        # Another concurrent request already created the session — read it back.
        return table.get_item(Key={'user_id': user_id, 'session_id': session_id}).get('Item', session)
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
    """Fetch all messages for a session. Uses begins_with on message_id."""
    table = dynamodb_resource.Table(table_name)
    response = table.query(
        KeyConditionExpression='user_id = :uid AND begins_with(message_id, :sid_prefix)',
        ExpressionAttributeValues={
            ':uid': user_id,
            ':sid_prefix': f"{session_id}:",
        },
    )
    return response.get('Items', [])


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
