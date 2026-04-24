"""Shared test fixtures for Strands converse Lambda tests."""
import os
import json
import pytest
from unittest.mock import MagicMock, patch

os.environ.setdefault('AWS_DEFAULT_REGION', 'us-east-1')
os.environ['CHAT_MESSAGES_TABLE'] = 'test-messages-table'
os.environ['CHAT_SESSION_TABLE'] = 'test-session-table'
os.environ['CHAT_USER_TABLE'] = 'test-user-table'
os.environ['STAGE'] = 'test'
os.environ['MODEL_ID'] = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'

# Shared mock for boto3.client — prevents credential resolution on every test
_mock_boto3_client = MagicMock()


@pytest.fixture(autouse=True)
def _reset_handler_caches():
    """Clear module-level caches and mock boto3.client to avoid network hits."""
    import handler
    handler.dynamodb = None
    handler.bedrock_runtime = _mock_boto3_client
    with patch('boto3.client', return_value=_mock_boto3_client):
        yield
    handler._agent_cache.clear()
    handler.jwt_secret = None
    handler.dynamodb = None
    handler.bedrock_runtime = None


@pytest.fixture
def valid_event():
    return {
        'body': json.dumps({
            'agentId': 'test-agent-001',
            'userId': 'test-user-001',
            'sessionId': 'test-session-001',
            'message': 'What orders are pending for account 12345?',
        })
    }


@pytest.fixture
def event_without_agent_id():
    return {
        'body': json.dumps({
            'userId': 'test-user-001',
            'message': 'Hello',
        })
    }


@pytest.fixture
def event_without_user_id():
    return {
        'body': json.dumps({
            'agentId': 'test-agent-001',
            'message': 'Hello',
        })
    }


@pytest.fixture
def event_without_session_id():
    return {
        'body': json.dumps({
            'agentId': 'test-agent-001',
            'userId': 'test-user-001',
            'message': 'Hello',
        })
    }


@pytest.fixture
def fake_context():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300000
    return ctx
