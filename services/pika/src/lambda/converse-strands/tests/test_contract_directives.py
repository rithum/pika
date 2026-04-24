"""
CONTRACT TESTS: Semantic directive / instruction augmentation.

Observable behavior contracts:
  - When instructionAugmentation is enabled and matching semantic directives exist
    for the agent's scope, the directive instructions reach the LLM via an
    AgentSkills plugin (one Skill per matched directive, carrying the directive's
    instructions). This is the Strands-native replacement for the TS path's
    prompt-injection mechanism — the Skills plugin exposes skill names/descriptions
    to the model and the model calls `skills()` to load full instructions on demand.
  - When the feature is disabled, no skills are built (kill-switch).
  - When no directives match the scopes, no skills are built.
  - Errors during directive resolution must NOT fail the request — the handler
    still runs the agent, just without directive augmentation.
  - An `applied_directives` trace is emitted with type='semantic-directives' so the
    admin Answer Reasoning panel renders the "Applied Semantic Directives" cards.
  - Per-collaborator directives are resolved independently; a failure for one
    collaborator must not prevent other collaborators or the main agent.
"""

import json
import pytest
from unittest.mock import MagicMock, patch


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _make_session(session_id='sess-directives'):
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
# Tests: matching directives build an AgentSkills plugin with the directive
# instructions. This is the Strands-native mechanism; the TS path used
# prompt-injection, Strands uses Skills (progressive disclosure).
# ---------------------------------------------------------------------------

class TestMatchingDirectivesBuildSkills:
    """Contract: matched directives become Strands Skills carrying their instructions."""

    def test_matching_directives_build_skills_with_instructions(self):
        """When features.instructionAugmentation.enabled=True and search_semantic_directives
        returns matching directives, _build_directive_skills_plugin returns an AgentSkills
        plugin whose skills carry each directive's instructions verbatim.

        Observable: downstream the Strands agent receives the plugin, exposes skill
        names/descriptions to the model, and the model calls `skills()` to load the
        full instructions when relevant."""
        import handler as h  # noqa: PLC0415

        directives = [
            {
                'id': 'dir-001',
                'scope': 'agent',
                'description': 'Handle order status queries',
                'instructions': 'ORDER_DIRECTIVE_BODY: always provide estimated delivery date.',
                'status': 'enabled',
            },
            {
                'id': 'dir-002',
                'scope': 'chatApp',
                'description': 'Financial advice disclaimer',
                'instructions': 'FINANCE_DIRECTIVE_BODY: always add a disclaimer.',
                'status': 'enabled',
            },
        ]

        features = {'instructionAugmentation': {'enabled': True, 'type': 'llm-semantic-directive-search'}}

        with patch('handler.search_semantic_directives', return_value=directives):
            plugin, applied = h._build_directive_skills_plugin(
                agent_id='agent-001', chat_app_id='app-001', entity_id=None,
                features=features, tool_ids=[],
            )

        assert plugin is not None, 'AgentSkills plugin must be built when directives match'
        assert len(applied) == 2, 'Each matched directive must appear in applied list'

        # Each skill must carry the directive's instructions verbatim — that's what
        # the Strands agent will load via the skills() tool when relevant.
        # (`plugin.skills` is the exposed tool; the skill list is `get_available_skills()`.)
        skill_instructions = [s.instructions for s in plugin.get_available_skills()]
        assert any('ORDER_DIRECTIVE_BODY' in inst for inst in skill_instructions), (
            f'First directive instructions missing. Got: {skill_instructions!r}'
        )
        assert any('FINANCE_DIRECTIVE_BODY' in inst for inst in skill_instructions), (
            f'Second directive instructions missing. Got: {skill_instructions!r}'
        )

    def test_no_matching_directives_yields_no_plugin(self):
        """If search_semantic_directives returns [], no plugin is built (None returned)."""
        import handler as h  # noqa: PLC0415

        features = {'instructionAugmentation': {'enabled': True}}
        with patch('handler.search_semantic_directives', return_value=[]):
            plugin, applied = h._build_directive_skills_plugin(
                agent_id='a', chat_app_id='c', entity_id=None, features=features, tool_ids=[],
            )
        assert plugin is None and applied == []

    def test_feature_disabled_yields_no_plugin_without_querying_ddb(self):
        """When instructionAugmentation is off, directives must not even be fetched
        from DDB — the kill-switch is early and total."""
        import handler as h  # noqa: PLC0415

        features = {'instructionAugmentation': {'enabled': False}}
        with patch('handler.search_semantic_directives') as mock_search:
            plugin, applied = h._build_directive_skills_plugin(
                agent_id='a', chat_app_id='c', entity_id=None, features=features, tool_ids=[],
            )
            assert plugin is None and applied == []
            assert not mock_search.called, (
                'search_semantic_directives must not be called when feature is disabled'
            )


# ---------------------------------------------------------------------------
# Tests: feature disabled → no directives in prompt
# ---------------------------------------------------------------------------

