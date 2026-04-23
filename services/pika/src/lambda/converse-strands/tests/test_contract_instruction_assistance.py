"""
CONTRACT TESTS: Instruction Assistance (features.agentInstructionAssistance).

Ports the TS `instruction-assistance-utils` flow to Strands — see
packages/shared/src/util/instruction-assistance-utils.ts and
services/pika/src/lambda/converse/index.ts:1044-1096.

Observable behavior:
  - When features.agentInstructionAssistance.enabled and the base_prompt
    contains `{{prompt-assistance}}`, the placeholder is replaced with
    concatenated instruction-assistance content (output formatting
    requirements + tag instructions + complete-example line +
    json-validity imperative), each filtered by its per-feature flag.
  - Fine-grained placeholders (`{{output-formatting-requirements}}`,
    `{{tag-instructions}}`, `{{complete-example-instruction-line}}`,
    `{{json-only-imperative-instruction-line}}`) are replaced individually
    when present.
  - When no placeholder is present, the combined content is appended to
    the end of the prompt.
  - When the feature is disabled, the prompt is returned unchanged — the
    literal `{{prompt-assistance}}` marker passes through.
  - Per-sub-flag gating: if includeInstructionsForTags is false, tag
    instructions are not included even if the feature is enabled and
    tag_defs are available.
  - Empty/missing fields from the SSM config fall through to the default
    strings compiled into generate_instruction_assistance_content.
"""
import pytest
from unittest.mock import MagicMock, patch


SSM_CONFIG = {
    'outputFormattingRequirements': 'OFR_MARKER: enclose answers in <answer> tags.',
    'completeExampleInstructionLine': 'CELI_MARKER: example output here.',
    'jsonOnlyImperativeInstructionLine': 'JVLI_MARKER: JSON must be valid.',
    'typescriptBackedOutputFormattingRequirements': 'TBOFR_MARKER: typescript-backed only.',
}


FEATURE_FULL = {
    'enabled': True,
    'includeOutputFormattingRequirements': True,
    'includeInstructionsForTags': True,
    'completeExampleInstructionEnabled': True,
    'jsonOnlyImperativeInstructionEnabled': True,
    'includeTypescriptBackedOutputFormattingRequirements': True,
}


FEATURE_NESTED = {
    # Admin UI writes sub-flags as {enabled: bool} objects; loader must
    # accept both plain-bool and nested-dict shapes.
    'enabled': True,
    'includeOutputFormattingRequirements': {'enabled': True},
    'includeInstructionsForTags': {'enabled': True},
    'completeExampleInstructionEnabled': {'enabled': True},
    'jsonOnlyImperativeInstructionEnabled': {'enabled': True},
}


FEATURE_DISABLED = {'enabled': False}


TAG_INSTRUCTIONS = 'TAG_INSTR_MARKER: custom tag rules here.'


# ---------------------------------------------------------------------------
# generate_instruction_assistance_content
# ---------------------------------------------------------------------------

