"""
CONTRACT TESTS: Intent Router for the Strands converse Lambda.

These tests are EXPECTED TO FAIL until the Intent Router is implemented.

Contract reference: services/pika/src/lambda/converse/index.ts:828-990

Intent Router runs BEFORE the agent. When enabled, it matches the user message
against tag-defined commands and routes the request without invoking Bedrock
(except in 'direct' mode with passToAgent=True).

Feature gate: features.intentRouter.enabled == True AND mode == 'chat-app'

Commands are loaded from tag definitions in pika-tag-def-ai-bot-{stage} where
tag_def.intent_router_commands is a list of:
  {
    "command_id": str,
    "name": str,
    "description": str,
    "examples": [str, ...],           # positive examples for matching
    "anti_examples": [str, ...],      # negative examples
    "priority": int,                  # higher wins ties
    "execution": {
      "mode": "direct" | "dispatch",  # routing behavior
      "handler_tag_id": str,          # which widget handles dispatch
      "payload": dict,                # handler payload
      "response_template": str,       # template for user-visible response
      "pass_to_agent": bool           # only relevant when mode='direct'
    }
  }

Route results (direct | dispatch | passthrough):
  - direct:      execute locally, stream response; if pass_to_agent=False, exit early
  - dispatch:    stream dispatch event for client-side widget; no Bedrock call
  - passthrough: fall through to normal agent flow

Confidence gate: features.intentRouter.confidenceThreshold (default 0.85)
  - Matches below threshold return passthrough
"""
import json
import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Feature gating
# ---------------------------------------------------------------------------

class TestIntentRouterFeatureGating:

    def test_disabled_when_feature_flag_off(self):
        """Intent Router must be bypassed when features.intentRouter.enabled is False."""
        from intent_router import should_run  # noqa: PLC0415

        features = {'intentRouter': {'enabled': False, 'confidenceThreshold': 0.85}}
        assert should_run(features=features, mode='chat-app') is False

    def test_disabled_for_non_chat_app_mode(self):
        """Intent Router must only run in mode='chat-app'."""
        from intent_router import should_run  # noqa: PLC0415

        features = {'intentRouter': {'enabled': True, 'confidenceThreshold': 0.85}}
        assert should_run(features=features, mode='direct-agent-invoke') is False
        assert should_run(features=features, mode='chat-app-component') is False

    def test_enabled_for_chat_app_with_flag(self):
        from intent_router import should_run  # noqa: PLC0415

        features = {'intentRouter': {'enabled': True, 'confidenceThreshold': 0.85}}
        assert should_run(features=features, mode='chat-app') is True


# ---------------------------------------------------------------------------
# Command loading + matching
# ---------------------------------------------------------------------------

COMMAND_SAMPLE = {
    'command_id': 'view_jobs',
    'name': 'View Jobs List',
    'description': 'User wants to see their list of jobs',
    'examples': ['show me my jobs', 'view my jobs', 'list my jobs'],
    'anti_examples': ['what is a job', 'how do jobs work'],
    'priority': 100,
    'execution': {
        'mode': 'dispatch',
        'handler_tag_id': 'rcs.orchestrator',
        'payload': {'action': 'view_jobs'},
        'response_template': 'Opening your jobs...',
    },
}


class TestIntentRouterCommandLoading:

    def test_aggregates_commands_from_tag_defs(self):
        """load_commands_for_chat_app() must union intent_router_commands across all enabled
        tag defs scoped to the chat app."""
        from intent_router import load_commands_for_chat_app  # noqa: PLC0415

        tag_defs = [
            {'scope': 'rcs', 'tag': 'a', 'intent_router_commands': [COMMAND_SAMPLE]},
            {'scope': 'rcs', 'tag': 'b', 'intent_router_commands': [dict(COMMAND_SAMPLE, command_id='other')]},
            {'scope': 'rcs', 'tag': 'c'},  # no commands
        ]
        commands = load_commands_for_chat_app(chat_app_id='rcs', tag_defs=tag_defs)
        ids = {c['command_id'] for c in commands}
        assert ids == {'view_jobs', 'other'}

    def test_cache_keyed_by_chat_app_id(self):
        """Commands must be cached per chat_app_id. Clearing via cacheType='intentRouterCommands'
        invalidates the cache."""
        from intent_router import get_commands_cached, clear_intent_router_cache  # noqa: PLC0415

        calls = []
        def loader():
            calls.append(1)
            return [COMMAND_SAMPLE]

        get_commands_cached('rcs', loader)
        get_commands_cached('rcs', loader)
        assert len(calls) == 1, 'cache must hit on 2nd call'

        clear_intent_router_cache()
        get_commands_cached('rcs', loader)
        assert len(calls) == 2, 'clear_intent_router_cache must invalidate'


# ---------------------------------------------------------------------------
# Route results
# ---------------------------------------------------------------------------

class TestIntentRouterRoutingResults:

    def test_dispatch_mode_returns_dispatch_result(self):
        """A matched command with execution.mode='dispatch' returns type='dispatch'."""
        from intent_router import route  # noqa: PLC0415

        result = route(
            message='show me my jobs',
            commands=[COMMAND_SAMPLE],
            confidence_threshold=0.85,
        )
        assert result['type'] == 'dispatch'
        assert result['command_id'] == 'view_jobs'
        assert result['response'] == 'Opening your jobs...'
        assert result['payload'] == {'action': 'view_jobs'}

    def test_direct_mode_with_pass_to_agent_false_returns_early_exit(self):
        # Use a command whose examples match the test message so the classifier
        # actually routes (TS intent router also requires example match).
        cmd = dict(COMMAND_SAMPLE,
                   command_id='help',
                   examples=['help me', 'i need help'],
                   execution={'mode': 'direct', 'pass_to_agent': False,
                              'response_template': 'Here is help.'})
        from intent_router import route  # noqa: PLC0415

        result = route(message='help me', commands=[cmd], confidence_threshold=0.85)
        assert result['type'] == 'direct'
        assert result['pass_to_agent'] is False

    def test_direct_mode_with_pass_to_agent_true_continues(self):
        cmd = dict(COMMAND_SAMPLE, execution={'mode': 'direct', 'pass_to_agent': True,
                                              'response_template': 'Ack'})
        from intent_router import route  # noqa: PLC0415

        result = route(message='show me my jobs', commands=[cmd], confidence_threshold=0.85)
        assert result['type'] == 'direct'
        assert result['pass_to_agent'] is True

    def test_no_match_returns_passthrough(self):
        from intent_router import route  # noqa: PLC0415

        result = route(message='completely unrelated gibberish xyzzy', commands=[COMMAND_SAMPLE],
                       confidence_threshold=0.85)
        assert result['type'] == 'passthrough'

    def test_anti_examples_block_match(self):
        from intent_router import route  # noqa: PLC0415

        result = route(message='what is a job', commands=[COMMAND_SAMPLE], confidence_threshold=0.5)
        assert result['type'] == 'passthrough', (
            'anti_example message must not match even at low threshold'
        )


# ---------------------------------------------------------------------------
# Cache clear — intentRouterCommands type
# ---------------------------------------------------------------------------

class TestCacheClear:

    def test_cache_type_clears_intent_router(self):
        """Handler must accept cacheType='intentRouterCommands' and invalidate the command cache."""
        from handler import _clear_cache  # noqa: PLC0415
        from intent_router import _command_cache  # noqa: PLC0415

        _command_cache['rcs'] = [COMMAND_SAMPLE]
        _clear_cache(cache_type='intentRouterCommands')
        assert 'rcs' not in _command_cache
