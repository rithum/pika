"""
CONTRACT TESTS: Knowledge Base config and retrieval for the Strands converse Lambda.

These tests are EXPECTED TO FAIL until KB support is implemented.

Observable behavior contract:
  - When an agent definition includes knowledge_bases, the handler returns 200 and the agent
    is invoked with KB context available (system_prompt or model configuration reflects KB setup)
  - KB filter placeholders like {userId}, {department} are resolved from the user's custom_data
    before the agent is invoked — the agent sees resolved values, not raw templates
  - KB numberOfResults controls how many results are surfaced to the agent
  - An agent without knowledge_bases behaves identically to today (no regression)

What the Strands implementation must guarantee:
  - The agent's context/prompt includes knowledge relevant to the user's profile
    when KB filters are user-specific (the right data reaches the right user)
  - KB config errors (invalid filters) do not cause silent failures — handler returns 200
    with whatever context was successfully retrieved
"""

import json
import pytest
from unittest.mock import MagicMock, patch


def _make_event(agent_id='agent-kb', session_id='sess-001', user_id='user-001',
                message='Find relevant documents'):
    return {
        'body': json.dumps({
            'agentId': agent_id,
            'userId': user_id,
            'sessionId': session_id,
            'message': message,
        })
    }


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


# ---------------------------------------------------------------------------
# Tests: Handler behavior with knowledge bases configured on agent
# ---------------------------------------------------------------------------

class TestKnowledgeBaseHandlerBehavior:
    """Observable behavior when agent definition includes knowledge_bases."""

    def test_agent_with_knowledge_bases_returns_200(self):
        """Handler must return 200 when agent definition includes knowledge_bases config.

        Contract: KB configuration must not break the handler — agent is invoked
        and the user receives a response.
        """
        import handler as h  # noqa: PLC0415

        agent_def = {
            'agent_id': 'agent-kb',
            'base_prompt': 'You are a helpful assistant with access to product documentation.',
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'tool_ids': [],
            'knowledge_bases': [
                {'id': 'kb-001', 'description': 'Product catalog knowledge base'},
            ],
        }

        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='Here is the product info.'))),
            patch('handler.load_agent', return_value=agent_def),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200, (
            f'Agent with knowledge_bases must still return 200. Got: {result["statusCode"]}'
        )

    def test_agent_with_user_filtered_kb_receives_resolved_filter_in_context(self):
        """When KB has a user-specific filter, the agent's context must reflect the user's resolved values.

        Contract: Filter placeholders like {userId} or {department} are resolved from
        the user's custom_data BEFORE the agent is invoked. The agent must not see
        raw template strings like '{department}' — only resolved values.

        Example: KB filter {department} → 'engineering' for a user with department=engineering.
        This ensures each user only retrieves data relevant to them.
        """
        import handler as h  # noqa: PLC0415

        agent_def = {
            'agent_id': 'agent-kb-filter',
            'base_prompt': 'You have access to department-specific documentation.',
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'tool_ids': [],
            'knowledge_bases': [
                {
                    'id': 'kb-dept',
                    'description': 'Department documentation',
                    'filter': {'equals': {'key': 'department', 'value': '{department}'}},
                },
            ],
        }

        mock_ddb = MagicMock()
        captured_agent_init = {}

        class CapturingAgent:
            def __init__(self, **kwargs):
                captured_agent_init.update(kwargs)

            def __call__(self, message, **kwargs):
                return 'Engineering docs retrieved.'

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=agent_def),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={
                'user_id': 'user-001',
                'custom_data': {'department': 'engineering'},
            }),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200

        # The agent must be configured without any unresolved '{department}' placeholders
        agent_config_str = str(captured_agent_init)
        assert '{department}' not in agent_config_str, (
            'Agent must not be invoked with unresolved filter template {department}. '
            f'Agent init kwargs: {captured_agent_init}'
        )

    def test_agent_without_knowledge_bases_unaffected(self):
        """Agent definition without knowledge_bases must behave exactly as it does today.

        Contract: KB feature must not break agents that don't use it (no regression).
        """
        import handler as h  # noqa: PLC0415

        agent_def = {
            'agent_id': 'agent-no-kb',
            'base_prompt': 'You are a helpful assistant.',
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'tool_ids': [],
            # No knowledge_bases key
        }

        mock_ddb = MagicMock()

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='Hello!'))),
            patch('handler.load_agent', return_value=agent_def),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(_make_event(agent_id='agent-no-kb'), _make_ctx())

        assert result['statusCode'] == 200, (
            'Agent without knowledge_bases must still return 200 — no regression allowed'
        )

    def test_multiple_knowledge_bases_all_available_to_agent(self):
        """When agent has multiple KBs, the agent must have access to all of them.

        Contract: All configured KBs are surfaced to the agent — not just the first one.
        The user's question can be answered from any of the configured KBs.
        """
        import handler as h  # noqa: PLC0415

        agent_def = {
            'agent_id': 'agent-multi-kb',
            'base_prompt': 'You have access to multiple knowledge bases.',
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'tool_ids': [],
            'knowledge_bases': [
                {'id': 'kb-products', 'description': 'Product catalog'},
                {'id': 'kb-orders', 'description': 'Order history'},
                {'id': 'kb-support', 'description': 'Support articles'},
            ],
        }

        mock_ddb = MagicMock()
        captured_agent_init = {}

        class CapturingAgent:
            def __init__(self, **kwargs):
                captured_agent_init.update(kwargs)

            def __call__(self, message, **kwargs):
                return 'Found info across all KBs.'

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=agent_def),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(_make_event(agent_id='agent-multi-kb'), _make_ctx())

        assert result['statusCode'] == 200

        # All 3 KB IDs must be reflected in the agent's tools
        tools = captured_agent_init.get('tools') or []
        tool_names = [getattr(t, 'tool_name', str(t)) for t in tools]
        for kb_id in ['kb-products', 'kb-orders', 'kb-support']:
            assert any(kb_id.replace('-', '_') in name for name in tool_names), (
                f'KB "{kb_id}" must be included as a tool. '
                f'Tool names: {tool_names}'
            )
