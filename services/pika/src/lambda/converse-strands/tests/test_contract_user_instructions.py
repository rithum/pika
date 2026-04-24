"""
CONTRACT TESTS: Global user instruction prepending.

These tests are EXPECTED TO FAIL until user instruction support is implemented.

Observable behavior contracts:
  - When a user has a global instruction stored (user.features.instruction.instruction),
    that text must appear at the BEGINNING of the message sent to the LLM on every request.
  - The separator between the instruction and the rest of the message is '\\n\\n'.
  - User instructions must be applied on every invocation, not only the first message.
  - When the user has no instruction set, the message is unchanged.
  - Instruction appears BEFORE directive instructions in the message ordering.
"""

import json
import time
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _ts(ms_ago: int) -> str:
    ts = (time.time() * 1000 - ms_ago) / 1000
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _make_agent_def():
    return {
        'agent_id': 'agent-001', 'base_prompt': 'Be helpful.',
        'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'tool_ids': [],
    }


def _standard_patches(user_record=None, messages=None, agent_instance=None):
    """Return patches covering all handler DDB/external calls."""
    mock_ddb = MagicMock()
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}}

    if agent_instance is None:
        agent_instance = MagicMock()
        agent_instance.return_value = 'ok'

    return (
        patch('handler.dynamodb', mock_ddb),
        patch('handler.Agent', MagicMock(return_value=agent_instance)),
        patch('handler.load_agent', return_value=_make_agent_def()),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
        patch('handler.get_user', return_value=user_record or {'user_id': 'user-001', 'custom_data': {}}),
        patch('handler.get_messages', return_value=messages or []),
        patch('handler.add_message'),
        patch('handler.ensure_session'),
        agent_instance,  # Return the instance so tests can inspect calls
    )


# ---------------------------------------------------------------------------
# Tests: instruction appears at start of message on live path
# ---------------------------------------------------------------------------

