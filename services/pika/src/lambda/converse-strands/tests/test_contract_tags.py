"""
CONTRACT TESTS: Tag definition fetching and prompt injection.

These tests are EXPECTED TO FAIL until tag definition support is implemented.

Observable behavior contracts:
  - When an agent has enabled tags configured, the instructions from those tags appear in
    the system prompt / context provided to the Strands agent.
  - Tags with status != 'enabled' must NOT contribute instructions to the prompt.
  - Tags explicitly disabled by the agent config must NOT contribute instructions.
  - When global tags are allowed (no disabled tags), global tag instructions are included.
  - When all tags are disabled, global tag instructions are excluded.
  - The tag-instruction content ultimately reaches the LLM as part of the agent context.
"""

import json
import pytest
from unittest.mock import MagicMock, patch


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _make_event(agent_id='agent-tags', session_id='sess-tags', message='Hello'):
    return {
        'body': json.dumps({
            'agentId': agent_id, 'userId': 'user-001',
            'sessionId': session_id, 'message': message,
        })
    }


def _make_session(agent_id='agent-tags', session_id='sess-tags', chat_app_id='app-001'):
    return {
        'session_id': session_id, 'last_update': None,
        'user_id': 'user-001', 'chat_app_id': chat_app_id, 'session_attributes': {},
    }


def _make_agent_def(agent_id='agent-tags', tags_enabled=None, tags_disabled=None):
    return {
        'agent_id': agent_id,
        'base_prompt': 'Be helpful.',
        'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'tool_ids': [],
        'tags_enabled': tags_enabled or [],
        'tags_disabled': tags_disabled or [],
    }


# ---------------------------------------------------------------------------
# Tests: enabled tag instructions reach the agent
# ---------------------------------------------------------------------------

class TestEnabledTagInstructionsReachAgent:
    """Contract: instructions from active tags must appear in the agent's system prompt/context."""

    def test_enabled_tag_instructions_appear_in_agent_system_prompt(self):
        """When an agent has enabled tags, their instruction text must be in the system prompt.

        Observable: the Strands Agent receives a system_prompt that includes the tag instructions,
        ensuring the LLM is aware of tag-specific guidance.
        """
        import handler as h  # noqa: PLC0415

        tag_defs = [
            {
                'tag': 'sales-focus', 'scope': 'global', 'status': 'enabled',
                'instructions': 'Always emphasize ROI and business value in your responses.',
            }
        ]

        captured_prompt = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_prompt['p'] = system_prompt
            inst = MagicMock()
            inst.return_value = 'ok'
            return inst

        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}}

        with (
            patch('handler.dynamodb', mock_ddb),
            patch('handler.add_message'),
            patch('handler.ensure_session', return_value=_make_session()),
            patch('handler.load_agent', return_value=_make_agent_def()),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.fetch_tag_definitions', return_value=tag_defs),
            patch('handler.Agent', side_effect=make_agent_spy),
        ):
            h.handler(_make_event(), _make_ctx())

        prompt = captured_prompt.get('p', '')
        assert 'Always emphasize ROI and business value' in prompt, (
            f'Tag instruction must appear in agent system_prompt. Got: {prompt[:500]!r}'
        )

    def test_multiple_tag_instructions_all_appear_in_system_prompt(self):
        """All enabled tag instructions must be present in the system prompt, not just the first.

        Observable: the agent has full awareness of all applicable tag guidance.
        """
        import handler as h  # noqa: PLC0415

        tag_defs = [
            {'tag': 'tone', 'scope': 'global', 'status': 'enabled',
             'instructions': 'Use a friendly, conversational tone.'},
            {'tag': 'compliance', 'scope': 'global', 'status': 'enabled',
             'instructions': 'Always include a disclaimer when discussing financial advice.'},
        ]

        captured_prompt = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_prompt['p'] = system_prompt
            inst = MagicMock()
            inst.return_value = 'ok'
            return inst

        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}}

        with (
            patch('handler.dynamodb', mock_ddb),
            patch('handler.add_message'),
            patch('handler.ensure_session', return_value=_make_session()),
            patch('handler.load_agent', return_value=_make_agent_def()),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.fetch_tag_definitions', return_value=tag_defs),
            patch('handler.Agent', side_effect=make_agent_spy),
        ):
            h.handler(_make_event(), _make_ctx())

        prompt = captured_prompt.get('p', '')
        assert 'friendly, conversational tone' in prompt, (
            f'First tag instruction must be in system prompt. Got: {prompt[:500]!r}'
        )
        assert 'disclaimer when discussing financial advice' in prompt, (
            f'Second tag instruction must also be in system prompt. Got: {prompt[:500]!r}'
        )


