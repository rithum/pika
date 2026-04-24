"""
CONTRACT TESTS: Entity access control and scoping for the Strands converse Lambda.

These tests are EXPECTED TO FAIL until entity scoping is implemented.

Observable behavior contracts:
  - When a user has entity data (e.g. clientId), the agent's behavior is scoped to that entity:
    directives and instructions relevant to the entity are included in the context.
  - Entity data comes from the user's JWT customUserData, keyed by
    request.entityAttributeNameInUserCustomData.
  - When entity data is absent, entity-scoped directives are NOT included.
  - The entity context (the entity value itself) must be available in the session so that
    downstream tools (KB filters, directive lookups) can scope their results.
"""

import json
import pytest
from unittest.mock import MagicMock, patch


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _make_session(session_id='sess-entity'):
    return {
        'session_id': session_id, 'last_update': None,
        'user_id': 'user-001', 'chat_app_id': 'app-001', 'session_attributes': {},
    }


def _make_agent_def(agent_id='agent-001'):
    return {
        'agent_id': agent_id,
        'base_prompt': 'Be helpful.',
        'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'tool_ids': [],
    }


# ---------------------------------------------------------------------------
# Tests: entity-scoped directives reach the agent
# ---------------------------------------------------------------------------

class TestEntityScopedDirectives:
    """Contract: entity-specific directives must be included when the user has entity data."""

    def test_entity_scoped_directive_builds_skill_when_entity_id_present(self):
        """When an entity_id is provided, _build_directive_skills_plugin passes it to
        search_semantic_directives and surfaces the resulting entity-scoped directives
        as skills that carry their instructions verbatim.

        Observable: the Strands agent's Skills plugin includes the entity-scoped
        directive's instructions, so the model can load them on demand when the
        entity context is relevant to the user's message."""
        import handler as h  # noqa: PLC0415

        entity_directive = {
            'id': 'dir-entity-001',
            'scope': 'entity',
            'entity': 'client-xyz',
            'description': 'Handle client-xyz with white-glove support',
            'instructions': 'ENTITY_DIRECTIVE_BODY: escalate to senior agent if unsatisfied.',
            'status': 'enabled',
        }

        features = {'instructionAugmentation': {'enabled': True}}

        with patch('handler.search_semantic_directives', return_value=[entity_directive]) as mock_search:
            plugin, applied = h._build_directive_skills_plugin(
                agent_id='agent-001', chat_app_id='app-001', entity_id='client-xyz',
                features=features, tool_ids=[],
            )

        # entity_id must flow through to the directive search so scope filtering happens at the query layer
        assert mock_search.called, 'search_semantic_directives must be called when feature is enabled'
        call_args = mock_search.call_args
        # entity_id is the third positional arg per _build_directive_skills_plugin → search_semantic_directives
        # Accept it as positional or kwarg:
        entity_id_seen = (
            call_args.args[2] if len(call_args.args) >= 3 else call_args.kwargs.get('entity_id')
        )
        assert entity_id_seen == 'client-xyz', (
            f'entity_id must be forwarded to search_semantic_directives. Got {entity_id_seen!r}'
        )

        assert plugin is not None, 'Entity-scoped directive must produce a skills plugin'
        skill_instructions = [s.instructions for s in plugin.get_available_skills()]
        assert any('ENTITY_DIRECTIVE_BODY' in inst for inst in skill_instructions), (
            f'Entity-scoped directive instructions missing from skill. Got: {skill_instructions!r}'
        )

    def test_entity_directive_instructions_absent_when_no_entity(self):
        """When the user has no entity data, entity-scoped directive instructions must NOT appear.

        Observable: entity-scoped directives are irrelevant without an entity value; including
        them would be incorrect behavior.
        """
        import handler as h  # noqa: PLC0415

        entity_directive = {
            'id': 'dir-entity-002',
            'scope': 'entity',
            'entity': 'client-xyz',
            'description': 'Client-xyz specific instructions',
            'instructions': 'Entity-specific instruction — must not appear when no entity.',
            'status': 'enabled',
        }

        event = {
            'body': json.dumps({
                'agentId': 'agent-001',
                'userId': 'user-001',
                'sessionId': 'sess-no-entity',
                'message': 'Hello',
                # no entityAttributeNameInUserCustomData
            })
        }

        captured_prompt = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_prompt['p'] = kwargs.get('prompt', '')
            inst = MagicMock()
            inst.return_value = 'ok'
            return inst

        with (
            patch('handler.ensure_session', return_value=_make_session('sess-no-entity')),
            patch('handler.load_agent', return_value=_make_agent_def()),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={
                'user_id': 'user-001',
                'custom_data': {},
                'features': {'instruction_augmentation': {'enabled': True}},
            }),
            patch('handler.get_messages', return_value=[]),
            patch('handler.search_semantic_directives', return_value=[entity_directive]),
            patch('handler.invoke_llm_for_directive_filter',
                  return_value='<answer>[]</answer>'),
            patch('handler.Agent', side_effect=make_agent_spy),
        ):
            h.handler(event, _make_ctx())

        prompt = captured_prompt.get('p', '')
        assert 'Entity-specific instruction' not in prompt, (
            f'Entity directive must not appear when user has no entity value. '
            f'Got: {prompt[:300]!r}'
        )


# ---------------------------------------------------------------------------
# Tests: entity value available in session for tool scoping
# ---------------------------------------------------------------------------

class TestEntityValueInSession:
    """Contract: the entity value must be available in session state for tool use."""

    def test_entity_value_present_in_session_context_when_provided(self):
        """Entity value from user's customUserData must appear in session attributes.

        Observable: downstream tools (KB filters, data queries) use the entity value from
        session state to restrict results to the user's entity.
        """
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-001',
                'userId': 'user-001',
                'sessionId': 'sess-entity-attr',
                'message': 'Show my account',
                'entityAttributeNameInUserCustomData': 'clientId',
            })
        }
        session = _make_session('sess-entity-attr')

        captured_attrs = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_attrs.update(kwargs.get('state', {}).get('session_attributes', {}))
            inst = MagicMock()
            inst.return_value = 'ok'
            return inst

        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-entity-attr'}}

        with (
            patch('handler.dynamodb', mock_ddb),
            patch('handler.ensure_session', return_value=session),
            patch('handler.add_message'),
            patch('handler.load_agent', return_value=_make_agent_def()),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={
                'user_id': 'user-001',
                'custom_data': {'clientId': 'client-xyz'},
            }),
            patch('handler.get_messages', return_value=[]),
            patch('handler.Agent', side_effect=make_agent_spy),
        ):
            h.handler(event, _make_ctx())

        # Entity value should appear in session attrs under some key
        all_values = list(captured_attrs.values())
        assert 'client-xyz' in all_values or any('client-xyz' in str(v) for v in all_values), (
            f'Entity value "client-xyz" must appear in session_attributes. '
            f'Got: {captured_attrs}'
        )