class TestUserInstructionLivePath:
    """Contract: user instruction must be the first content in the message on every request."""

    def test_user_instruction_is_first_content_in_prompt(self):
        """User global instruction must appear at the START of the message sent to the LLM."""
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-instr', 'message': 'What is the capital of France?',
            })
        }

        patches = _standard_patches(
            user_record={
                'user_id': 'user-001',
                'features': {'instruction': {'instruction': 'Always respond in French.'}},
                'custom_data': {},
            },
        )
        p0, p1, p2, p3, p4, p5, p6, p7, p8, agent_inst = patches
        with p0, p1, p2, p3, p4, p5, p6, p7, p8:
            h.handler(event, _make_ctx())

        # The agent instance is called with the message — check args[0]
        agent_inst.assert_called_once()
        prompt = agent_inst.call_args.args[0] if agent_inst.call_args.args else ''
        assert prompt.startswith('Always respond in French.'), (
            f'User instruction must be the FIRST content in the prompt. '
            f'Got start: {prompt[:100]!r}'
        )
        assert 'What is the capital of France?' in prompt, (
            'Original user message must also be present in the prompt.'
        )

    def test_user_instruction_separated_from_message_by_double_newline(self):
        """The instruction and the user message must be separated by '\\n\\n'."""
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-sep', 'message': 'Hello there',
            })
        }

        patches = _standard_patches(
            user_record={
                'user_id': 'user-001',
                'features': {'instruction': {'instruction': 'Be brief.'}},
                'custom_data': {},
            },
        )
        p0, p1, p2, p3, p4, p5, p6, p7, p8, agent_inst = patches
        with p0, p1, p2, p3, p4, p5, p6, p7, p8:
            h.handler(event, _make_ctx())

        prompt = agent_inst.call_args.args[0] if agent_inst.call_args.args else ''
        assert 'Be brief.\n\n' in prompt, (
            f'Instruction and message must be separated by \\n\\n. Got: {prompt[:100]!r}'
        )

    def test_no_instruction_does_not_modify_prompt(self):
        """When user has no instruction, the message is sent unmodified."""
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-no-instr', 'message': 'PLAIN_MESSAGE',
            })
        }

        patches = _standard_patches(
            user_record={
                'user_id': 'user-001',
                'features': {},  # no instruction
                'custom_data': {},
            },
        )
        p0, p1, p2, p3, p4, p5, p6, p7, p8, agent_inst = patches
        with p0, p1, p2, p3, p4, p5, p6, p7, p8:
            h.handler(event, _make_ctx())

        prompt = agent_inst.call_args.args[0] if agent_inst.call_args.args else ''
        assert 'PLAIN_MESSAGE' in prompt, 'Message must still be in the prompt'
        assert not prompt.startswith('\n'), (
            f'Prompt must not start with newlines when no instruction. Got: {prompt[:50]!r}'
        )

    def test_instruction_applied_on_every_invocation(self):
        """User instruction must be applied on every invocation, not only the first message."""
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-multi', 'message': 'Follow-up question',
            })
        }

        patches = _standard_patches(
            user_record={
                'user_id': 'user-001',
                'features': {'instruction': {'instruction': 'Always be concise.'}},
                'custom_data': {},
            },
            messages=[
                {'user_id': 'user-001', 'session_id': 'sess-multi', 'message_id': 'sess-multi:1',
                 'message': 'Previous question', 'source': 'user', 'timestamp': 1000},
                {'user_id': 'user-001', 'session_id': 'sess-multi', 'message_id': 'sess-multi:2',
                 'message': 'Previous answer', 'source': 'assistant', 'timestamp': 2000},
            ],
        )
        p0, p1, p2, p3, p4, p5, p6, p7, p8, agent_inst = patches
        with p0, p1, p2, p3, p4, p5, p6, p7, p8:
            h.handler(event, _make_ctx())

        prompt = agent_inst.call_args.args[0] if agent_inst.call_args.args else ''
        assert 'Always be concise.' in prompt, (
            f'User instruction must appear in the prompt on every invocation. Got: {prompt[:200]!r}'
        )

    def test_instruction_appears_before_directive_instructions(self):
        """User instruction must appear BEFORE any directive instructions in the message."""
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-order', 'message': 'Query data',
            })
        }

        patches = _standard_patches(
            user_record={
                'user_id': 'user-001',
                'features': {'instruction': {'instruction': 'USER_INSTRUCTION_MARKER'}},
                'custom_data': {},
            },
        )
        p0, p1, p2, p3, p4, p5, p6, p7, p8, agent_inst = patches
        with p0, p1, p2, p3, p4, p5, p6, p7, p8:
            h.handler(event, _make_ctx())

        prompt = agent_inst.call_args.args[0] if agent_inst.call_args.args else ''
        assert 'USER_INSTRUCTION_MARKER' in prompt, (
            f'User instruction must be in the prompt. Got: {prompt[:200]!r}'
        )
        # If directives are also present, instruction must come first
        # (This test validates ordering — directives are a separate feature)
        instr_pos = prompt.find('USER_INSTRUCTION_MARKER')
        assert instr_pos == 0 or prompt[:instr_pos].strip() == '', (
            f'User instruction must be at the start of the prompt (before directives). '
            f'Found at position {instr_pos}: {prompt[:100]!r}'
        )


class TestUserInstructionExpiredPath:
    """Contract: user instruction available in context after session reattachment."""

    def test_user_instruction_in_history_context_after_reattach(self):
        """After session reattach, user instruction must be available in the agent's context."""
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-reattach', 'message': 'Continue our conversation',
            })
        }

        patches = _standard_patches(
            user_record={
                'user_id': 'user-001',
                'features': {'instruction': {'instruction': 'REATTACH_INSTRUCTION_MARKER'}},
                'custom_data': {},
            },
            messages=[
                {'user_id': 'user-001', 'session_id': 'sess-reattach', 'message_id': 'sess-reattach:1',
                 'message': 'Initial question', 'source': 'user', 'timestamp': 1000},
                {'user_id': 'user-001', 'session_id': 'sess-reattach', 'message_id': 'sess-reattach:2',
                 'message': 'Initial answer', 'source': 'assistant', 'timestamp': 2000},
            ],
        )
        p0, p1, p2, p3, p4, p5, p6, p7, p8, agent_inst = patches
        with p0, p1, p2, p3, p4, p5, p6, p7, p8:
            h.handler(event, _make_ctx())

        prompt = agent_inst.call_args.args[0] if agent_inst.call_args.args else ''
        assert 'REATTACH_INSTRUCTION_MARKER' in prompt, (
            f'User instruction must be present in the agent context after reattach. '
            f'Got prompt: {prompt[:300]!r}'
        )
