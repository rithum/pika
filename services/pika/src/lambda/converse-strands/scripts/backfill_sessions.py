#!/usr/bin/env python3
"""Backfill missing chat_app_sk, chat_app_id, create_date, and other fields on
Strands-created sessions so they appear in the frontend session list.

The frontend queries the user-chat-app-index GSI with:
    begins_with(chat_app_sk, '{chatAppId}#user#')

Strands sessions created before the fix are missing this field entirely.

Usage:
    python3 scripts/backfill_sessions.py [--dry-run]
"""
import argparse
import sys
from datetime import datetime, timezone
from decimal import Decimal

import boto3

SESSION_TABLE = 'chat-session-ai-bot-test'
MESSAGE_TABLE = 'chat-message-ai-bot-test'
USER_ID = '6881125b7daf26208e5c1bf1'


def backfill(dry_run: bool = False):
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    session_table = dynamodb.Table(SESSION_TABLE)
    message_table = dynamodb.Table(MESSAGE_TABLE)

    # Fetch all sessions for the user
    response = session_table.query(
        KeyConditionExpression='user_id = :uid',
        ExpressionAttributeValues={':uid': USER_ID},
    )
    sessions = response['Items']
    print(f'Found {len(sessions)} sessions for user {USER_ID}')

    fixed = 0
    skipped = 0
    for session in sessions:
        sid = session['session_id']
        chat_app_sk = session.get('chat_app_sk')
        chat_app_id = session.get('chat_app_id')
        create_date = session.get('create_date')

        # Skip sessions that already have chat_app_sk (TS-created or already fixed)
        if chat_app_sk and chat_app_id and create_date:
            skipped += 1
            continue

        agent_id = session.get('agent_id', 'unknown')
        title = session.get('title', 'no title')

        # Derive chat_app_id from agent_id (matches the TS pattern)
        derived_chat_app_id = chat_app_id or agent_id

        # Get the earliest message timestamp for create_date
        msg_response = message_table.query(
            KeyConditionExpression='user_id = :uid AND begins_with(message_id, :sid_prefix)',
            ExpressionAttributeValues={
                ':uid': USER_ID,
                ':sid_prefix': f'{sid}:',
            },
            Limit=1,
        )
        messages = msg_response.get('Items', [])

        # Derive timestamps from messages or fall back to existing fields
        if messages:
            first_msg_ts = messages[0].get('timestamp', 0)
            if isinstance(first_msg_ts, (int, float, Decimal)):
                derived_create_date = datetime.fromtimestamp(int(first_msg_ts) / 1000, tz=timezone.utc).isoformat()
            else:
                derived_create_date = str(first_msg_ts)
        else:
            # No messages — use existing created_at or now
            existing_ts = session.get('created_at')
            if existing_ts and isinstance(existing_ts, (int, float, Decimal)):
                derived_create_date = datetime.fromtimestamp(int(existing_ts) / 1000, tz=timezone.utc).isoformat()
            else:
                derived_create_date = datetime.now(timezone.utc).isoformat()

        # Get the latest message for last_update and last_message_id
        all_msgs = message_table.query(
            KeyConditionExpression='user_id = :uid AND begins_with(message_id, :sid_prefix)',
            ExpressionAttributeValues={
                ':uid': USER_ID,
                ':sid_prefix': f'{sid}:',
            },
            ScanIndexForward=False,
            Limit=1,
        )
        last_msgs = all_msgs.get('Items', [])
        if last_msgs:
            last_msg = last_msgs[0]
            last_msg_ts = last_msg.get('timestamp', 0)
            if isinstance(last_msg_ts, (int, float, Decimal)):
                derived_last_update = datetime.fromtimestamp(int(last_msg_ts) / 1000, tz=timezone.utc).isoformat()
            else:
                derived_last_update = str(last_msg_ts)
            derived_last_message_id = last_msg.get('message_id', '')
        else:
            derived_last_update = derived_create_date
            derived_last_message_id = ''

        derived_chat_app_sk = f'{derived_chat_app_id}#user#{derived_last_update}'

        print(f'\n  Session: {sid}')
        print(f'    agent_id: {agent_id}')
        print(f'    title: {title}')
        print(f'    chat_app_id: {chat_app_id} → {derived_chat_app_id}')
        print(f'    chat_app_sk: {chat_app_sk} → {derived_chat_app_sk}')
        print(f'    create_date: {create_date} → {derived_create_date}')
        print(f'    last_update: {session.get("last_update")} → {derived_last_update}')

        if dry_run:
            print(f'    [DRY RUN] Would update')
            fixed += 1
            continue

        # Build update expression
        update_parts = []
        expr_values = {}

        if not chat_app_sk:
            update_parts.append('chat_app_sk = :sk')
            expr_values[':sk'] = derived_chat_app_sk
        if not chat_app_id:
            update_parts.append('chat_app_id = :caid')
            expr_values[':caid'] = derived_chat_app_id
        if not create_date:
            update_parts.append('create_date = :cd')
            expr_values[':cd'] = derived_create_date
        if not session.get('identity_id'):
            update_parts.append('identity_id = :iid')
            expr_values[':iid'] = USER_ID
        if not session.get('agent_alias_id'):
            update_parts.append('agent_alias_id = :aaid')
            expr_values[':aaid'] = agent_id
        expr_names = {}
        if session.get('source') == 'strands':
            update_parts.append('#src = :src')
            expr_values[':src'] = 'user'
            expr_names['#src'] = 'source'

        # Always update last_update to ISO format and set last_message_id
        update_parts.append('last_update = :lu')
        expr_values[':lu'] = derived_last_update
        if derived_last_message_id:
            update_parts.append('last_message_id = :lmid')
            expr_values[':lmid'] = derived_last_message_id

        if update_parts:
            kwargs = {
                'Key': {'user_id': USER_ID, 'session_id': sid},
                'UpdateExpression': f'SET {", ".join(update_parts)}',
                'ExpressionAttributeValues': expr_values,
            }
            if expr_names:
                kwargs['ExpressionAttributeNames'] = expr_names
            session_table.update_item(**kwargs)
            print(f'    ✓ Updated')
            fixed += 1

    print(f'\nDone. Fixed: {fixed}, Skipped (already OK): {skipped}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Show what would change without writing')
    args = parser.parse_args()
    backfill(dry_run=args.dry_run)
