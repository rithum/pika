"""
CONTRACT TESTS: Invocation mode routing.

These tests are EXPECTED TO FAIL until invocation mode routing is implemented.

Contract reference: services/pika/src/lambda/converse/index.ts (mode determination block)

Supported modes:
  - "chat-app"             : standard full-page chat app (requires chatAppId)
  - "direct-agent-invoke"  : programmatic agent invoke (no chatAppId; agent selected by agentId)
  - "chat-app-component"   : embedded widget (covered by test_contract_chat_app_component.py)

Mode determination precedence:
  1. If request.mode is explicitly set, use it (and validate per-mode requirements).
  2. Else, if chatAppId is present → infer mode='chat-app'.
  3. Else → infer mode='direct-agent-invoke'.

Per-mode validation:
  - chat-app:            requires chatAppId, agentId, userId, message, sessionId
  - direct-agent-invoke: requires agentId, userId, message, sessionId (chatAppId optional — falls back to agentId)
  - chat-app-component:  see chat_app_component contract (requires chatAppComponentConfig)

Invalid modes must return HTTP 400.
"""
import json
import pytest
from unittest.mock import MagicMock


# ---------------------------------------------------------------------------
# Inference (when mode not explicitly set)
# ---------------------------------------------------------------------------

class TestInvocationModeInference:

    def test_infers_chat_app_when_chat_app_id_present(self):
        from invocation_mode import determine_mode  # noqa: PLC0415

        body = {'chatAppId': 'rcs', 'agentId': 'a', 'userId': 'u', 'message': 'm', 'sessionId': 's'}
        assert determine_mode(body) == 'chat-app'

    def test_infers_direct_agent_invoke_without_chat_app_id(self):
        from invocation_mode import determine_mode  # noqa: PLC0415

        body = {'agentId': 'a', 'userId': 'u', 'message': 'm', 'sessionId': 's'}
        assert determine_mode(body) == 'direct-agent-invoke'

    def test_explicit_mode_wins_over_inference(self):
        from invocation_mode import determine_mode  # noqa: PLC0415

        body = {'mode': 'direct-agent-invoke', 'chatAppId': 'rcs', 'agentId': 'a',
                'userId': 'u', 'message': 'm', 'sessionId': 's'}
        assert determine_mode(body) == 'direct-agent-invoke'


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class TestInvocationModeValidation:

    def test_unknown_mode_rejected_400(self):
        from handler import handler as lambda_handler  # noqa: PLC0415

        event = {'body': json.dumps({
            'mode': 'not-a-real-mode',
            'agentId': 'a', 'userId': 'u', 'message': 'm', 'sessionId': 's',
        })}
        resp = lambda_handler(event, MagicMock())
        assert resp.get('statusCode') == 400

    def test_chat_app_mode_requires_chat_app_id(self):
        from handler import handler as lambda_handler  # noqa: PLC0415

        event = {'body': json.dumps({
            'mode': 'chat-app',
            'agentId': 'a', 'userId': 'u', 'message': 'm', 'sessionId': 's',
        })}
        resp = lambda_handler(event, MagicMock())
        assert resp.get('statusCode') == 400

    def test_direct_agent_invoke_does_not_require_chat_app_id(self):
        """direct-agent-invoke must succeed (at validation) without chatAppId."""
        from invocation_mode import validate_for_mode  # noqa: PLC0415

        body = {'mode': 'direct-agent-invoke', 'agentId': 'a', 'userId': 'u',
                'message': 'm', 'sessionId': 's'}
        # validate_for_mode must not raise
        errors = validate_for_mode(body)
        assert errors == [] or errors is None

    def test_chat_app_id_falls_back_to_agent_id_for_direct_invoke(self):
        """For direct-agent-invoke, chat_app_id defaults to agent_id when not supplied.

        This preserves the existing TS behavior where downstream session/message records
        always carry a chat_app_id value.
        """
        from invocation_mode import resolve_chat_app_id  # noqa: PLC0415

        body = {'mode': 'direct-agent-invoke', 'agentId': 'order-analyzer-2',
                'userId': 'u', 'message': 'm', 'sessionId': 's'}
        assert resolve_chat_app_id(body) == 'order-analyzer-2'
