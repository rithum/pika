"""
CONTRACT TESTS: User memory (Bedrock AgentCore) as agent tools for the Strands converse Lambda.

These tests are EXPECTED TO FAIL until user memory support is implemented.

Memory contract (agent-as-tool approach):
  - When memory_feature.enabled=True and memory_id is present, the Agent receives memory tools
    in its tool list (tools with names containing 'memory')
  - Memory tools are NOT added when memory_feature.enabled=False
  - Memory tools are NOT added when memory_id is absent
  - When memory tools are added, the system prompt includes an instruction telling the agent
    to check memory for relevant context from past conversations
  - Memory tools are added alongside (not instead of) any other configured tools

Implementation note: tests are agnostic to HOW memory tools are created
(AgentCoreMemoryToolProvider, PythonAgentTool, etc.) — only WHAT the agent receives matters.
"""

import json
import pytest
from unittest.mock import MagicMock, patch


MOCK_AGENT_DEF = {
    'agent_id': 'agent-memory',
    'base_prompt': 'Be helpful.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': [],
    'memory_feature': {
        'enabled': True,
        'memory_id': 'mem-001',
    },
}

MOCK_AGENT_DEF_DISABLED = {
    **MOCK_AGENT_DEF,
    'memory_feature': {
        'enabled': False,
        'memory_id': 'mem-001',
    },
}

MOCK_AGENT_DEF_NO_MEMORY_ID = {
    **MOCK_AGENT_DEF,
    'memory_feature': {
        'enabled': True,
        # no memory_id
    },
}


def _make_event(session_id='sess-new', user_id='user-mem-001', message='Remember me?'):
    return {
        'body': json.dumps({
            'agentId': 'agent-memory',
            'userId': user_id,
            'sessionId': session_id,
            'message': message,
        })
    }


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _make_capturing_agent():
    """Returns (CapturingAgent class, captured dict). The dict is populated on Agent.__init__."""
    captured = {}

    class CapturingAgent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def __call__(self, message, **kwargs):
            return 'Agent response'

    return CapturingAgent, captured


# ---------------------------------------------------------------------------
# Tests: Memory tools added to agent
# ---------------------------------------------------------------------------

