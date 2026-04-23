"""
CONTRACT TESTS: LRU caching behavior for the Strands converse Lambda.

These tests are EXPECTED TO FAIL until caching is implemented.

Observable behavior contracts:
  - Cache-clear commands (cacheType='agent', 'tagDefinitions', 'instructionAssistanceConfig', 'all')
    must be accepted and return a success response without invoking the LLM.
  - After an agent cache clear, the handler reflects any updated agent config on the next request.
  - Repeated requests with the same agentId must produce consistent results (cache correctness).
  - dontCacheThis agents: every request sees the latest agent config from the source of truth.
"""

import json
import pytest
from unittest.mock import MagicMock, patch


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _make_agent_def(agent_id='agent-001'):
    return {
        'agent_id': agent_id,
        'base_prompt': 'Be helpful.',
        'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'tool_ids': [],
    }


# ---------------------------------------------------------------------------
# Tests: cache-clear command handling
# ---------------------------------------------------------------------------

class TestCacheClearCommands:
    """Contract: cache-clear requests must be handled gracefully without invoking the LLM."""

    def test_cache_clear_agent_returns_success_without_llm_call(self):
        """cacheType='agent' with agentId must succeed and NOT invoke the Strands agent.

        Observable contract: cache management is a control-plane operation; the LLM must not
        be called, and the response must indicate success.
        """
        import handler as h  # noqa: PLC0415

        event = {'body': json.dumps({'cacheType': 'agent', 'agentId': 'agent-001'})}
        ctx = _make_ctx()

        with patch('handler.Agent') as mock_agent_cls:
            response = h.handler(event, ctx)

        mock_agent_cls.assert_not_called()
        assert response is not None, 'Cache clear must return a response'
        body = json.loads(response.get('body', '{}')) if isinstance(response.get('body'), str) else response
        assert response.get('statusCode', 200) == 200, (
            f'Cache clear must return HTTP 200. Got: {response.get("statusCode")}'
        )

    def test_cache_clear_all_returns_success_without_llm_call(self):
        """cacheType='all' must clear all caches and return success without invoking the LLM.

        Observable contract: control-plane operation; LLM must not be called.
        """
        import handler as h  # noqa: PLC0415

        event = {'body': json.dumps({'cacheType': 'all'})}
        ctx = _make_ctx()

        with patch('handler.Agent') as mock_agent_cls:
            response = h.handler(event, ctx)

        mock_agent_cls.assert_not_called()
        assert response.get('statusCode', 200) == 200, (
            f'Cache clear all must return HTTP 200. Got: {response.get("statusCode")}'
        )

    def test_cache_clear_tag_definitions_returns_success_without_llm_call(self):
        """cacheType='tagDefinitions' must succeed and NOT invoke the Strands agent.

        Observable contract: control-plane operation; LLM must not be called.
        """
        import handler as h  # noqa: PLC0415

        event = {'body': json.dumps({'cacheType': 'tagDefinitions'})}
        ctx = _make_ctx()

        with patch('handler.Agent') as mock_agent_cls:
            response = h.handler(event, ctx)

        mock_agent_cls.assert_not_called()
        assert response.get('statusCode', 200) == 200, (
            f'Cache clear tagDefinitions must return HTTP 200. Got: {response.get("statusCode")}'
        )

    def test_cache_clear_instruction_assistance_config_returns_success(self):
        """cacheType='instructionAssistanceConfig' must succeed without invoking the LLM.

        Observable contract: control-plane operation; LLM must not be called.
        """
        import handler as h  # noqa: PLC0415

        event = {'body': json.dumps({'cacheType': 'instructionAssistanceConfig'})}
        ctx = _make_ctx()

        with patch('handler.Agent') as mock_agent_cls:
            response = h.handler(event, ctx)

        mock_agent_cls.assert_not_called()
        assert response.get('statusCode', 200) == 200, (
            f'Cache clear instructionAssistanceConfig must return HTTP 200. '
            f'Got: {response.get("statusCode")}'
        )


# ---------------------------------------------------------------------------
# Tests: cache correctness — updated config is reflected after clear
# ---------------------------------------------------------------------------

