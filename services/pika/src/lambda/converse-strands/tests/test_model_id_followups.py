"""Tests for tool-result status on profile models and model ID canonicalization."""
import importlib
import sys
from unittest.mock import patch

import pytest

import handler

SONNET_5_MODEL_ID = handler.SONNET_5_MODEL_ID
PROFILE_ARN = 'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123'
PROFILE_ENV = 'INFERENCE_PROFILE_ANTHROPIC_Claude5Sonnet'
ERROR_MESSAGES = [
    {'role': 'user', 'content': [{'toolResult': {'toolUseId': 't1', 'status': 'error', 'content': [{'text': 'boom'}]}}]},
]


@pytest.fixture(autouse=True)
def _clear_inference_profile_env(monkeypatch):
    for env_name in handler.INFERENCE_PROFILE_ENV_BY_MODEL_ID.values():
        monkeypatch.delenv(env_name, raising=False)


def _tool_result_status(model):
    request = model._format_request(ERROR_MESSAGES)
    return request['messages'][0]['content'][0]['toolResult']['status']


def test_profile_arn_model_sends_tool_result_error_status(monkeypatch):
    monkeypatch.setenv(PROFILE_ENV, PROFILE_ARN)
    model = handler._build_bedrock_model(SONNET_5_MODEL_ID)
    assert _tool_result_status(model) == 'error'


def test_model_without_profile_still_sends_tool_result_status(monkeypatch):
    monkeypatch.delenv(PROFILE_ENV, raising=False)
    model = handler._build_bedrock_model(SONNET_5_MODEL_ID)
    assert _tool_result_status(model) == 'error'


@pytest.mark.parametrize('cross_region_id', list(handler.INFERENCE_PROFILE_ENV_BY_MODEL_ID))
def test_bare_model_id_canonicalizes_to_cross_region_id(cross_region_id):
    assert handler._canonical_model_id(cross_region_id.removeprefix('us.')) == cross_region_id
    assert handler._canonical_model_id(cross_region_id) == cross_region_id


@pytest.mark.parametrize('model_id', [
    'amazon.nova-pro-v1:0',
    'arn:aws:bedrock:us-east-1:123:application-inference-profile/x',
])
def test_unknown_model_id_is_unchanged(model_id):
    assert handler._canonical_model_id(model_id) == model_id


def test_bare_model_id_gets_profile_and_adaptive_thinking(monkeypatch):
    monkeypatch.setenv(PROFILE_ENV, PROFILE_ARN)
    with patch('handler.BedrockModel') as bedrock_model:
        handler._build_bedrock_model(SONNET_5_MODEL_ID.removeprefix('us.'))

    assert bedrock_model.call_args.kwargs['model_id'] == PROFILE_ARN
    assert 'additional_request_fields' in bedrock_model.call_args.kwargs


def test_default_model_fallback_is_sonnet_5_5(monkeypatch):
    original = sys.modules.get('handler')
    monkeypatch.delenv('MODEL_ID', raising=False)
    sys.modules.pop('handler', None)
    try:
        import handler as fresh
        assert fresh.DEFAULT_MODEL_ID == fresh.SONNET_5_5_MODEL_ID
    finally:
        sys.modules.pop('handler', None)
        monkeypatch.undo()
        if original is not None:
            sys.modules['handler'] = original
        else:
            importlib.import_module('handler')
