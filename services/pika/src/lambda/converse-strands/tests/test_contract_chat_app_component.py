"""
CONTRACT TESTS: chat-app-component invocation mode for the Strands converse Lambda.

These tests are EXPECTED TO FAIL until chat-app-component mode is implemented.

Contract reference: services/pika/src/lambda/converse/index.ts:210-230 (validation)
                    packages/shared/src/util/instruction-assistance-utils.ts:generateComponentInstructionContent

Chat-app-component is an embedded-widget mode. Instead of a full chat page, the chat
backend is embedded in another product page (e.g., Orders dashboard). For each request
in this mode, the agent's base prompt is REPLACED by a tag definition's
componentAgentInstructionsMd[componentAgentInstructionName] content.

Wire contract (from request body):
  {
    "mode": "chat-app-component",
    "chatAppId": "<required>",
    "chatAppComponentConfig": {
      "componentAgentInstructionName": "<key into tagDef.componentAgentInstructionsMd>",
      "componentTagDefinition": { "scope": "<str>", "tag": "<str>" }
    },
    ...
  }

DDB source of truth: pika-tag-def-ai-bot-{stage}
  PK: scope (string)
  SK: tag   (string)
  Attribute: component_agent_instructions_md (Map<str, str>) — snake_case in DDB

Substitution semantics:
  - The resolved markdown becomes the agent system_prompt FOR THIS REQUEST ONLY.
  - The agent's own base_prompt from agent-definitions table is discarded in this mode.
  - The tag's placeholders (e.g., {{typescript-backed-output-formatting-requirements}})
    are substituted when instructionAssistanceConfig + agentInstructionFeature are in play.
    Placeholder substitution is a secondary concern; tests below focus on resolution.

Validation is STRICT — missing fields must return HTTP 400.
"""
import json
import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Validation: request shape
# ---------------------------------------------------------------------------

class TestChatAppComponentValidation:
    """Required-field validation for chat-app-component mode."""

    def test_rejects_missing_chat_app_id(self):
        """mode='chat-app-component' without chatAppId returns HTTP 400."""
        from handler import handler as lambda_handler  # noqa: PLC0415

        event = {'body': json.dumps({
            'mode': 'chat-app-component',
            'userId': 'u1',
            'message': 'hi',
            'chatAppComponentConfig': {
                'componentAgentInstructionName': 'default',
                'componentTagDefinition': {'scope': 'rcs', 'tag': 'orchestrator'},
            },
        })}
        resp = lambda_handler(event, MagicMock())
        assert resp.get('statusCode') == 400
        body_lower = resp.get('body', '').lower()
        assert 'chatappid' in body_lower or 'chat_app_id' in body_lower

    def test_rejects_missing_chat_app_component_config(self):
        """mode='chat-app-component' without chatAppComponentConfig returns HTTP 400."""
        from handler import handler as lambda_handler  # noqa: PLC0415

        event = {'body': json.dumps({
            'mode': 'chat-app-component',
            'chatAppId': 'rcs',
            'userId': 'u1',
            'message': 'hi',
        })}
        resp = lambda_handler(event, MagicMock())
        assert resp.get('statusCode') == 400

    def test_rejects_missing_component_agent_instruction_name(self):
        """chatAppComponentConfig without componentAgentInstructionName returns HTTP 400."""
        from handler import handler as lambda_handler  # noqa: PLC0415

        event = {'body': json.dumps({
            'mode': 'chat-app-component',
            'chatAppId': 'rcs',
            'userId': 'u1',
            'message': 'hi',
            'chatAppComponentConfig': {
                'componentTagDefinition': {'scope': 'rcs', 'tag': 'orchestrator'},
            },
        })}
        resp = lambda_handler(event, MagicMock())
        assert resp.get('statusCode') == 400

    def test_rejects_component_tag_definition_missing_scope_or_tag(self):
        """componentTagDefinition must have both scope and tag, else HTTP 400."""
        from handler import handler as lambda_handler  # noqa: PLC0415

        event = {'body': json.dumps({
            'mode': 'chat-app-component',
            'chatAppId': 'rcs',
            'userId': 'u1',
            'message': 'hi',
            'chatAppComponentConfig': {
                'componentAgentInstructionName': 'default',
                'componentTagDefinition': {'scope': 'rcs'},  # missing tag
            },
        })}
        resp = lambda_handler(event, MagicMock())
        assert resp.get('statusCode') == 400