class TestCacheCorrectness:
    """Contract: after a cache clear, the next request uses the latest config."""

    def test_updated_agent_config_used_after_cache_clear(self):
        """After clearing the agent cache, the next request must use the updated agent definition.

        Observable contract: if an agent's base_prompt is updated in DDB and the cache is cleared,
        the next conversation must use the new prompt (not the stale cached version).
        """
        import handler as h  # noqa: PLC0415

        ctx = _make_ctx()
        session = {
            'session_id': 'sess-001', 'last_update': None,
            'user_id': 'user-001', 'chat_app_id': 'app-001', 'session_attributes': {},
        }

        converse_event = {
            'body': json.dumps({
                'agentId': 'agent-001', 'userId': 'user-001',
                'sessionId': 'sess-001', 'message': 'Hello',
            })
        }
        clear_event = {'body': json.dumps({'cacheType': 'agent', 'agentId': 'agent-001'})}

        captured_prompts = []

        def make_agent_spy(system_prompt='', **kwargs):
            captured_prompts.append(system_prompt)
            agent_inst = MagicMock()
            agent_inst.return_value = 'ok'
            return agent_inst

        # First request: agent has original prompt
        original_def = {**_make_agent_def(), 'base_prompt': 'Original prompt.'}
        updated_def = {**_make_agent_def(), 'base_prompt': 'Updated prompt after config change.'}

        load_agent_mock = MagicMock(side_effect=[original_def, updated_def])

        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-001'}}

        with (
            patch('handler.dynamodb', mock_ddb),
            patch('handler.load_agent', load_agent_mock),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.ensure_session', return_value=session),
            patch('handler.add_message'),
            patch('handler.Agent', side_effect=make_agent_spy),
        ):
            h.handler(converse_event, ctx)   # warms cache with original
            h.handler(clear_event, ctx)       # clears cache
            h.handler(converse_event, ctx)   # should pick up updated def

        assert len(captured_prompts) >= 2, 'Agent must be invoked at least twice (before and after clear)'
        assert captured_prompts[-1] != captured_prompts[0] or 'Updated' in str(captured_prompts[-1]), (
            'After cache clear, the updated agent config must be reflected in the system prompt.'
        )

    def test_dont_cache_this_agent_always_uses_latest_config(self):
        """Agent with dontCacheThis=True must always reflect the current config without a cache-clear step.

        Observable contract: dontCacheThis agents behave like cache is always empty —
        every request picks up the latest definition from the source of truth.
        """
        import handler as h  # noqa: PLC0415

        ctx = _make_ctx()
        session = {
            'session_id': 'sess-002', 'last_update': None,
            'user_id': 'user-001', 'chat_app_id': 'app-001', 'session_attributes': {},
        }
        converse_event = {
            'body': json.dumps({
                'agentId': 'agent-dynamic', 'userId': 'user-001',
                'sessionId': 'sess-002', 'message': 'Hello',
            })
        }

        captured_prompts = []

        def make_agent_spy(system_prompt='', **kwargs):
            captured_prompts.append(system_prompt)
            agent_inst = MagicMock()
            agent_inst.return_value = 'ok'
            return agent_inst

        v1 = {**_make_agent_def('agent-dynamic'), 'base_prompt': 'Version 1.', 'dontCacheThis': True}
        v2 = {**_make_agent_def('agent-dynamic'), 'base_prompt': 'Version 2.', 'dontCacheThis': True}

        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': {'user_id': 'user-001', 'session_id': 'sess-002'}}

        with (
            patch('handler.dynamodb', mock_ddb),
            patch('handler.load_agent', side_effect=[v1, v2]),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.ensure_session', return_value=session),
            patch('handler.add_message'),
            patch('handler.Agent', side_effect=make_agent_spy),
        ):
            h.handler(converse_event, ctx)
            h.handler(converse_event, ctx)

        assert len(captured_prompts) == 2, 'Agent must be invoked twice'
        assert 'Version 1' in captured_prompts[0], (
            f'First call must use Version 1. Got: {captured_prompts[0]!r}'
        )
        assert 'Version 2' in captured_prompts[1], (
            f'Second call must use Version 2 (no stale cache). Got: {captured_prompts[1]!r}'
        )
