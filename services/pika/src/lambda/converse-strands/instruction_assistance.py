"""Instruction Assistance — port of TS applyInstructionAssistance flow.

Contract: tests/test_contract_instruction_assistance.py

Mirrors packages/shared/src/util/instruction-assistance-utils.ts. When a
chat app has features.agentInstructionAssistance.enabled, the base prompt
may contain placeholders — `{{prompt-assistance}}` (primary) or one of
`{{output-formatting-requirements}}`, `{{tag-instructions}}`,
`{{complete-example-instruction-line}}`, `{{json-only-imperative-instruction-line}}`
(fine-grained) — that get replaced with content derived from SSM config
+ per-sub-flag gating on the feature object. If no placeholders are
present, the combined content is appended to the end of the prompt.

When the feature is disabled, prompts pass through unchanged (so a
literal `{{prompt-assistance}}` marker survives — same as TS).
"""
import logging
import os
from typing import Any, Dict, Optional

import boto3

logger = logging.getLogger(__name__)

# SSM path holds 4 params the TS converse Lambda also reads:
#   output-formatting-requirements
#   default-complete-example-line
#   default-json-validation-line
#   typescript-backed-output-formatting-requirements
_STAGE = os.environ.get('STAGE', 'test')
_PROJ = os.environ.get('PIKA_SERVICE_PROJ_NAME_KEBAB_CASE', 'ai-bot')
_SSM_PATH = f'/stack/{_PROJ}/{_STAGE}/instruction-assistance'

# Module-level cache — single fetch per warm container. Cleared via
# clear_config_cache() when the admin sends a cacheType='instructionAssistanceConfig'
# clear-cache command.
_config_cache: Optional[Dict[str, str]] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_enabled(value: Any) -> bool:
    """Accept both plain-boolean and nested-{enabled: bool} shapes.

    The TS interface `AgentInstructionChatAppOverridableFeature` declares
    sub-flags as plain booleans, but the admin UI writes them as
    `{enabled: bool}` objects. In practice both shapes appear on the wire.
    """
    if isinstance(value, dict):
        return bool(value.get('enabled'))
    return bool(value)


_DEFAULT_OUTPUT_FORMATTING = (
    '**Output Formatting Requirements:**\n'
    '- **Output Response Enclosure**: All response output MUST be completely '
    'enclosed within <answer></answer> tags, including supported custom tags.\n'
    '- **Output Content Format:** All responses MUST be in Markdown with '
    'supported custom tags.'
)

_DEFAULT_COMPLETE_EXAMPLE = (
    '- **Complete Example Output:**\n'
    '  `<answer>##Example markdown\nNormal text and an '
    '<image>http://some.url</image> and some **bold text**\n'
    '<chart>(...)</chart></answer>`'
)

_DEFAULT_JSON_VALIDITY = (
    'BE ABSOLUTELY CERTAIN ANY JSON INCLUDED IS 100% VALID (especially for '
    'charts). Invalid JSON will break the user experience.'
)


# ---------------------------------------------------------------------------
# SSM loader
# ---------------------------------------------------------------------------

def load_instruction_assistance_config() -> Dict[str, str]:
    """Fetch the 4 instruction-assistance SSM parameters, cached module-level.

    Returns an empty dict on SSM failure so the generator can fall through
    to defaults. Never raises.
    """
    global _config_cache
    if _config_cache is not None:
        return _config_cache

    try:
        ssm = boto3.client('ssm')
        response = ssm.get_parameters_by_path(
            Path=_SSM_PATH, Recursive=True, WithDecryption=False,
        )
        params = {
            p['Name'].rsplit('/', 1)[-1]: p['Value']
            for p in response.get('Parameters', [])
        }
        _config_cache = {
            'outputFormattingRequirements': params.get('output-formatting-requirements', ''),
            'completeExampleInstructionLine': params.get('default-complete-example-line', ''),
            'jsonOnlyImperativeInstructionLine': params.get('default-json-validation-line', ''),
            'typescriptBackedOutputFormattingRequirements': params.get(
                'typescript-backed-output-formatting-requirements', ''),
        }
        logger.info(
            f"Instruction assistance config loaded from SSM: "
            f"{len(_config_cache)} params, "
            f"OFR={'set' if _config_cache['outputFormattingRequirements'] else 'default'}"
        )
        return _config_cache
    except Exception as e:
        logger.warning(f"Failed to load instruction assistance config from SSM: {e}")
        _config_cache = {}
        return _config_cache


def clear_config_cache() -> None:
    """Invalidate the cached config so the next request re-fetches from SSM."""
    global _config_cache
    _config_cache = None
    logger.info('Instruction assistance config cache cleared')


# ---------------------------------------------------------------------------
# Content generation
# ---------------------------------------------------------------------------