class TestDirectivesFeatureDisabled:
    """Contract: when instructionAugmentation is disabled, directives must not affect the prompt."""

    def test_directive_instructions_absent_when_feature_disabled(self):
        """When instructionAugmentation.enabled is False, directive text must NOT appear in prompt.

        Observable: disabling the feature is a kill-switch; no directive content must leak
        into the LLM prompt even if directives exist in the DB.
        """
        import handler as h  # noqa: PLC0415

        directive = {
            'id': 'dir-003',
            'description': 'Some directive',
            'instructions': 'SHOULD_NOT_APPEAR_IN_PROMPT',
            'status': 'enabled',
        }

        event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-disabled', 'message': 'Hello',
            })
        }

        captured_prompt = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_prompt['p'] = kwargs.get('prompt', '')
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
            patch('handler.ensure_session', return_value=_make_session('sess-disabled')),
            patch('handler.load_agent', return_value=_make_agent_def()),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={
                'user_id': 'user-001', 'custom_data': {},
                'features': {'instruction_augmentation': {'enabled': False}},
            }),
            patch('handler.get_messages', return_value=[]),
            patch('handler.search_semantic_directives', return_value=[directive]),
            patch('handler.Agent', side_effect=make_agent_spy),
        ):
            h.handler(event, _make_ctx())

        prompt = captured_prompt.get('p', '')
        assert 'SHOULD_NOT_APPEAR_IN_PROMPT' not in prompt, (
            f'Directive instructions must NOT be in prompt when feature is disabled. '
            f'Got: {prompt[:500]!r}'
        )

    def test_directive_instructions_absent_when_feature_not_configured(self):
        """When instructionAugmentation is not in user features at all, directives must not appear.

        Observable: absent feature config is equivalent to disabled — no directive augmentation.
        """
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-no-feature', 'message': 'Hello',
            })
        }

        captured_prompt = {}

        def make_agent_spy(system_prompt='', **kwargs):
            captured_prompt['p'] = kwargs.get('prompt', '')
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
            patch('handler.ensure_session', return_value=_make_session('sess-no-feature')),
            patch('handler.load_agent', return_value=_make_agent_def()),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={
                'user_id': 'user-001', 'custom_data': {},
                'features': {},  # no instructionAugmentation key
            }),
            patch('handler.get_messages', return_value=[]),
            patch('handler.search_semantic_directives',
                  return_value=[{'id': 'dir-x', 'instructions': 'MUST_NOT_APPEAR', 'status': 'enabled'}]),
            patch('handler.Agent', side_effect=make_agent_spy),
        ):
            h.handler(event, _make_ctx())

        prompt = captured_prompt.get('p', '')
        assert 'MUST_NOT_APPEAR' not in prompt, (
            f'Directives must not appear when feature is not configured. Got: {prompt[:300]!r}'
        )


# ---------------------------------------------------------------------------
# Tests: error resilience
# ---------------------------------------------------------------------------

class TestDirectiveErrorResilience:
    """Contract: directive resolution errors must not fail the overall request."""

    def test_directive_resolution_error_does_not_fail_request(self):
        """If directive lookup fails (e.g. DDB unavailable), the handler must still return a response.

        Observable: the conversation must continue even without directive augmentation.
        A directive outage must not cause a 500 error for users.
        """
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-err', 'message': 'Hello',
            })
        }

        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}}

        with (
            patch('handler.dynamodb', mock_ddb),
            patch('handler.add_message'),
            patch('handler.ensure_session', return_value=_make_session('sess-err')),
            patch('handler.load_agent', return_value=_make_agent_def()),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={
                'user_id': 'user-001', 'custom_data': {},
                'features': {'instruction_augmentation': {'enabled': True}},
            }),
            patch('handler.get_messages', return_value=[]),
            patch('handler.search_semantic_directives',
                  side_effect=RuntimeError('DDB timeout')),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='ok'))),
        ):
            try:
                response = h.handler(event, _make_ctx())
            except Exception as exc:
                pytest.fail(
                    f'Handler must not raise when directive lookup fails. '
                    f'Got {type(exc).__name__}: {exc}'
                )

        assert response is not None, 'Handler must return a response even when directives fail'
        assert response.get('statusCode', 200) in (200, 206), (
            f'Handler must return success status even when directives fail. '
            f'Got: {response.get("statusCode")}'
        )

    def test_no_matching_directives_leaves_prompt_unaffected(self):
        """When no directives match the message/scopes, the prompt must not be modified.

        Observable: an empty directive result is a no-op — the user's message reaches the LLM
        exactly as expected with no spurious directive content.
        """
        import handler as h  # noqa: PLC0415

        event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-nomatch', 'message': 'Tell me a joke',
            })
        }

        agent_inst = MagicMock()
        agent_inst.return_value = 'ok'

        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}}

        with (
            patch('handler.dynamodb', mock_ddb),
            patch('handler.add_message'),
            patch('handler.ensure_session', return_value=_make_session('sess-nomatch')),
            patch('handler.load_agent', return_value=_make_agent_def()),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={
                'user_id': 'user-001', 'custom_data': {},
                'features': {'instruction_augmentation': {'enabled': True}},
            }),
            patch('handler.get_messages', return_value=[]),
            patch('handler.search_semantic_directives', return_value=[]),
            patch('handler.Agent', MagicMock(return_value=agent_inst)),
        ):
            h.handler(event, _make_ctx())

        prompt = agent_inst.call_args.args[0] if agent_inst.call_args and agent_inst.call_args.args else ''
        assert 'Tell me a joke' in prompt, (
            f'User message must be present in prompt when no directives match. Got: {prompt[:300]!r}'
        )
