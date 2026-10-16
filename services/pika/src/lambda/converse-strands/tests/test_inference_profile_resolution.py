"""Inference profile ARNs resolve per model id, and the env names match the infrastructure."""
import re
from pathlib import Path

import pytest

import handler as handler_module
from handler import INFERENCE_PROFILE_ENV_BY_MODEL_ID, _build_bedrock_model

SONNET_5_5 = handler_module.SONNET_5_5_MODEL_ID
SONNET_5_5_ENV = 'INFERENCE_PROFILE_ANTHROPIC_Claude5_5Sonnet'
PROFILE_ARN = 'arn:aws:bedrock:us-east-1:000000001:application-inference-profile/abc'
PIKA_CONSTRUCT = Path(__file__).resolve().parents[4] / 'lib' / 'constructs' / 'pika-construct.ts'


class TestProfileResolution:

    def test_profile_arn_replaces_the_model_id_and_keeps_caching_and_tool_status(self, monkeypatch):
        monkeypatch.setenv(SONNET_5_5_ENV, PROFILE_ARN)

        config = _build_bedrock_model(SONNET_5_5).get_config()

        assert config['model_id'] == PROFILE_ARN
        assert config['cache_config'].strategy == 'anthropic'
        assert config['include_tool_result_status'] is True

    def test_unset_env_builds_with_the_model_id(self, monkeypatch):
        monkeypatch.delenv(SONNET_5_5_ENV, raising=False)

        config = _build_bedrock_model(SONNET_5_5).get_config()

        assert config['model_id'] == SONNET_5_5
        assert config['cache_config'].strategy == 'auto'
        assert config['include_tool_result_status'] == 'auto'

    def test_literal_undefined_env_value_is_treated_as_unset(self, monkeypatch):
        monkeypatch.setenv(SONNET_5_5_ENV, 'undefined')

        assert _build_bedrock_model(SONNET_5_5).get_config()['model_id'] == SONNET_5_5

    def test_unprefixed_model_id_resolves_to_the_same_profile(self, monkeypatch):
        monkeypatch.setenv(SONNET_5_5_ENV, PROFILE_ARN)

        config = _build_bedrock_model('anthropic.claude-sonnet-5-5').get_config()

        assert config['model_id'] == PROFILE_ARN


class TestEnvNamesMatchInfrastructure:
    """Drift guard: has no pre-change failure mode, so it carries no fail-without-change result."""

    @pytest.mark.parametrize('env_name', sorted(INFERENCE_PROFILE_ENV_BY_MODEL_ID.values()))
    def test_env_name_is_provider_plus_a_model_key_the_construct_defines(self, env_name):
        construct = PIKA_CONSTRUCT.read_text()
        model_keys = set(re.findall(r"modelKey:\s*'([^']+)'", construct))

        assert model_keys, 'no modelKey entries found in pika-construct.ts'
        assert env_name.startswith('INFERENCE_PROFILE_ANTHROPIC_')
        assert env_name.removeprefix('INFERENCE_PROFILE_ANTHROPIC_') in model_keys