class TestGenerateContent:

    def test_disabled_feature_returns_empty_content(self):
        """When features.agentInstructionAssistance.enabled is false, every
        field in the returned content is empty regardless of SSM config."""
        from instruction_assistance import generate_instruction_assistance_content  # noqa: PLC0415

        content = generate_instruction_assistance_content(
            SSM_CONFIG, FEATURE_DISABLED, TAG_INSTRUCTIONS,
        )
        assert all(v == '' for v in content.values()), (
            f"All fields must be empty when feature is disabled. Got: {content!r}"
        )

    def test_all_flags_on_produces_all_content(self):
        from instruction_assistance import generate_instruction_assistance_content  # noqa: PLC0415

        content = generate_instruction_assistance_content(
            SSM_CONFIG, FEATURE_FULL, TAG_INSTRUCTIONS,
        )
        assert 'OFR_MARKER' in content['outputFormattingRequirements']
        assert 'TAG_INSTR_MARKER' in content['tagInstructions']
        assert 'CELI_MARKER' in content['completeExampleInstructionLine']
        assert 'JVLI_MARKER' in content['jsonOnlyImperativeInstructionLine']

    def test_accepts_nested_enabled_shape_from_admin_ui(self):
        """The admin UI writes sub-flags as {enabled: bool} objects; the
        TS type and defaults expect plain booleans. Accept both."""
        from instruction_assistance import generate_instruction_assistance_content  # noqa: PLC0415

        content = generate_instruction_assistance_content(
            SSM_CONFIG, FEATURE_NESTED, TAG_INSTRUCTIONS,
        )
        assert 'OFR_MARKER' in content['outputFormattingRequirements']
        assert 'TAG_INSTR_MARKER' in content['tagInstructions']

    def test_per_flag_gating_output_formatting(self):
        from instruction_assistance import generate_instruction_assistance_content  # noqa: PLC0415

        feature = {**FEATURE_FULL, 'includeOutputFormattingRequirements': False}
        content = generate_instruction_assistance_content(
            SSM_CONFIG, feature, TAG_INSTRUCTIONS,
        )
        assert content['outputFormattingRequirements'] == ''
        assert content['tagInstructions'] != ''

    def test_per_flag_gating_tag_instructions(self):
        from instruction_assistance import generate_instruction_assistance_content  # noqa: PLC0415

        feature = {**FEATURE_FULL, 'includeInstructionsForTags': False}
        content = generate_instruction_assistance_content(
            SSM_CONFIG, feature, TAG_INSTRUCTIONS,
        )
        assert content['tagInstructions'] == ''
        assert content['outputFormattingRequirements'] != ''

    def test_default_strings_when_ssm_config_missing_fields(self):
        """SSM parameters may be missing or empty — the generator must fall
        back to compiled-in defaults so the feature remains functional."""
        from instruction_assistance import generate_instruction_assistance_content  # noqa: PLC0415

        content = generate_instruction_assistance_content(
            {}, FEATURE_FULL, TAG_INSTRUCTIONS,
        )
        # Defaults should contain <answer> wording
        assert '<answer>' in content['outputFormattingRequirements']
        assert 'JSON' in content['jsonOnlyImperativeInstructionLine']

    def test_feature_level_line_overrides_ssm(self):
        """If the feature config carries its own completeExampleInstructionLine
        or jsonOnlyImperativeInstructionLine, those win over SSM values."""
        from instruction_assistance import generate_instruction_assistance_content  # noqa: PLC0415

        feature = {**FEATURE_FULL,
                   'completeExampleInstructionLine': 'OVERRIDE_CELI',
                   'jsonOnlyImperativeInstructionLine': 'OVERRIDE_JVLI'}
        content = generate_instruction_assistance_content(
            SSM_CONFIG, feature, TAG_INSTRUCTIONS,
        )
        assert content['completeExampleInstructionLine'] == 'OVERRIDE_CELI'
        assert content['jsonOnlyImperativeInstructionLine'] == 'OVERRIDE_JVLI'


# ---------------------------------------------------------------------------
# apply_instruction_assistance — placeholder replacement
# ---------------------------------------------------------------------------

CONTENT_FULL = {
    'outputFormattingRequirements': 'OFR_BODY',
    'tagInstructions': 'TAG_BODY',
    'completeExampleInstructionLine': 'CELI_BODY',
    'jsonOnlyImperativeInstructionLine': 'JVLI_BODY',
    'typescriptBackedOutputFormattingRequirements': '',
}


class TestApplyInstructionAssistance:

    def test_primary_placeholder_replaced_with_combined_content(self):
        from instruction_assistance import apply_instruction_assistance  # noqa: PLC0415

        base = 'System prompt.\n\n{{prompt-assistance}}\n\nEnd.'
        result = apply_instruction_assistance(base, CONTENT_FULL)
        assert '{{prompt-assistance}}' not in result
        for marker in ('OFR_BODY', 'TAG_BODY', 'CELI_BODY', 'JVLI_BODY'):
            assert marker in result, f"Combined content must include {marker}"

    def test_primary_placeholder_filters_empty_content(self):
        """Empty fields in the content dict must not produce extra blank
        lines in the combined output."""
        from instruction_assistance import apply_instruction_assistance  # noqa: PLC0415

        content = {**CONTENT_FULL, 'tagInstructions': '', 'completeExampleInstructionLine': ''}
        base = '{{prompt-assistance}}'
        result = apply_instruction_assistance(base, content)
        assert 'OFR_BODY' in result and 'JVLI_BODY' in result
        # No triple-newlines from empty joins
        assert '\n\n\n' not in result

    def test_fine_grained_placeholders_replaced_individually(self):
        from instruction_assistance import apply_instruction_assistance  # noqa: PLC0415

        base = (
            'X {{output-formatting-requirements}} Y '
            '{{tag-instructions}} Z '
            '{{complete-example-instruction-line}} W '
            '{{json-only-imperative-instruction-line}} END'
        )
        result = apply_instruction_assistance(base, CONTENT_FULL)
        assert 'X OFR_BODY Y TAG_BODY Z CELI_BODY W JVLI_BODY END' == result

    def test_primary_placeholder_wins_over_fine_grained(self):
        """When both {{prompt-assistance}} and fine-grained placeholders
        are present, the primary placeholder path runs and fine-grained
        placeholders are left alone (to match TS behavior)."""
        from instruction_assistance import apply_instruction_assistance  # noqa: PLC0415

        base = '{{prompt-assistance}}\n{{tag-instructions}}'
        result = apply_instruction_assistance(base, CONTENT_FULL)
        assert 'OFR_BODY' in result  # primary expanded
        # Fine-grained placeholder remains — TS doesn't run both passes
        assert '{{tag-instructions}}' in result

    def test_no_placeholder_appends_to_end(self):
        from instruction_assistance import apply_instruction_assistance  # noqa: PLC0415

        base = 'Original system prompt with no placeholders.'
        result = apply_instruction_assistance(base, CONTENT_FULL)
        assert result.startswith(base)
        for marker in ('OFR_BODY', 'TAG_BODY', 'CELI_BODY', 'JVLI_BODY'):
            assert marker in result

    def test_no_placeholder_all_empty_content_leaves_prompt_unchanged(self):
        from instruction_assistance import apply_instruction_assistance  # noqa: PLC0415

        empty_content = {k: '' for k in CONTENT_FULL}
        base = 'Plain prompt.'
        result = apply_instruction_assistance(base, empty_content)
        assert result == base


