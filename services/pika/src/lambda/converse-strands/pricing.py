"""Token usage extraction and cost calculation.

Reads token counts from Strands AgentResult.metrics.accumulated_usage
(or MultiAgentResult.accumulated_usage for Swarm) — no manual trace parsing.

With prompt caching enabled (CacheConfig(strategy="auto")), Bedrock reports:
  - inputTokens: non-cached input tokens (billed at full input rate)
  - cacheReadInputTokens: tokens served from cache (billed at ~10% of input rate)
  - cacheWriteInputTokens: tokens written to cache (billed at ~125% of input rate)
  - outputTokens: output tokens (billed at full output rate)

The `inputTokens` field alone may be very low (e.g. 27) when caching is effective.
Always check cacheReadInputTokens for the full picture.
"""
import os
from decimal import Decimal

# Model pricing per 1000 tokens.
# Cache read is ~10% of input price; cache write is ~125% of input price.
MODEL_PRICING = {
    'us.anthropic.claude-sonnet-4-5-20250929-v1:0': {
        'inputPer1000Tokens': 0.003,
        'outputPer1000Tokens': 0.015,
        'cacheReadPer1000Tokens': 0.0003,
        'cacheWritePer1000Tokens': 0.00375,
    },
    'us.anthropic.claude-sonnet-4-20250514-v1:0': {
        'inputPer1000Tokens': 0.003,
        'outputPer1000Tokens': 0.015,
        'cacheReadPer1000Tokens': 0.0003,
        'cacheWritePer1000Tokens': 0.00375,
    },
    'anthropic.claude-haiku-4-5-20251001-v1:0': {
        'inputPer1000Tokens': 0.0008,
        'outputPer1000Tokens': 0.004,
        'cacheReadPer1000Tokens': 0.00008,
        'cacheWritePer1000Tokens': 0.001,
    },
    'default': {
        'inputPer1000Tokens': 0.003,
        'outputPer1000Tokens': 0.015,
        'cacheReadPer1000Tokens': 0.0003,
        'cacheWritePer1000Tokens': 0.00375,
    },
}


def _get_accumulated_usage(result) -> dict:
    """Extract the raw accumulated_usage dict from a Strands result.

    Works with both AgentResult (result.metrics.accumulated_usage)
    and MultiAgentResult/SwarmResult (result.accumulated_usage).
    """
    try:
        usage = None
        if hasattr(result, 'metrics') and result.metrics is not None:
            usage = getattr(result.metrics, 'accumulated_usage', None)
        if not isinstance(usage, dict) and hasattr(result, 'accumulated_usage'):
            usage = result.accumulated_usage
        return usage if isinstance(usage, dict) else {}
    except Exception:
        return {}


def extract_usage_from_result(result) -> tuple[int, int]:
    """Extract (input_tokens, output_tokens) from a Strands result.

    Works with both AgentResult (result.metrics.accumulated_usage)
    and MultiAgentResult (result.accumulated_usage).

    Note: With prompt caching, inputTokens only counts non-cached tokens.
    Use extract_full_usage() for the complete picture including cache tokens.
    """
    usage = _get_accumulated_usage(result)
    if not usage:
        return 0, 0
    return usage.get('inputTokens', 0), usage.get('outputTokens', 0)


def extract_full_usage(result) -> dict:
    """Extract the complete usage breakdown including cache tokens.

    Returns a dict with keys:
      inputTokens, outputTokens, totalTokens,
      cacheReadInputTokens (optional), cacheWriteInputTokens (optional)

    Always returns a dict. Callers use .get() on the result, so returning a
    non-dict (e.g. if the Strands SDK changes shape) would AttributeError
    deep inside the handler.
    """
    usage = _get_accumulated_usage(result)
    return usage if isinstance(usage, dict) else {}


def calculate_usage(input_tokens: int, output_tokens: int, model_id: str,
                    cache_read_tokens: int = 0, cache_write_tokens: int = 0) -> dict:
    """Calculate cost from token counts and return a usage dict.

    Cost values are Decimal for DynamoDB compatibility (DDB rejects float).

    With prompt caching:
      - input_tokens: non-cached input tokens (full input rate)
      - cache_read_tokens: tokens from cache (~10% of input rate)
      - cache_write_tokens: tokens written to cache (~125% of input rate)
    """
    pricing = MODEL_PRICING.get(model_id, MODEL_PRICING['default'])

    input_cost = Decimal(str(pricing['inputPer1000Tokens'])) * Decimal(str(input_tokens)) / Decimal('1000')
    output_cost = Decimal(str(pricing['outputPer1000Tokens'])) * Decimal(str(output_tokens)) / Decimal('1000')

    cache_read_cost = Decimal('0')
    cache_write_cost = Decimal('0')
    if cache_read_tokens > 0:
        cache_read_cost = Decimal(str(pricing.get('cacheReadPer1000Tokens', 0.0003))) * Decimal(str(cache_read_tokens)) / Decimal('1000')
    if cache_write_tokens > 0:
        cache_write_cost = Decimal(str(pricing.get('cacheWritePer1000Tokens', 0.00375))) * Decimal(str(cache_write_tokens)) / Decimal('1000')

    # Total input cost includes non-cached + cache read + cache write
    total_input_cost = input_cost + cache_read_cost + cache_write_cost

    result = {
        'inputTokens': input_tokens,
        'outputTokens': output_tokens,
        'totalTokens': input_tokens + output_tokens + cache_read_tokens + cache_write_tokens,
        'inputCost': total_input_cost,
        'outputCost': output_cost,
        'totalCost': total_input_cost + output_cost,
    }

    # Include cache breakdown when present
    if cache_read_tokens > 0:
        result['cacheReadInputTokens'] = cache_read_tokens
        result['cacheReadCost'] = cache_read_cost
    if cache_write_tokens > 0:
        result['cacheWriteInputTokens'] = cache_write_tokens
        result['cacheWriteCost'] = cache_write_cost

    return result
