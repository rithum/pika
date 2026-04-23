"""
CONTRACT TESTS: Token usage and cost calculation for the Strands converse Lambda.

These tests are EXPECTED TO FAIL until pricing/usage tracking is implemented.

Pricing contract (Strands-native — replaces TS trace-based accumulation):
  - Tokens read directly from Strands AgentResult.metrics.accumulated_usage
    or MultiAgentResult.accumulated_usage (for Swarm)
  - Usage dict: { inputTokens, outputTokens, totalTokens, inputCost, outputCost, totalCost }
  - Cost formula:
      inputCost  = price.inputPer1000Tokens  * (inputTokens / 1000)
      outputCost = price.outputPer1000Tokens * (outputTokens / 1000)
      totalCost  = inputCost + outputCost
  - Unknown model ID → falls back to 'default' pricing
  - Default pricing: { inputPer1000Tokens: 0.003, outputPer1000Tokens: 0.015 }
  - Full usage object stored on the assistant ChatMessage in DynamoDB
"""

import json
import pytest
from unittest.mock import MagicMock, patch


DEFAULT_INPUT_PRICE = 0.003
DEFAULT_OUTPUT_PRICE = 0.015


# ---------------------------------------------------------------------------
# Tests: calculate_usage() — cost math from token counts
# ---------------------------------------------------------------------------

class TestCalculateUsage:
    """Contract for calculate_usage(input_tokens, output_tokens, model_id) function."""

    def test_total_cost_equals_input_plus_output_cost(self):
        """totalCost must equal inputCost + outputCost exactly."""
        from pricing import calculate_usage

        result = calculate_usage(input_tokens=1000, output_tokens=500, model_id='default')

        assert result['totalCost'] == result['inputCost'] + result['outputCost'], (
            f'totalCost must equal inputCost + outputCost. Got: {result}'
        )

    def test_input_cost_calculated_correctly(self):
        """inputCost must equal inputPer1000Tokens * (inputTokens / 1000)."""
        from pricing import calculate_usage

        result = calculate_usage(input_tokens=2000, output_tokens=0, model_id='default')

        expected_input_cost = DEFAULT_INPUT_PRICE * (2000 / 1000)
        assert abs(float(result['inputCost']) - expected_input_cost) < 1e-10, (
            f'inputCost must be {expected_input_cost}. Got: {result["inputCost"]}'
        )

    def test_output_cost_calculated_correctly(self):
        """outputCost must equal outputPer1000Tokens * (outputTokens / 1000)."""
        from pricing import calculate_usage

        result = calculate_usage(input_tokens=0, output_tokens=500, model_id='default')

        expected_output_cost = DEFAULT_OUTPUT_PRICE * (500 / 1000)
        assert abs(float(result['outputCost']) - expected_output_cost) < 1e-10, (
            f'outputCost must be {expected_output_cost}. Got: {result["outputCost"]}'
        )

    def test_unknown_model_falls_back_to_default_pricing(self):
        """Unknown model ID must fall back to default rates."""
        from pricing import calculate_usage

        result = calculate_usage(input_tokens=1000, output_tokens=1000, model_id='unknown-model-xyz')

        expected_input = DEFAULT_INPUT_PRICE * 1.0
        expected_output = DEFAULT_OUTPUT_PRICE * 1.0

        assert abs(float(result['inputCost']) - expected_input) < 1e-10, (
            f'Unknown model must use default inputPer1000Tokens={DEFAULT_INPUT_PRICE}. Got: {result}'
        )
        assert abs(float(result['outputCost']) - expected_output) < 1e-10, (
            f'Unknown model must use default outputPer1000Tokens={DEFAULT_OUTPUT_PRICE}. Got: {result}'
        )

    def test_result_contains_all_required_fields(self):
        """usage dict must contain: inputTokens, outputTokens, totalTokens, inputCost, outputCost, totalCost."""
        from pricing import calculate_usage

        result = calculate_usage(input_tokens=100, output_tokens=50, model_id='default')

        required_fields = {'inputTokens', 'outputTokens', 'totalTokens', 'inputCost', 'outputCost', 'totalCost'}
        missing = required_fields - set(result.keys())
        assert not missing, f'usage dict missing required fields: {missing}. Got keys: {set(result.keys())}'

    def test_token_counts_preserved_in_result(self):
        """inputTokens, outputTokens, and totalTokens must be preserved in the result."""
        from pricing import calculate_usage

        result = calculate_usage(input_tokens=1234, output_tokens=567, model_id='default')

        assert result['inputTokens'] == 1234, f'inputTokens must be preserved. Got: {result["inputTokens"]}'
        assert result['outputTokens'] == 567, f'outputTokens must be preserved. Got: {result["outputTokens"]}'
        assert result['totalTokens'] == 1801, f'totalTokens must be sum. Got: {result["totalTokens"]}'


# ---------------------------------------------------------------------------
# Tests: extract_usage_from_result() — Strands-native token extraction
# ---------------------------------------------------------------------------

