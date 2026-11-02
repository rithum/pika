import pytest

from context_items import (build_context_xml, build_sent_context_record, context_item_id,
                           is_repeat_delivery)


@pytest.mark.parametrize('raw, expected', [
    (7, '7'),
    (None, 'ctx-3'),
    (0, '0'),
    ('', 'ctx-3'),
    ('abc', 'abc'),
])
def test_context_item_id_rule(raw, expected):
    assert context_item_id({'id': raw}, 3) == expected


def test_missing_id_key_uses_index():
    assert context_item_id({}, 2) == 'ctx-2'


def test_numeric_id_is_repeat_against_string_keyed_ledger():
    item = {'id': 7, 'contentHash': 'h1', 'context': 'x'}
    ledger = {'7': {'content_hash': 'h1'}}

    xml = build_context_xml([item], ledger)

    assert 'delivery="repeat"' in xml
    assert is_repeat_delivery(context_item_id(item, 1), item, ledger)


@pytest.mark.parametrize('items', [
    [{'id': 7, 'contentHash': 'h'}, {'contentHash': 'h2'}, {'id': 0, 'contentHash': 'h3'}, {'id': '', 'contentHash': 'h4'}],
])
def test_ledger_key_and_source_id_agree(items):
    for i, item in enumerate(items, start=1):
        key = context_item_id(item, i)
        record = build_sent_context_record(item, ['m1'], i)
        assert record['sourceId'] == key
    assert [context_item_id(it, i) for i, it in enumerate(items, start=1)] == ['7', 'ctx-2', '0', 'ctx-4']


def test_xml_id_matches_ledger_key_for_missing_id():
    item = {'contentHash': 'h', 'context': 'x'}
    xml = build_context_xml([item])
    assert f'id="{context_item_id(item, 1)}"' in xml
