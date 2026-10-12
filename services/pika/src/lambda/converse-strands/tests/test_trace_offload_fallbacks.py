"""Handler-level fallbacks around trace offload: item-size budget, persist retry, prompt dedupe."""
import json
import logging
import os
from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import boto3

from trace_store import DDB_ITEM_SAFE_BYTES

BASE_AGENT_DEF = {
    'agent_id': 'test-agent-001',
    'base_prompt': 'You are a helpful assistant for order management.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': [],
}


def _ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _run(event, *, agent_def=None, reply='Bot response', session_item=None,
         offload_raises=None, put_object_raises=False, add_message_fail_first=False, add_message_fail_always=False):
    mock_ddb = MagicMock()
    table = MagicMock()
    mock_ddb.Table.return_value = table
    table.get_item.return_value = {
        'Item': session_item or {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
    }

    s3 = boto3.client('s3')
    s3.put_object.reset_mock()
    s3.objects = {}

    def record_put(Bucket, Key, Body, **kwargs):
        if put_object_raises:
            raise RuntimeError('s3 down')
        s3.objects[Key] = Body
        return {}

    s3.put_object.side_effect = record_put

    agent = MagicMock()
    agent.return_value = reply
    persisted = []
    state = {'failed': False}

    def add_message(_ddb, _table, item):
        persisted.append(dict(item))
        if add_message_fail_always and item.get('source') == 'assistant':
            raise RuntimeError('ddb down')
        if add_message_fail_first and item.get('source') == 'assistant' and not state['failed']:
            state['failed'] = True
            raise RuntimeError('ValidationException: Item size has exceeded the maximum allowed size')

    patches = [
        patch('handler.dynamodb', mock_ddb),
        patch('handler.Agent', MagicMock(return_value=agent)),
        patch('handler.load_agent', return_value=agent_def or BASE_AGENT_DEF),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
        patch('handler.get_user', return_value={'user_id': 'test-user-001', 'custom_data': {}}),
        patch('handler.add_message', side_effect=add_message),
    ]
    if offload_raises is not None:
        patches.append(patch('handler.offload_traces', side_effect=offload_raises))
    with ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        from handler import handler
        handler(event, _ctx())
    assistant = [i for i in persisted if i.get('source') == 'assistant']
    return assistant, s3, table


class TestInlineFallbackRespectsItemBudget:
    def test_large_reply_and_large_prompt_trace_keep_item_under_ddb_limit(self, valid_event):
        agent_def = dict(BASE_AGENT_DEF, base_prompt=os.urandom(150_000).hex())
        assistant, _, _ = _run(
            valid_event, agent_def=agent_def, reply='r' * 150_000,
            offload_raises=RuntimeError('s3 down'), put_object_raises=True)

        item = assistant[-1]
        assert 'traces_s3' not in item
        assert item['traces']
        assert len(json.dumps(item, default=str).encode('utf-8')) <= DDB_ITEM_SAFE_BYTES


class TestPersistRetry:
    def test_retry_drops_traces_and_logs_the_recovery(self, valid_event, caplog):
        with caplog.at_level(logging.WARNING):
            assistant, _, _ = _run(valid_event, add_message_fail_first=True)

        assert len(assistant) == 2
        assert 'traces_s3' in assistant[0]
        retried = assistant[1]
        assert retried['traces_dropped'] is True
        assert 'traces_s3' not in retried and 'traces' not in retried
        assert any('Persisted assistant message without traces' in r.getMessage()
                   for r in caplog.records)


    def test_reply_lost_is_logged_and_the_handler_still_completes(self, valid_event, caplog):
        with caplog.at_level(logging.ERROR):
            assistant, _, _ = _run(valid_event, add_message_fail_always=True)

        assert len(assistant) == 2
        assert any('Assistant reply lost' in r.getMessage() for r in caplog.records)


class TestSystemPromptObjectDedupe:
    def test_second_turn_with_same_prompt_uploads_no_second_object(self, valid_event):
        _, s3_first, table_first = _run(valid_event)
        first_keys = [k for k in s3_first.objects if '/system-prompt-' in k]
        assert len(first_keys) == 1

        hash_updates = [c for c in table_first.update_item.call_args_list
                        if 'llm_instruction_hash' in c.kwargs.get('UpdateExpression', '')]
        known_hash = hash_updates[0].kwargs['ExpressionAttributeValues'][':h']

        _, s3_second, table_second = _run(valid_event, session_item={
            'user_id': 'test-user-001', 'session_id': 'test-session-001',
            'llm_instruction_hash': known_hash})
        assert [k for k in s3_second.objects if '/system-prompt-' in k] == []
        assert not [c for c in table_second.update_item.call_args_list
                    if 'llm_instruction_hash' in c.kwargs.get('UpdateExpression', '')]