# ---------------------------------------------------------------------------
# SSM config loader
# ---------------------------------------------------------------------------

class TestLoadConfigFromSsm:

    def test_loads_and_caches_config_from_ssm(self):
        from instruction_assistance import load_instruction_assistance_config, clear_config_cache  # noqa: PLC0415
        clear_config_cache()

        mock_ssm = MagicMock()
        mock_ssm.get_parameters_by_path.return_value = {
            'Parameters': [
                {'Name': '/stack/ai-bot/test/instruction-assistance/output-formatting-requirements', 'Value': 'OFR_SSM'},
                {'Name': '/stack/ai-bot/test/instruction-assistance/default-complete-example-line', 'Value': 'CELI_SSM'},
                {'Name': '/stack/ai-bot/test/instruction-assistance/default-json-validation-line', 'Value': 'JVLI_SSM'},
                {'Name': '/stack/ai-bot/test/instruction-assistance/typescript-backed-output-formatting-requirements', 'Value': 'TBOFR_SSM'},
            ],
        }

        with patch('instruction_assistance.boto3.client', return_value=mock_ssm):
            cfg = load_instruction_assistance_config()

        assert cfg['outputFormattingRequirements'] == 'OFR_SSM'
        assert cfg['completeExampleInstructionLine'] == 'CELI_SSM'
        assert cfg['jsonOnlyImperativeInstructionLine'] == 'JVLI_SSM'
        assert cfg['typescriptBackedOutputFormattingRequirements'] == 'TBOFR_SSM'

        # Second call must NOT re-fetch — cached module-level.
        mock_ssm.reset_mock()
        with patch('instruction_assistance.boto3.client', return_value=mock_ssm):
            cfg2 = load_instruction_assistance_config()
        assert cfg2 == cfg
        assert not mock_ssm.get_parameters_by_path.called, (
            'SSM must be queried only once across warm invocations'
        )
        clear_config_cache()

    def test_ssm_failure_returns_empty_config_and_does_not_raise(self):
        """If SSM is unavailable, loader must return an empty dict so the
        handler can fall through to defaults — never crash the request."""
        from instruction_assistance import load_instruction_assistance_config, clear_config_cache  # noqa: PLC0415
        clear_config_cache()

        mock_ssm = MagicMock()
        mock_ssm.get_parameters_by_path.side_effect = RuntimeError('SSM unreachable')

        with patch('instruction_assistance.boto3.client', return_value=mock_ssm):
            cfg = load_instruction_assistance_config()
        assert cfg == {}
        clear_config_cache()

    def test_clear_config_cache_forces_refetch(self):
        from instruction_assistance import load_instruction_assistance_config, clear_config_cache  # noqa: PLC0415
        clear_config_cache()

        mock_ssm = MagicMock()
        mock_ssm.get_parameters_by_path.return_value = {
            'Parameters': [
                {'Name': '/stack/ai-bot/test/instruction-assistance/output-formatting-requirements', 'Value': 'v1'},
                {'Name': '/stack/ai-bot/test/instruction-assistance/default-complete-example-line', 'Value': 'v1'},
                {'Name': '/stack/ai-bot/test/instruction-assistance/default-json-validation-line', 'Value': 'v1'},
                {'Name': '/stack/ai-bot/test/instruction-assistance/typescript-backed-output-formatting-requirements', 'Value': 'v1'},
            ],
        }

        with patch('instruction_assistance.boto3.client', return_value=mock_ssm):
            load_instruction_assistance_config()
        clear_config_cache()

        mock_ssm.get_parameters_by_path.return_value = {
            'Parameters': [
                {'Name': '/stack/ai-bot/test/instruction-assistance/output-formatting-requirements', 'Value': 'v2'},
                {'Name': '/stack/ai-bot/test/instruction-assistance/default-complete-example-line', 'Value': 'v2'},
                {'Name': '/stack/ai-bot/test/instruction-assistance/default-json-validation-line', 'Value': 'v2'},
                {'Name': '/stack/ai-bot/test/instruction-assistance/typescript-backed-output-formatting-requirements', 'Value': 'v2'},
            ],
        }
        with patch('instruction_assistance.boto3.client', return_value=mock_ssm):
            cfg = load_instruction_assistance_config()
        assert cfg['outputFormattingRequirements'] == 'v2'
        clear_config_cache()
