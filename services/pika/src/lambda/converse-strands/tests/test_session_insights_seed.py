"""Regression tests for update_session_sent_contexts parent-map seeding.

Setting a nested DDB path (sent_contexts.<id>) on a session that has no
sent_contexts attribute yet raises ValidationException ("document path ...
invalid for update") because DynamoDB does not auto-create intermediate path
components. These tests lock in the fix: a one-time if_not_exists seed of the
parent map (preserving existing entries) before each nested set, stored under
the snake_case `sent_contexts` attribute with snake_case record values to match
the TypeScript converse path and the snake->camel session reader.
"""
from unittest.mock import MagicMock

from context_items import (
    build_sent_context_record,
    update_session_sent_contexts,
    SENT_CONTEXTS_ATTR,
)


def _capture_update_calls():
    """Return (mock_ddb, calls) where calls records every update_item kwargs dict."""
    mock_ddb = MagicMock()
    calls = []
    mock_ddb.Table.return_value.update_item.side_effect = lambda **kw: calls.append(kw)
    return mock_ddb, calls


def _is_seed(call):
    return call['UpdateExpression'] == 'SET #sc = if_not_exists(#sc, :empty)'


def test_seeds_parent_map_before_setting_keys():
    """The first update must seed the parent map via if_not_exists, before the nested set."""
    mock_ddb, calls = _capture_update_calls()
    record = build_sent_context_record(
        {'id': 'ctx-1', 'contentHash': 'h1', 'origin': 'tool'}, ['sess:1000']
    )

    update_session_sent_contexts(mock_ddb, 'sessions', 'user-1', 'sess-1', {'ctx-1': record})

    assert len(calls) == 2, f'expected one seed + one set, got {len(calls)} calls'
    seed, nested = calls
    assert _is_seed(seed)
    assert seed['ExpressionAttributeValues'] == {':empty': {}}
    assert nested['UpdateExpression'].startswith('SET #sc.')


def test_two_calls_regardless_of_record_count():
    """All records are written in a single expression: 2 DDB calls total (seed + one set)."""
    mock_ddb, calls = _capture_update_calls()
    records = {
        cid: build_sent_context_record({'id': cid, 'contentHash': 'h', 'origin': 'kb'}, ['sess:1'])
        for cid in ('ctx-a', 'ctx-b', 'ctx-c')
    }

    update_session_sent_contexts(mock_ddb, 'sessions', 'user-1', 'sess-1', records)

    assert len(calls) == 2, f'expected exactly seed + one batched set, got {len(calls)} calls'
    assert sum(_is_seed(c) for c in calls) == 1
    set_call = next(c for c in calls if not _is_seed(c))
    # Every sourceId is set in the one expression, each via its own placeholder.
    assert set_call['UpdateExpression'].count('#sc.#k') == 3
    assert set(set_call['ExpressionAttributeNames'].values()) == {'sent_contexts', 'ctx-a', 'ctx-b', 'ctx-c'}
    assert len(set_call['ExpressionAttributeValues']) == 3


def test_uses_snake_case_sent_contexts_attribute():
    """Both the seed and the set target the snake_case `sent_contexts` attribute."""
    assert SENT_CONTEXTS_ATTR == 'sent_contexts'
    mock_ddb, calls = _capture_update_calls()
    record = build_sent_context_record({'id': 'ctx-1', 'contentHash': 'h', 'origin': 'tool'}, ['sess:1'])

    update_session_sent_contexts(mock_ddb, 'sessions', 'user-1', 'sess-1', {'ctx-1': record})

    for c in calls:
        assert c['ExpressionAttributeNames']['#sc'] == 'sent_contexts'


def test_record_is_stored_snake_case():
    """Record values are stored snake_case so the snake->camel reader reconstructs them."""
    mock_ddb, calls = _capture_update_calls()
    record = build_sent_context_record(
        {'id': 'ctx-1', 'contentHash': 'abc123', 'origin': 'tool-result'},
        ['sess:1000', 'sess:1001'],
    )

    update_session_sent_contexts(mock_ddb, 'sessions', 'user-1', 'sess-1', {'ctx-1': record})

    set_call = next(c for c in calls if not _is_seed(c))
    stored = set_call['ExpressionAttributeValues'][':v0']
    assert set(stored.keys()) == {'source_id', 'message_ids', 'content_hash', 'last_sent_at', 'origin'}
    assert stored['source_id'] == 'ctx-1'
    assert stored['content_hash'] == 'abc123'
    assert stored['message_ids'] == ['sess:1000', 'sess:1001']
    assert 'sentContexts' not in stored and 'contentHash' not in stored


def test_source_id_key_preserved_as_map_key():
    """The original context id (incl. special chars) is the map key, set via a name placeholder."""
    mock_ddb, calls = _capture_update_calls()
    record = build_sent_context_record({'id': 'ctx.with-dots', 'contentHash': 'h', 'origin': 'kb'}, ['s:1'])

    update_session_sent_contexts(mock_ddb, 'sessions', 'user-1', 'sess-1', {'ctx.with-dots': record})

    set_call = next(c for c in calls if not _is_seed(c))
    assert 'ctx.with-dots' in set_call['ExpressionAttributeNames'].values()


def test_empty_sent_contexts_is_noop():
    """No update_item calls (not even the seed) when there is nothing to write."""
    mock_ddb, calls = _capture_update_calls()

    update_session_sent_contexts(mock_ddb, 'sessions', 'user-1', 'sess-1', {})

    assert calls == []