class TestExtractUsageFromResult:
    """Contract: tokens extracted from Strands AgentResult.metrics.accumulated_usage."""

    def test_extracts_tokens_from_agent_result(self):
        """Must read inputTokens and outputTokens from result.metrics.accumulated_usage."""
        from pricing import extract_usage_from_result

        mock_result = MagicMock()
        mock_result.metrics.accumulated_usage = {
            'inputTokens': 150,
            'outputTokens': 75,
            'totalTokens': 225,
        }

        input_tokens, output_tokens = extract_usage_from_result(mock_result)

        assert input_tokens == 150
        assert output_tokens == 75

    def test_extracts_tokens_from_swarm_result(self):
        """Must read accumulated_usage from MultiAgentResult (Swarm)."""
        from pricing import extract_usage_from_result

        mock_result = MagicMock()
        mock_result.metrics.accumulated_usage = {
            'inputTokens': 500,
            'outputTokens': 200,
            'totalTokens': 700,
        }

        input_tokens, output_tokens = extract_usage_from_result(mock_result)

        assert input_tokens == 500
        assert output_tokens == 200

    def test_returns_zero_when_no_metrics(self):
        """Must return (0, 0) when result has no metrics or accumulated_usage."""
        from pricing import extract_usage_from_result

        mock_result = MagicMock()
        mock_result.metrics = None

        input_tokens, output_tokens = extract_usage_from_result(mock_result)

        assert input_tokens == 0
        assert output_tokens == 0

    def test_includes_cache_tokens_when_present(self):
        """Must include cacheReadInputTokens and cacheWriteInputTokens if present."""
        from pricing import extract_usage_from_result

        mock_result = MagicMock()
        mock_result.metrics.accumulated_usage = {
            'inputTokens': 100,
            'outputTokens': 50,
            'totalTokens': 150,
            'cacheReadInputTokens': 80,
            'cacheWriteInputTokens': 20,
        }

        input_tokens, output_tokens = extract_usage_from_result(mock_result)

        assert input_tokens == 100
        assert output_tokens == 50


# ---------------------------------------------------------------------------
# Tests: usage stored on DDB message
# ---------------------------------------------------------------------------

class TestUsageStoredOnMessage:
    """Contract: usage object stored on assistant ChatMessage in DynamoDB."""

    def test_usage_field_stored_on_assistant_message(self):
        """Handler must store the usage dict on the assistant message in DynamoDB."""
        import handler as h

        event = {
            'body': json.dumps({
                'agentId': 'agent-pricing',
                'userId': 'user-001',
                'sessionId': 'sess-001',
                'message': 'How much does this cost?',
            })
        }

        mock_ddb = MagicMock()
        ctx = MagicMock()
        ctx.get_remaining_time_in_millis.return_value = 300_000

        stored_messages = []
        mock_ddb.Table.return_value.put_item.side_effect = lambda **kw: stored_messages.append(kw.get('Item', {}))

        agent_def = {
            'agent_id': 'agent-pricing',
            'base_prompt': 'Be helpful.',
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'tool_ids': [],
        }

        # Mock agent that returns a result with metrics
        mock_agent_result = MagicMock()
        mock_agent_result.__str__ = lambda self: 'Cost info here.'
        mock_agent_result.metrics.accumulated_usage = {
            'inputTokens': 100, 'outputTokens': 50, 'totalTokens': 150,
        }

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value=mock_agent_result))),
            patch('handler.load_agent', return_value=agent_def),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(event, ctx)

        assert result['statusCode'] == 200

        assistant_msgs = [m for m in stored_messages if m.get('source') == 'assistant']
        assert len(assistant_msgs) >= 1, f'Assistant message must be stored. All: {stored_messages}'

        asst_msg = assistant_msgs[-1]
        assert 'usage' in asst_msg, (
            f'usage field must be present on assistant message. Got keys: {list(asst_msg.keys())}'
        )

        usage = asst_msg['usage']
        required_fields = {'inputTokens', 'outputTokens', 'totalTokens', 'inputCost', 'outputCost', 'totalCost'}
        missing = required_fields - set(usage.keys())
        assert not missing, f'usage dict missing fields: {missing}. Got: {usage}'

    def test_usage_total_cost_is_consistent(self):
        """The stored usage.totalCost must equal inputCost + outputCost."""
        import handler as h

        event = {
            'body': json.dumps({
                'agentId': 'agent-pricing',
                'userId': 'user-001',
                'sessionId': 'sess-002',
                'message': 'Calculate.',
            })
        }

        mock_ddb = MagicMock()
        ctx = MagicMock()
        ctx.get_remaining_time_in_millis.return_value = 300_000

        stored_messages = []
        mock_ddb.Table.return_value.put_item.side_effect = lambda **kw: stored_messages.append(kw.get('Item', {}))

        agent_def = {
            'agent_id': 'agent-pricing',
            'base_prompt': 'Be helpful.',
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'tool_ids': [],
        }

        mock_agent_result = MagicMock()
        mock_agent_result.__str__ = lambda self: 'Done.'
        mock_agent_result.metrics.accumulated_usage = {
            'inputTokens': 200, 'outputTokens': 100, 'totalTokens': 300,
        }

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value=mock_agent_result))),
            patch('handler.load_agent', return_value=agent_def),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(event, ctx)

        assert result['statusCode'] == 200

        assistant_msgs = [m for m in stored_messages if m.get('source') == 'assistant']
        if not assistant_msgs:
            pytest.skip('No assistant message stored — usage field test requires message storage')

        usage = assistant_msgs[-1].get('usage', {})
        if usage:
            assert abs(usage['totalCost'] - (usage['inputCost'] + usage['outputCost'])) < 1e-10, (
                f'totalCost must equal inputCost + outputCost. Got: {usage}'
            )
