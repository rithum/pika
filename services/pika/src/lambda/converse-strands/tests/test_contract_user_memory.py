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