class TestMemoryToolsAddedToAgent:
    """Contract: memory tools appear in the Agent's tool list when the feature is enabled."""

    def test_memory_tools_added_when_enabled_with_memory_id(self):
        """Agent must receive memory tools when memory_feature.enabled=True and memory_id present.

        Contract: the agent's tools list must include at least one tool whose name contains
        'memory', giving the agent the ability to retrieve/store memory.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent, captured = _make_capturing_agent()
        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200

        tools = captured.get('tools') or []
        tool_names = [
            getattr(t, 'tool_name', getattr(t, 'name', str(t))).lower()
            for t in tools
        ]
        assert any('memory' in name for name in tool_names), (
            f'Agent tools must include at least one memory tool when memory is enabled. '
            f'Got tool names: {tool_names}'
        )

    def test_memory_tools_not_added_when_disabled(self):
        """Agent must NOT receive memory tools when memory_feature.enabled=False.

        Contract: disabled memory feature means no memory tools in the agent's tool list.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent, captured = _make_capturing_agent()
        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF_DISABLED),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200

        tools = captured.get('tools') or []
        tool_names = [
            getattr(t, 'tool_name', getattr(t, 'name', str(t))).lower()
            for t in tools
        ]
        assert not any('memory' in name for name in tool_names), (
            f'Agent tools must NOT include memory tools when memory is disabled. '
            f'Got tool names: {tool_names}'
        )

    def test_memory_tools_not_added_when_no_memory_id(self):
        """Agent must NOT receive memory tools when memory_feature has no memory_id.

        Contract: memory_id is required to connect to a memory store — without it,
        no memory tools should be added even if enabled=True.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent, captured = _make_capturing_agent()
        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF_NO_MEMORY_ID),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200

        tools = captured.get('tools') or []
        tool_names = [
            getattr(t, 'tool_name', getattr(t, 'name', str(t))).lower()
            for t in tools
        ]
        assert not any('memory' in name for name in tool_names), (
            f'Agent tools must NOT include memory tools when memory_id is absent. '
            f'Got tool names: {tool_names}'
        )


# ---------------------------------------------------------------------------
# Tests: System prompt includes memory instruction
# ---------------------------------------------------------------------------

class TestMemorySystemPrompt:
    """Contract: system prompt includes an instruction to use memory tools when memory is enabled."""

    def test_system_prompt_includes_memory_instruction_when_enabled(self):
        """When memory tools are added, the system prompt must instruct the agent to use them.

        Contract: the system_prompt passed to Agent must include language directing the agent
        to check memory for relevant context from past conversations.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent, captured = _make_capturing_agent()
        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200

        system_prompt = captured.get('system_prompt', '')
        assert 'memory' in system_prompt.lower(), (
            'System prompt must include a memory-related instruction when memory tools are added. '
            f'Got system_prompt: {system_prompt!r}'
        )

    def test_system_prompt_not_modified_when_memory_disabled(self):
        """System prompt must not contain memory instructions when memory is disabled.

        Contract: if memory is disabled, the system prompt should be based solely on the
        agent's base_prompt with no injected memory directives.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent_enabled, captured_enabled = _make_capturing_agent()
        CapturingAgent_disabled, captured_disabled = _make_capturing_agent()
        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent_disabled),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF_DISABLED),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200

        system_prompt = captured_disabled.get('system_prompt', '')
        # The base_prompt must be present and no extra memory directives injected
        assert MOCK_AGENT_DEF_DISABLED['base_prompt'] in system_prompt or system_prompt == MOCK_AGENT_DEF_DISABLED['base_prompt'], (
            f'System prompt must reflect base_prompt when memory is disabled. Got: {system_prompt!r}'
        )


# ---------------------------------------------------------------------------
# Tests: Memory tools coexist with other tools
# ---------------------------------------------------------------------------

class TestMemoryToolsCoexistWithOtherTools:
    """Contract: memory tools are additive — they do not replace existing tools."""

    def test_memory_tools_added_alongside_existing_tools(self):
        """Memory tools must be added alongside other tools, not replace them.

        Contract: when build_strands_tools returns existing tools and memory is enabled,
        the Agent's tool list must contain BOTH the existing tools AND memory tools.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent, captured = _make_capturing_agent()
        mock_ddb = MagicMock()

        existing_tool = MagicMock()
        existing_tool.tool_name = 'existing_tool'
        existing_tool.name = 'existing_tool'

        agent_with_tools = {**MOCK_AGENT_DEF, 'tool_ids': ['tool-1']}

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=agent_with_tools),
            patch('handler.load_tools', return_value=[{'tool_id': 'tool-1'}]),
            patch('handler.build_strands_tools', return_value=[existing_tool]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200

        tools = captured.get('tools') or []
        tool_names = [
            getattr(t, 'tool_name', getattr(t, 'name', str(t))).lower()
            for t in tools
        ]
        assert 'existing_tool' in tool_names, (
            f'Existing tools must be preserved when memory tools are added. Got: {tool_names}'
        )
        assert any('memory' in name for name in tool_names), (
            f'Memory tools must be present alongside existing tools. Got: {tool_names}'
        )
        assert len(tools) >= 2, (
            f'Agent must have at least 2 tools (existing + memory). Got {len(tools)}: {tool_names}'
        )


# ---------------------------------------------------------------------------
# Tests: New-session nudge in agent message
# ---------------------------------------------------------------------------

def _make_mock_memory_tool():
    """Returns a mock tool that looks like an AgentCore memory tool."""
    tool = MagicMock()
    tool.tool_name = 'agent_core_memory'
    tool.name = 'agent_core_memory'
    return tool


def _make_capturing_agent_with_message():
    """Returns (CapturingAgent class, captured dict). Captures both __init__ kwargs and call message."""
    captured = {}

    class CapturingAgent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def __call__(self, message, **kwargs):
            captured['_called_with_message'] = message
            return 'Agent response'

    return CapturingAgent, captured


class TestNewSessionNudge:
    """Contract: agent message includes a memory retrieval nudge on the first message of a new session."""

    def test_nudge_appended_to_first_message_when_memory_enabled(self):
        """On a new session (empty message history), the agent message must include the memory nudge.

        Contract: when memory_feature.enabled=True and get_messages returns [] (no prior history),
        the message passed to agent(...) must contain NEW_SESSION_MEMORY_NUDGE verbatim.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent, captured = _make_capturing_agent_with_message()
        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler._build_memory_tools', return_value=[_make_mock_memory_tool()]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200

        called_message = captured.get('_called_with_message', '')
        assert called_message, 'Agent must have been called with a message'
        assert h.NEW_SESSION_MEMORY_NUDGE in called_message, (
            'Agent message must include NEW_SESSION_MEMORY_NUDGE verbatim on new sessions when memory is enabled. '
            f'Got message: {called_message!r}'
        )

    def test_nudge_not_appended_on_subsequent_turns(self):
        """On subsequent turns (non-empty message history), the agent message must NOT include the nudge.

        Contract: the memory nudge is only for new sessions. When get_messages returns prior history,
        the message passed to agent(...) must not contain NEW_SESSION_MEMORY_NUDGE.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent, captured = _make_capturing_agent_with_message()
        mock_ddb = MagicMock()

        prior_messages = [
            {'source': 'user', 'message': 'Hello!', 'message_id': 'msg-1', 'session_id': 'sess-new', 'user_id': 'user-mem-001', 'timestamp': '2024-01-01T00:00:00Z'},
            {'source': 'assistant', 'message': 'Hi there!', 'message_id': 'msg-2', 'session_id': 'sess-new', 'user_id': 'user-mem-001', 'timestamp': '2024-01-01T00:00:01Z'},
        ]

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler._build_memory_tools', return_value=[_make_mock_memory_tool()]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=prior_messages),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(message='Tell me more'), _make_ctx())

        assert result['statusCode'] == 200

        called_message = captured.get('_called_with_message', '')
        assert called_message, 'Agent must have been called with a message'
        assert h.NEW_SESSION_MEMORY_NUDGE not in called_message, (
            'Agent message must NOT include NEW_SESSION_MEMORY_NUDGE on subsequent turns. '
            f'Got message: {called_message!r}'
        )

    def test_nudge_not_appended_when_memory_disabled(self):
        """When memory is disabled, the new-session nudge must not be added even on a new session.

        Contract: memory nudge behaviour is gated on memory_feature.enabled.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent, captured = _make_capturing_agent_with_message()
        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF_DISABLED),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200

        called_message = captured.get('_called_with_message', '')
        assert called_message, 'Agent must have been called — if empty, the agent was never invoked and the test is vacuous'
        assert h.NEW_SESSION_MEMORY_NUDGE not in called_message, (
            'Agent message must NOT include the memory nudge when memory is disabled. '
            f'Got message: {called_message!r}'
        )


# ---------------------------------------------------------------------------
# Tests: Stronger system prompt assertions (additive to existing weak checks)
# ---------------------------------------------------------------------------

class TestMemorySystemPromptStrong:
    """Stronger contract: system prompt must instruct BOTH retrieval AND saving memories."""

    def test_system_prompt_includes_retrieve_and_save_instructions(self):
        """System prompt must contain MEMORY_SYSTEM_PROMPT_ADDITION verbatim when memory is enabled.

        Contract: asserts the full constant rather than individual keywords so any change to the
        prompt wording requires an intentional update to the constant — not just passing keywords.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent, captured = _make_capturing_agent()
        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler._build_memory_tools', return_value=[_make_mock_memory_tool()]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200

        system_prompt = captured.get('system_prompt', '')
        assert h.MEMORY_SYSTEM_PROMPT_ADDITION in system_prompt, (
            'System prompt must contain MEMORY_SYSTEM_PROMPT_ADDITION verbatim when memory is enabled. '
            f'Got system_prompt: {system_prompt!r}'
        )

    def test_system_prompt_has_no_memory_directives_when_disabled(self):
        """When memory is disabled, MEMORY_SYSTEM_PROMPT_ADDITION must not appear in system_prompt.

        Contract: memory instructions must not leak into the system prompt when the feature is off.
        The existing test checks base_prompt is present; this test checks the addition is absent.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent, captured = _make_capturing_agent()
        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF_DISABLED),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200

        system_prompt = captured.get('system_prompt', '')
        assert h.MEMORY_SYSTEM_PROMPT_ADDITION not in system_prompt, (
            'System prompt must NOT contain MEMORY_SYSTEM_PROMPT_ADDITION when memory is disabled. '
            f'Got system_prompt: {system_prompt!r}'
        )

    def test_system_prompt_contains_standing_retrieve_contract(self):
        """System prompt must hint at new-conversation retrieval, and must not contain the nudge text.

        Two contracts in one test (intentional — both guard the same architectural boundary):
        1. MEMORY_SYSTEM_PROMPT_ADDITION hints at new-conversation retrieval via a phrase unique
           to that constant ('especially at the start of a new conversation'). Guards against
           someone weakening or removing the new-session emphasis from the system prompt.
        2. NEW_SESSION_MEMORY_NUDGE must NOT appear in system_prompt. The nudge belongs in the
           user turn only — injecting it into the system prompt would bust the Bedrock prompt
           cache for every user on every turn.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent, captured = _make_capturing_agent()
        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler._build_memory_tools', return_value=[_make_mock_memory_tool()]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200

        system_prompt = captured.get('system_prompt', '')
        assert 'especially at the start of a new conversation' in system_prompt.lower(), (
            'System prompt must hint at new-conversation retrieval via the phrase '
            '"especially at the start of a new conversation" (unique to MEMORY_SYSTEM_PROMPT_ADDITION). '
            f'Got system_prompt: {system_prompt!r}'
        )
        assert h.NEW_SESSION_MEMORY_NUDGE not in system_prompt, (
            'NEW_SESSION_MEMORY_NUDGE must NOT appear in system_prompt — nudge belongs in the user '
            'turn only to preserve Bedrock prompt cache hit rate for all users. '
            f'Got system_prompt: {system_prompt!r}'
        )


class TestEdgeCases:
    """Edge case contracts for memory feature robustness."""

    def test_none_from_get_messages_is_treated_as_new_session(self):
        """When get_messages returns None, the handler must not crash and must treat it as a new session.

        Two contracts (intentionally combined — both stem from the same `or []` normalization):
        1. Handler returns 200 — None is normalized to [] before any list operations, preventing
           TypeErrors in fix_turn_taking_errors and elsewhere.
        2. Nudge fires — None normalizes to [], _memory_is_new_session becomes True. Treating an
           unknown/error history as a new session is the conservative safe direction.
        """
        import handler as h  # noqa: PLC0415

        CapturingAgent, captured = _make_capturing_agent_with_message()
        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler._build_memory_tools', return_value=[_make_mock_memory_tool()]),
            patch('handler.get_user', return_value={'user_id': 'user-mem-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=None),
            patch('handler.add_message', return_value=None),
            patch('handler.ensure_session', return_value=None),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200, (
            'Handler must not crash when get_messages returns None — '
            'or [] at the call site should normalize it to an empty list'
        )
        called_message = captured.get('_called_with_message', '')
        assert called_message, 'Agent must have been called'
        # None → or [] → [] → _memory_is_new_session=True → nudge fires (treated as new session)
        assert h.NEW_SESSION_MEMORY_NUDGE in called_message, (
            'None from get_messages normalizes to [] via or [], so the nudge fires '
            '(conservative: treat unknown history as new session). '
            f'Got message: {called_message!r}'
        )