# ---------------------------------------------------------------------------
# Tag def lookup + system_prompt substitution
# ---------------------------------------------------------------------------

class TestChatAppComponentInstructionResolution:
    """Contract: instruction resolution from tag def overrides agent base_prompt."""

    def test_resolves_instructions_from_tag_def(self):
        """Handler must fetch tag def (scope, tag) and read component_agent_instructions_md[name]."""
        from chat_app_component import resolve_component_instructions  # noqa: PLC0415

        tag_def = {
            'scope': 'rcs', 'tag': 'orchestrator',
            'component_agent_instructions_md': {
                'default': 'You are the RCS orchestrator. Help users list products.',
                'alt': 'Alternate instruction set.',
            },
        }
        result = resolve_component_instructions(tag_def, instruction_name='default')
        assert result == 'You are the RCS orchestrator. Help users list products.'

    def test_returns_none_when_instruction_name_missing(self):
        """Unknown instruction_name must return None (caller decides how to 404)."""
        from chat_app_component import resolve_component_instructions  # noqa: PLC0415

        tag_def = {
            'scope': 'rcs', 'tag': 'orchestrator',
            'component_agent_instructions_md': {'default': 'x'},
        }
        assert resolve_component_instructions(tag_def, instruction_name='missing') is None

    def test_returns_none_when_tag_has_no_component_instructions(self):
        """Tag def without component_agent_instructions_md must return None."""
        from chat_app_component import resolve_component_instructions  # noqa: PLC0415

        tag_def = {'scope': 'rcs', 'tag': 'orchestrator'}
        assert resolve_component_instructions(tag_def, instruction_name='default') is None

    def test_system_prompt_replaced_not_concatenated(self):
        """In component mode the resolved instructions REPLACE the agent's base_prompt.

        Substitution semantics: the Agent is invoked with system_prompt = resolved_instructions,
        not system_prompt = base_prompt + resolved_instructions.
        """
        from chat_app_component import build_component_system_prompt  # noqa: PLC0415

        agent_def = {'agent_id': 'rithum-bot', 'base_prompt': 'ORIGINAL BASE PROMPT'}
        resolved = 'OVERRIDDEN COMPONENT INSTRUCTIONS'
        result = build_component_system_prompt(agent_def, resolved_instructions=resolved)
        assert 'OVERRIDDEN COMPONENT INSTRUCTIONS' in result
        assert 'ORIGINAL BASE PROMPT' not in result


# ---------------------------------------------------------------------------
# End-to-end: mode routing integration
# ---------------------------------------------------------------------------

class TestChatAppComponentEndToEnd:
    """Contract: full request routing for chat-app-component mode."""

    def test_tag_def_fetched_from_correct_ddb_table(self):
        """Handler must fetch (scope, tag) from pika-tag-def-ai-bot-{stage}."""
        from handler import handler as lambda_handler  # noqa: PLC0415

        with patch('chat_app_component.fetch_tag_definition') as mock_fetch, \
             patch('handler.dynamodb'), \
             patch('handler.get_user', return_value={'user_id': 'u1', 'user_type': 'internal-user'}), \
             patch('handler.ensure_session'), \
             patch('handler.get_messages', return_value=[]), \
             patch('handler.add_message'), \
             patch('handler.load_agent', return_value={
                 'agent_id': 'rithum-bot', 'base_prompt': 'BASE', 'foundation_model': 'test-model',
                 'tool_ids': [], 'collaborators': [],
             }), \
             patch('handler.Agent'):
            mock_fetch.return_value = {
                'scope': 'rcs', 'tag': 'orchestrator',
                'component_agent_instructions_md': {'default': 'inst'},
            }
            event = {'body': json.dumps({
                'mode': 'chat-app-component',
                'chatAppId': 'rcs',
                'userId': 'u1', 'agentId': 'rithum-bot', 'sessionId': 's1',
                'message': 'hi',
                'chatAppComponentConfig': {
                    'componentAgentInstructionName': 'default',
                    'componentTagDefinition': {'scope': 'rcs', 'tag': 'orchestrator'},
                },
            })}
            lambda_handler(event, MagicMock())
            mock_fetch.assert_called_once_with(scope='rcs', tag='orchestrator')