# ---------------------------------------------------------------------------
# Tests: non-enabled and disabled tags excluded
# ---------------------------------------------------------------------------

class TestDisabledTagsExcluded:
    """Contract: disabled or explicitly excluded tags must not add instructions to the prompt."""

    def test_draft_tag_instructions_do_not_appear_in_system_prompt(self):
        """Tags with status='draft' must NOT contribute instructions to the agent prompt.

        Observable: the LLM must not see instructions from tags that are not yet published/active.
        """
        import handler as h  # noqa: PLC0415

        tag_defs_from_api = [
            {'tag': 'active', 'scope': 'global', 'status': 'enabled',
             'instructions': 'Active tag instruction.'},
            {'tag': 'draft-tag', 'scope': 'global', 'status': 'draft',
             'instructions': 'Draft tag instruction — must not appear.'},
        ]

        captured_prompt = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_prompt['p'] = system_prompt
            inst = MagicMock()
            inst.return_value = 'ok'
            return inst

        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}}

        with (
            patch('handler.dynamodb', mock_ddb),
            patch('handler.add_message'),
            patch('handler.ensure_session', return_value=_make_session()),
            patch('handler.load_agent', return_value=_make_agent_def()),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.fetch_tag_definitions', return_value=tag_defs_from_api),
            patch('handler.Agent', side_effect=make_agent_spy),
        ):
            h.handler(_make_event(), _make_ctx())

        prompt = captured_prompt.get('p', '')
        assert 'Draft tag instruction' not in prompt, (
            f'Draft tag instructions must NOT appear in system prompt. Got: {prompt[:500]!r}'
        )
        assert 'Active tag instruction' in prompt, (
            'Active tag instructions must still be present.'
        )

    def test_explicitly_disabled_tag_instructions_do_not_appear_in_prompt(self):
        """Tags explicitly listed in the agent's tags_disabled must NOT contribute instructions.

        Observable: the agent admin has disabled a tag for this agent; its instructions must
        not reach the LLM.
        """
        import handler as h  # noqa: PLC0415

        # Simulate: API returns both tags, but 'marketing' is disabled for this agent
        tag_defs_from_api = [
            {'tag': 'support', 'scope': 'global', 'status': 'enabled',
             'instructions': 'Help users resolve issues.'},
            {'tag': 'marketing', 'scope': 'global', 'status': 'enabled',
             'instructions': 'Marketing tag — must not appear for this agent.'},
        ]

        agent_def = _make_agent_def(
            tags_disabled=[{'scope': 'global', 'tag': 'marketing'}]
        )

        captured_prompt = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_prompt['p'] = system_prompt
            inst = MagicMock()
            inst.return_value = 'ok'
            return inst

        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}}

        with (
            patch('handler.dynamodb', mock_ddb),
            patch('handler.add_message'),
            patch('handler.ensure_session', return_value=_make_session()),
            patch('handler.load_agent', return_value=agent_def),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.fetch_tag_definitions', return_value=tag_defs_from_api),
            patch('handler.Agent', side_effect=make_agent_spy),
        ):
            h.handler(_make_event(), _make_ctx())

        prompt = captured_prompt.get('p', '')
        assert 'Marketing tag' not in prompt, (
            f'Explicitly disabled tag must NOT appear in system prompt. Got: {prompt[:500]!r}'
        )
        assert 'Help users resolve issues' in prompt, (
            'Non-disabled tag instructions must still be present.'
        )

    def test_no_tags_leaves_base_prompt_unmodified(self):
        """When there are no tag definitions, the base prompt must be used without modification.

        Observable: empty tag configuration must not corrupt or truncate the base prompt.
        """
        import handler as h  # noqa: PLC0415

        captured_prompt = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_prompt['p'] = system_prompt
            inst = MagicMock()
            inst.return_value = 'ok'
            return inst

        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}}

        with (
            patch('handler.dynamodb', mock_ddb),
            patch('handler.add_message'),
            patch('handler.ensure_session', return_value=_make_session()),
            patch('handler.load_agent', return_value=_make_agent_def()),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.fetch_tag_definitions', return_value=[]),
            patch('handler.Agent', side_effect=make_agent_spy),
        ):
            h.handler(_make_event(), _make_ctx())

        prompt = captured_prompt.get('p', '')
        assert 'Be helpful.' in prompt, (
            f'Base prompt must be present when no tags are configured. Got: {prompt[:500]!r}'
        )
