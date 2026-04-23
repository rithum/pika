"""
CONTRACT TESTS: Response verification and auto-reprompt for the Strands converse Lambda.

These tests are EXPECTED TO FAIL until verification support is implemented.

Verification contract (mirrors TypeScript bedrock-agent.ts invokeAgentToVerifyAnswer()):
  - Invokes a separate classification agent with the system prompt for A/B/C/F/U grading
  - Input message: 'Classify your previous response'
  - Response parsed from <answer>{"classification": "C", "explanation": "..."}</answer> XML tag
  - Auto-reprompt triggered when classification >= autoRepromptThreshold AND reprompt != null

Classification levels (exact strings):
  "A" = Accurate                          → no reprompt
  "B" = AccurateWithStatedAssumptions     → reprompt: "The previous response had assumptions that were
                                             stated. Specify the assumptions you made."
  "C" = AccurateWithUnstatedAssumptions   → reprompt: "The previous response had assumptions that were
                                             not specified. Specify the assumptions you made."
  "F" = Inaccurate                        → reprompt: "The previous response is not factually correct.
                                             Fix it with factually correct information."
  "U" = Unclassified                      → no reprompt

Reprompt message format: '{repromptText}\\n\\nReason: {explanation}'

DDB storage: message.verifications = { main: classification, correction?: classification }
"""

import json
import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Tests: parse_verification_response() — XML extraction
# ---------------------------------------------------------------------------

class TestParseVerificationResponse:
    """Contract for parsing classification XML from verification agent response."""

    def test_parses_classification_and_explanation_from_answer_tag(self):
        """Must extract classification and explanation from <answer>JSON</answer> XML tag.

        Contract ref: bedrock-agent.ts — response parsed from <answer>...</answer>
        """
        from verification import parse_verification_response  # noqa: PLC0415

        raw = 'After reviewing: <answer>{"classification": "C", "explanation": "Missing assumptions."}</answer>'
        result = parse_verification_response(raw)

        assert result['classification'] == 'C'
        assert result['explanation'] == 'Missing assumptions.'

    def test_returns_unclassified_when_no_answer_tag(self):
        """Must return classification='U' (Unclassified) when response has no <answer> tag.

        Contract ref: bedrock-agent.ts — defaults to Unclassified when parse fails
        """
        from verification import parse_verification_response  # noqa: PLC0415

        result = parse_verification_response('I cannot classify this response.')

        assert result.get('classification') == 'U', (
            f'Missing <answer> tag must return Unclassified. Got: {result}'
        )

    def test_all_valid_classification_values_accepted(self):
        """Must accept A, B, C, F, and U as valid classification values.

        Contract ref: bedrock-agent.ts VerifyResponseClassification enum
        """
        from verification import parse_verification_response  # noqa: PLC0415

        for cls in ['A', 'B', 'C', 'F', 'U']:
            raw = f'<answer>{{"classification": "{cls}", "explanation": "test"}}</answer>'
            result = parse_verification_response(raw)
            assert result['classification'] == cls, (
                f'Classification "{cls}" must be accepted. Got: {result}'
            )


# ---------------------------------------------------------------------------
# Tests: get_reprompt_for_classification() — reprompt text lookup
# ---------------------------------------------------------------------------

class TestGetRepromptForClassification:
    """Contract: reprompt text for each classification level."""

    def test_classification_a_has_no_reprompt(self):
        """Classification 'A' (Accurate) must return None/empty — no reprompt needed.

        Contract ref: bedrock-agent.ts VerifyResponseClassification.Accurate → no reprompt
        """
        from verification import get_reprompt_for_classification  # noqa: PLC0415

        result = get_reprompt_for_classification('A')
        assert not result, f'Classification A must have no reprompt. Got: {result!r}'

    def test_classification_u_has_no_reprompt(self):
        """Classification 'U' (Unclassified) must return None/empty — no reprompt.

        Contract ref: bedrock-agent.ts VerifyResponseClassification.Unclassified → no reprompt
        """
        from verification import get_reprompt_for_classification  # noqa: PLC0415

        result = get_reprompt_for_classification('U')
        assert not result, f'Classification U must have no reprompt. Got: {result!r}'

    def test_classification_b_reprompt_about_stated_assumptions(self):
        """Classification 'B' reprompt must mention stated assumptions.

        Contract ref: bedrock-agent.ts AccurateWithStatedAssumptions reprompt text
        """
        from verification import get_reprompt_for_classification  # noqa: PLC0415

        result = get_reprompt_for_classification('B')
        assert result, 'Classification B must have a reprompt message'
        assert 'assumptions' in result.lower(), (
            f'Classification B reprompt must mention assumptions. Got: {result!r}'
        )
        assert 'stated' in result.lower(), (
            f'Classification B reprompt must mention "stated". Got: {result!r}'
        )

    def test_classification_c_reprompt_about_unstated_assumptions(self):
        """Classification 'C' reprompt must mention unstated/unspecified assumptions.

        Contract ref: bedrock-agent.ts AccurateWithUnstatedAssumptions reprompt text
        """
        from verification import get_reprompt_for_classification  # noqa: PLC0415

        result = get_reprompt_for_classification('C')
        assert result, 'Classification C must have a reprompt message'
        assert 'assumptions' in result.lower(), (
            f'Classification C reprompt must mention assumptions. Got: {result!r}'
        )
        assert 'not' in result.lower() or 'unstated' in result.lower() or 'unspecified' in result.lower(), (
            f'Classification C reprompt must distinguish from B (unstated). Got: {result!r}'
        )

    def test_classification_f_reprompt_about_factual_correctness(self):
        """Classification 'F' reprompt must mention factual correctness.

        Contract ref: bedrock-agent.ts Inaccurate reprompt:
            "The previous response is not factually correct. Fix it with factually correct information."
        """
        from verification import get_reprompt_for_classification  # noqa: PLC0415

        result = get_reprompt_for_classification('F')
        assert result, 'Classification F must have a reprompt message'
        assert 'factual' in result.lower() or 'correct' in result.lower(), (
            f'Classification F reprompt must mention factual correctness. Got: {result!r}'
        )


