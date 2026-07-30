"""
chat-app-component invocation mode support.

When a request arrives in chat-app-component mode (the wire field is
`invocationMode`; see invocation_mode.py), the agent's base_prompt is
REPLACED by a tag definition's component_agent_instructions_md[name] content for
that single request. This supports embedded-widget deployments where one agent
is reused across N embedded surfaces, each with its own scoped system prompt.

Used by: handler.py request flow.
Contract: tests/test_contract_chat_app_component.py
TS reference: services/pika/src/lambda/converse/index.ts:210-230
              packages/shared/src/util/instruction-assistance-utils.ts
"""
import logging
import os

logger = logging.getLogger(__name__)

CHAT_APP_COMPONENT_MODE = 'chat-app-component'


def validate_chat_app_component_request(body: dict) -> str | None:
    """Return an error message if the request is malformed for chat-app-component mode.

    Returns None when valid. Caller must surface the error as HTTP 400.
    """
    if not body.get('chatAppId'):
        return 'chatAppId is required for chat-app-component mode'

    cfg = body.get('chatAppComponentConfig')
    if not isinstance(cfg, dict):
        return 'chatAppComponentConfig is required for chat-app-component mode'

    if not cfg.get('componentAgentInstructionName'):
        return 'componentAgentInstructionName is required in chatAppComponentConfig'

    tag_def = cfg.get('componentTagDefinition')
    if not isinstance(tag_def, dict):
        return 'componentTagDefinition is required in chatAppComponentConfig'

    if not tag_def.get('scope') or not tag_def.get('tag'):
        return 'componentTagDefinition must have both scope and tag'

    return None


def fetch_tag_definition(scope: str, tag: str) -> dict | None:
    """Fetch a single tag definition by (scope, tag) from the tag definitions table.

    Returns the DDB item (snake_case fields) or None if not found.
    """
    import handler  # late import to avoid circular dep at module load

    if handler.dynamodb is None or not handler.TAG_DEFINITIONS_TABLE:
        logger.warning('Tag definitions table unavailable; cannot fetch component tag')
        return None

    try:
        table = handler.dynamodb.Table(handler.TAG_DEFINITIONS_TABLE)
        response = table.get_item(Key={'scope': scope, 'tag': tag})
        return response.get('Item')
    except Exception as e:
        logger.warning(f'Failed to fetch tag definition {scope}/{tag}: {e}')
        return None


def resolve_component_instructions(tag_def: dict | None, instruction_name: str) -> str | None:
    """Look up instruction_name in the tag def's component_agent_instructions_md map.

    Returns the raw instruction markdown or None when the tag has no component
    instructions or the name is absent.
    """
    if not tag_def:
        return None

    instructions_map = (
        tag_def.get('component_agent_instructions_md')
        or tag_def.get('componentAgentInstructionsMd')
    )
    if not isinstance(instructions_map, dict):
        return None

    return instructions_map.get(instruction_name)


def build_component_system_prompt(agent_def: dict, resolved_instructions: str) -> str:
    """Return the system prompt for a chat-app-component request.

    The resolved instructions REPLACE the agent's base_prompt entirely — this is
    the whole point of component mode. The agent_def is accepted so callers can
    evolve the signature (e.g., to layer tags back on) without a breaking change.
    """
    _ = agent_def  # accepted for future extension, intentionally unused
    return resolved_instructions