def generate_instruction_assistance_content(
    config: Dict[str, str],
    feature: Dict[str, Any],
    tag_instructions: str,
) -> Dict[str, str]:
    """Compose the 5 instruction-assistance fields from SSM config + feature flags.

    Returns a dict with keys matching the TS InstructionAssistanceConfig:
      outputFormattingRequirements, tagInstructions,
      completeExampleInstructionLine, jsonOnlyImperativeInstructionLine,
      typescriptBackedOutputFormattingRequirements

    Any field whose per-sub-flag gate is off returns an empty string.
    `tag_instructions` is passed in pre-rendered (the caller already has
    `_build_tag_instructions` output in hand) so this module doesn't need
    to re-implement tag filtering.
    """
    empty = {
        'outputFormattingRequirements': '',
        'tagInstructions': '',
        'completeExampleInstructionLine': '',
        'jsonOnlyImperativeInstructionLine': '',
        'typescriptBackedOutputFormattingRequirements': '',
    }

    if not _is_enabled(feature.get('enabled')):
        return empty

    content = dict(empty)

    if _is_enabled(feature.get('includeOutputFormattingRequirements')):
        content['outputFormattingRequirements'] = (
            config.get('outputFormattingRequirements') or _DEFAULT_OUTPUT_FORMATTING
        )

    if _is_enabled(feature.get('includeInstructionsForTags')) and tag_instructions:
        content['tagInstructions'] = tag_instructions

    if _is_enabled(feature.get('completeExampleInstructionEnabled')):
        # Feature-level override wins over SSM, which wins over default.
        override = feature.get('completeExampleInstructionLine')
        if isinstance(override, str) and override:
            content['completeExampleInstructionLine'] = override
        else:
            content['completeExampleInstructionLine'] = (
                config.get('completeExampleInstructionLine') or _DEFAULT_COMPLETE_EXAMPLE
            )

    if _is_enabled(feature.get('jsonOnlyImperativeInstructionEnabled')):
        override = feature.get('jsonOnlyImperativeInstructionLine')
        if isinstance(override, str) and override:
            content['jsonOnlyImperativeInstructionLine'] = override
        else:
            content['jsonOnlyImperativeInstructionLine'] = (
                config.get('jsonOnlyImperativeInstructionLine') or _DEFAULT_JSON_VALIDITY
            )

    if _is_enabled(feature.get('includeTypescriptBackedOutputFormattingRequirements')):
        content['typescriptBackedOutputFormattingRequirements'] = (
            config.get('typescriptBackedOutputFormattingRequirements') or ''
        )

    return content


# ---------------------------------------------------------------------------
# Placeholder substitution
# ---------------------------------------------------------------------------

_PRIMARY_PLACEHOLDER = '{{prompt-assistance}}'
_FINE_GRAINED = [
    ('{{output-formatting-requirements}}', 'outputFormattingRequirements'),
    ('{{tag-instructions}}', 'tagInstructions'),
    ('{{complete-example-instruction-line}}', 'completeExampleInstructionLine'),
    ('{{json-only-imperative-instruction-line}}', 'jsonOnlyImperativeInstructionLine'),
]


def apply_instruction_assistance(
    base_prompt: str,
    content: Dict[str, str],
) -> str:
    """Apply instruction-assistance content to the base prompt.

    Three modes, matching TS applyInstructionAssistance:
      1. `{{prompt-assistance}}` present → replace with concatenated non-empty
         content fields. Fine-grained placeholders are left alone (TS
         behavior — the primary pass doesn't run the fine-grained loop).
      2. Primary absent, fine-grained present → replace each individually
         where its content field is non-empty.
      3. No placeholders, non-empty content → append combined content
         to the end of the prompt.
      4. No placeholders, all content empty → return unchanged.
    """
    if _PRIMARY_PLACEHOLDER in base_prompt:
        combined = '\n\n'.join(
            v for v in (
                content.get('outputFormattingRequirements', ''),
                content.get('tagInstructions', ''),
                content.get('completeExampleInstructionLine', ''),
                content.get('jsonOnlyImperativeInstructionLine', ''),
            ) if v and v.strip()
        )
        return base_prompt.replace(_PRIMARY_PLACEHOLDER, combined)

    enhanced = base_prompt
    any_placeholder_replaced = False
    for placeholder, key in _FINE_GRAINED:
        value = content.get(key, '')
        if placeholder in enhanced and value:
            enhanced = enhanced.replace(placeholder, value)
            any_placeholder_replaced = True

    if any_placeholder_replaced:
        return enhanced

    # Fall-through: no placeholders present, append combined content.
    combined_parts = [
        v for v in (
            content.get('outputFormattingRequirements', ''),
            content.get('tagInstructions', ''),
            content.get('completeExampleInstructionLine', ''),
            content.get('jsonOnlyImperativeInstructionLine', ''),
        ) if v and v.strip()
    ]
    if combined_parts:
        return base_prompt + '\n\n' + '\n\n'.join(combined_parts)
    return base_prompt
