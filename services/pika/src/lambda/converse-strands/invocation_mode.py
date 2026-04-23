"""Invocation mode routing for the Strands converse handler.

Contract: tests/test_contract_invocation_mode.py

Mirrors the mode-determination block in the TS converse Lambda
(services/pika/src/lambda/converse/index.ts). Three supported modes:

  CHAT_APP              standard full-page chat app (requires chatAppId)
  DIRECT_AGENT_INVOKE   programmatic invoke (no chatAppId; falls back to agentId)
  CHAT_APP_COMPONENT    embedded widget (validated separately in chat_app_component.py)

Precedence: explicit body.mode wins; otherwise chatAppId→chat-app; otherwise
direct-agent-invoke.
"""
from typing import Any, Dict, List, Optional

CHAT_APP = 'chat-app'
DIRECT_AGENT_INVOKE = 'direct-agent-invoke'
CHAT_APP_COMPONENT = 'chat-app-component'

SUPPORTED_MODES = (CHAT_APP, DIRECT_AGENT_INVOKE, CHAT_APP_COMPONENT)


def determine_mode(body: Dict[str, Any]) -> str:
    """Return the active invocation mode for this request.

    Explicit `body.mode` wins (even if invalid — validation is a separate step).
    Otherwise infer from presence of chatAppId.
    """
    explicit = body.get('mode')
    if explicit:
        return explicit
    if body.get('chatAppId'):
        return CHAT_APP
    return DIRECT_AGENT_INVOKE


def validate_for_mode(body: Dict[str, Any]) -> List[str]:
    """Return a list of validation error messages for the given request body.

    Empty list means the body is valid for its mode. Does NOT enforce
    chat-app-component config — that lives in chat_app_component.py so the
    component-specific error messages stay co-located.
    """
    errors: List[str] = []
    mode = determine_mode(body)

    if mode not in SUPPORTED_MODES:
        errors.append(f"Unsupported mode '{mode}'. Supported: {', '.join(SUPPORTED_MODES)}")
        return errors

    # Common requirements across every mode.
    if not body.get('agentId'):
        errors.append("agentId is required")
    if not body.get('userId'):
        errors.append("userId is required")

    if mode == CHAT_APP and not body.get('chatAppId'):
        errors.append("chatAppId is required for mode 'chat-app'")

    return errors


def resolve_chat_app_id(body: Dict[str, Any]) -> Optional[str]:
    """Resolve the effective chat_app_id for this request.

    For chat-app / chat-app-component it's the body's chatAppId. For
    direct-agent-invoke it falls back to agentId so downstream session/message
    records always carry a non-null chat_app_id value.
    """
    explicit = body.get('chatAppId')
    if explicit:
        return explicit
    mode = determine_mode(body)
    if mode == DIRECT_AGENT_INVOKE:
        return body.get('agentId')
    return None