# ---------------------------------------------------------------------------
# Tests: build_reprompt_message() — format with explanation
# ---------------------------------------------------------------------------

class TestBuildRepromptMessage:
    """Contract: reprompt message format appends explanation."""

    def test_reprompt_message_appends_reason_with_explanation(self):
        """Reprompt message must be formatted as '{repromptText}\\n\\nReason: {explanation}'.

        Contract ref: bedrock-agent.ts repromptText + '\\n\\nReason: ' + explanation
        """
        from verification import build_reprompt_message  # noqa: PLC0415

        base_text = 'The previous response is not factually correct. Fix it.'
        explanation = 'The date mentioned was wrong.'
        result = build_reprompt_message(base_text, explanation)

        expected = f'{base_text}\n\nReason: {explanation}'
        assert result == expected, (
            f'Reprompt message must be "{{base}}\\n\\nReason: {{explanation}}". Got: {result!r}'
        )


# ---------------------------------------------------------------------------
# Tests: verifications field on DDB message
# ---------------------------------------------------------------------------

class TestVerificationsStorage:
    """Contract: verifications field stored on ChatMessage in DynamoDB."""

    def test_verifications_main_always_stored_on_message(self):
        """verifications.main must always be stored on the assistant message in DDB.

        Contract ref: bedrock-agent.ts verifications: { main: ..., correction?: ... }
            verifications.main is always present (defaults to Unclassified if parse fails).
        """
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-verify',
                'userId': 'user-001',
                'sessionId': 'sess-001',
                'message': 'Is the sky blue?',
            })
        }

        mock_ddb = MagicMock()
        ctx = MagicMock()
        ctx.get_remaining_time_in_millis.return_value = 300_000

        stored_messages = []

        def capture_put_item(**kwargs):
            stored_messages.append(kwargs.get('Item', {}))
            return {}

        mock_ddb.Table.return_value.put_item.side_effect = capture_put_item

        agent_def = {
            'agent_id': 'agent-verify',
            'base_prompt': 'Be helpful.',
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'tool_ids': [],
            'verification': {'enabled': True},
        }

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='Yes, the sky is blue.'))),
            patch('handler.load_agent', return_value=agent_def),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.verify_response', return_value={'classification': 'A', 'explanation': 'Accurate.'}),
        ):
            result = h.handler(event, ctx)

        assert result['statusCode'] == 200

        # Find the assistant message in stored items
        assistant_msgs = [m for m in stored_messages if m.get('source') == 'assistant']
        assert len(assistant_msgs) >= 1, f'Assistant message must be stored. All stored: {stored_messages}'

        asst_msg = assistant_msgs[-1]
        assert 'verifications' in asst_msg, (
            f'verifications field must be present on assistant message. Got keys: {list(asst_msg.keys())}'
        )
        assert 'main' in asst_msg['verifications'], (
            f'verifications.main must always be set. Got: {asst_msg["verifications"]}'
        )

    def test_verifications_correction_absent_when_no_reprompt(self):
        """verifications.correction must be absent when classification is A (no reprompt triggered).

        Contract ref: bedrock-agent.ts — correction only present when auto-reprompt was triggered.
        """
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-verify',
                'userId': 'user-001',
                'sessionId': 'sess-001',
                'message': 'Tell me about Python.',
            })
        }

        mock_ddb = MagicMock()
        ctx = MagicMock()
        ctx.get_remaining_time_in_millis.return_value = 300_000

        stored_messages = []
        mock_ddb.Table.return_value.put_item.side_effect = lambda **kw: stored_messages.append(kw.get('Item', {}))

        agent_def = {
            'agent_id': 'agent-verify',
            'base_prompt': 'Be helpful.',
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'tool_ids': [],
            'verification': {'enabled': True},
        }

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='Python is a language.'))),
            patch('handler.load_agent', return_value=agent_def),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            # Classification A → no reprompt
            patch('handler.verify_response', return_value={'classification': 'A', 'explanation': 'Accurate.'}),
        ):
            result = h.handler(event, ctx)

        assert result['statusCode'] == 200
        assistant_msgs = [m for m in stored_messages if m.get('source') == 'assistant']
        assert len(assistant_msgs) >= 1

        verifications = assistant_msgs[-1].get('verifications', {})
        assert 'correction' not in verifications, (
            f'verifications.correction must be absent for classification A. Got: {verifications}'
        )
