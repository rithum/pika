"""Contract tests for model-aware Strands Bedrock configuration."""
from unittest.mock import patch

import pytest

import handler

SONNET_4_6_MODEL_ID = 'us.anthropic.claude-sonnet-4-6'
SONNET_5_MODEL_ID = handler.SONNET_5_MODEL_ID
SONNET_5_5_MODEL_ID = handler.SONNET_5_5_MODEL_ID
PROFILE_ARN = 'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123'


@pytest.fixture(autouse=True)
def _clear_inference_profile_env(monkeypatch):
    for env_name in handler.INFERENCE_PROFILE_ENV_BY_MODEL_ID.values():
        monkeypatch.delenv(env_name, raising=False)


def test_default_model_is_sonnet_5_5():
    assert handler.DEFAULT_MODEL_ID == SONNET_5_5_MODEL_ID


def test_sonnet_4_6_preserves_existing_bedrock_configuration():
    with patch('handler.BedrockModel') as bedrock_model:
        handler._build_bedrock_model(SONNET_4_6_MODEL_ID)

    bedrock_model.assert_called_once_with(
        model_id=SONNET_4_6_MODEL_ID,
        max_tokens=64000,
        cache_config=handler.CacheConfig(strategy='auto'),
    )


@pytest.mark.parametrize('model_id', [SONNET_5_MODEL_ID, SONNET_5_5_MODEL_ID])
def test_sonnet_5_family_uses_adaptive_thinking_with_medium_effort(model_id):
    with patch('handler.BedrockModel') as bedrock_model:
        handler._build_bedrock_model(model_id)

    bedrock_model.assert_called_once_with(
        model_id=model_id,
        max_tokens=64000,
        cache_config=handler.CacheConfig(strategy='auto'),
        additional_request_fields={
            'thinking': {'type': 'adaptive'},
            'output_config': {'effort': 'medium'},
        },
    )


@pytest.mark.parametrize(
    'model_id, env_name',
    [
        (SONNET_4_6_MODEL_ID, 'INFERENCE_PROFILE_ANTHROPIC_Claude4_6Sonnet'),
        (SONNET_5_MODEL_ID, 'INFERENCE_PROFILE_ANTHROPIC_Claude5Sonnet'),
        (SONNET_5_5_MODEL_ID, 'INFERENCE_PROFILE_ANTHROPIC_Claude5_5Sonnet'),
    ],
)
def test_inference_profile_arn_replaces_model_id_and_forces_anthropic_caching(monkeypatch, model_id, env_name):
    monkeypatch.setenv(env_name, PROFILE_ARN)

    with patch('handler.BedrockModel') as bedrock_model:
        handler._build_bedrock_model(model_id)

    kwargs = bedrock_model.call_args.kwargs
    assert kwargs['model_id'] == PROFILE_ARN
    assert kwargs['cache_config'] == handler.CacheConfig(strategy='anthropic')


def test_inference_profile_keeps_model_specific_request_fields(monkeypatch):
    monkeypatch.setenv('INFERENCE_PROFILE_ANTHROPIC_Claude5_5Sonnet', PROFILE_ARN)

    with patch('handler.BedrockModel') as bedrock_model:
        handler._build_bedrock_model(SONNET_5_5_MODEL_ID)

    assert bedrock_model.call_args.kwargs['additional_request_fields'] == {
        'thinking': {'type': 'adaptive'},
        'output_config': {'effort': 'medium'},
    }


def test_undefined_inference_profile_value_is_ignored(monkeypatch):
    monkeypatch.setenv('INFERENCE_PROFILE_ANTHROPIC_Claude5Sonnet', 'undefined')

    with patch('handler.BedrockModel') as bedrock_model:
        handler._build_bedrock_model(SONNET_5_MODEL_ID)

    assert bedrock_model.call_args.kwargs['model_id'] == SONNET_5_MODEL_ID


def _cache_point_count(model) -> int:
    messages = [{'role': 'user', 'content': [{'text': 'hello'}]}]
    formatted = model._format_bedrock_messages(messages)
    return sum('cachePoint' in block for message in formatted for block in message['content'])


def test_profile_arn_model_keeps_prompt_caching_enabled(monkeypatch):
    monkeypatch.setenv('INFERENCE_PROFILE_ANTHROPIC_Claude5Sonnet', PROFILE_ARN)

    model = handler._build_bedrock_model(SONNET_5_MODEL_ID)

    assert _cache_point_count(model) == 1


def test_sdk_auto_detection_skips_caching_for_profile_arn():
    model = handler.BedrockModel(
        model_id=PROFILE_ARN,
        cache_config=handler.CacheConfig(strategy='auto'),
    )

    assert _cache_point_count(model) == 0
