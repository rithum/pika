from decimal import Decimal

from pricing import MODEL_PRICING, calculate_usage

HAIKU_4_5 = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'


def test_haiku_4_5_is_priced_under_its_us_model_id():
    usage = calculate_usage(1000, 1000, HAIKU_4_5, cache_read_tokens=1000, cache_write_tokens=1000)
    assert usage['cacheReadCost'] == Decimal('0.0001')
    assert usage['cacheWriteCost'] == Decimal('0.00125')
    assert usage['inputCost'] == Decimal('0.001') + Decimal('0.0001') + Decimal('0.00125')
    assert usage['outputCost'] == Decimal('0.005')


def test_haiku_4_5_input_rate_without_cache():
    usage = calculate_usage(1000, 0, HAIKU_4_5)
    assert usage['inputCost'] == Decimal('0.001')


def test_bare_haiku_4_5_key_is_not_priced():
    assert 'anthropic.claude-haiku-4-5-20251001-v1:0' not in MODEL_PRICING
