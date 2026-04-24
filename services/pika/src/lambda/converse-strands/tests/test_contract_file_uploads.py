"""
CONTRACT TESTS: File uploads (S3 validation and prompt injection) for the Strands converse Lambda.

These tests are EXPECTED TO FAIL until file upload support is implemented.

Observable behavior contract:
  - File with wrong S3 bucket → HTTP 400 with error message naming both buckets
    (this is a security boundary — must reject invalid bucket references)
  - Valid S3 files → the agent's invocation message includes S3 file information so
    the agent knows which keys to reference when calling tools
  - Multiple files → all keys visible to the agent (not just the first)
  - Non-s3 locationType files → silently excluded from prompt (agent not confused by them)
  - Empty files list → agent message unchanged (no extra content injected)

The exact injection format used by the TypeScript converse Lambda:
  \\n\\nAvailable S3 files:\\n    - S3 Bucket: <bucket>\\n    - File Keys: <key1>, <key2>\\n
  \\nWhen calling functions, use only S3 keys (like 'uploads/file.csv'), not full s3:// URLs.
  The S3 bucket is pre-configured in each function.
"""

import json
import os
import pytest
from unittest.mock import MagicMock, patch


VALID_BUCKET = 'pika-uploads-test-bucket'

MOCK_AGENT_DEF = {
    'agent_id': 'agent-files',
    'base_prompt': 'You analyze uploaded files.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': [],
}


def _make_event(files=None, message='Analyze this file', session_id='sess-001'):
    body = {
        'agentId': 'agent-files',
        'userId': 'user-001',
        'sessionId': session_id,
        'message': message,
    }
    if files is not None:
        body['files'] = files
    return {'body': json.dumps(body)}


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


# ---------------------------------------------------------------------------
# Tests: S3 bucket validation (security boundary)
# ---------------------------------------------------------------------------

class TestS3BucketValidation:
    """Observable: wrong S3 bucket → 400; correct bucket → 200."""

    def test_file_with_wrong_bucket_returns_400(self):
        """File with s3Bucket != PIKA_S3_BUCKET must return 400.

        Contract: This is a security boundary. Users must only reference files in the
        designated upload bucket — other bucket references are rejected.
        Error message must name the invalid bucket AND the allowed bucket so the
        caller knows what went wrong.
        """
        import handler as h  # noqa: PLC0415

        event = _make_event(files=[{
            'locationType': 's3',
            's3Bucket': 'attacker-controlled-bucket',
            's3Key': 'uploads/report.csv',
        }])

        mock_ddb = MagicMock()

        with (
            patch.dict(os.environ, {'PIKA_S3_BUCKET': VALID_BUCKET}),
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
        ):
            result = h.handler(event, _make_ctx())

        assert result['statusCode'] == 400, (
            f'Wrong S3 bucket must return 400. Got: {result["statusCode"]}'
        )
        body = json.loads(result['body'])
        error_msg = body.get('error', '')
        assert 'attacker-controlled-bucket' in error_msg, (
            f'400 error must name the invalid bucket. Got: {error_msg!r}'
        )

    def test_file_with_correct_bucket_returns_200(self):
        """File with s3Bucket == PIKA_S3_BUCKET must pass validation and return 200.

        Contract: Valid file references are accepted and the user gets a response.
        """
        import handler as h  # noqa: PLC0415

        event = _make_event(files=[{
            'locationType': 's3',
            's3Bucket': VALID_BUCKET,
            's3Key': 'uploads/report.csv',
        }])

        mock_ddb = MagicMock()

        with (
            patch.dict(os.environ, {'PIKA_S3_BUCKET': VALID_BUCKET}),
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='Analysis complete.'))),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(event, _make_ctx())

        assert result['statusCode'] == 200, (
            f'Valid S3 bucket must return 200. Got: {result["statusCode"]}'
        )

    def test_non_s3_location_type_does_not_trigger_400(self):
        """Files with locationType != 's3' must NOT trigger bucket validation and must not cause 400.

        Contract: Only s3-type files are subject to bucket validation.
        Other file reference types (url, etc.) are excluded from prompt injection silently.
        """
        import handler as h  # noqa: PLC0415

        event = _make_event(files=[{
            'locationType': 'url',
            'url': 'https://example.com/file.pdf',
        }])

        mock_ddb = MagicMock()

        with (
            patch.dict(os.environ, {'PIKA_S3_BUCKET': VALID_BUCKET}),
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='ok'))),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(event, _make_ctx())

        assert result['statusCode'] == 200, (
            f'Non-s3 locationType must not trigger 400. Got: {result["statusCode"]}'
        )


# ---------------------------------------------------------------------------
# Tests: S3 file info visible to agent
# ---------------------------------------------------------------------------

class TestS3FileInfoInAgentMessage:
    """Observable: agent's invocation message includes S3 file information."""

    def test_agent_invoked_with_s3_file_info_appended_to_message(self):
        """When valid S3 files are provided, the agent must be called with a message that
        includes the S3 bucket and file key information.

        Contract: The agent must know which S3 keys to use when calling file-processing tools.
        The injection format matches the TypeScript converse Lambda so tool Lambdas work
        with both implementations.
        """
        import handler as h  # noqa: PLC0415

        event = _make_event(
            message='Analyze this data',
            files=[{'locationType': 's3', 's3Bucket': VALID_BUCKET, 's3Key': 'uploads/data.csv'}],
        )

        mock_ddb = MagicMock()
        captured_agent_message = {}

        class CapturingAgent:
            def __init__(self, **kwargs):
                pass

            def __call__(self, message, **kwargs):
                captured_agent_message['value'] = message
                return 'File analyzed.'

        with (
            patch.dict(os.environ, {'PIKA_S3_BUCKET': VALID_BUCKET}),
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(event, _make_ctx())

        assert result['statusCode'] == 200
        agent_message = captured_agent_message.get('value', '')
        assert 'uploads/data.csv' in agent_message, (
            f'S3 key must appear in agent message. Got: {agent_message!r}'
        )
        assert 'Available S3 files' in agent_message, (
            f'Agent message must include "Available S3 files" header. Got: {agent_message!r}'
        )

    def test_multiple_s3_file_keys_all_visible_to_agent(self):
        """When multiple S3 files are provided, all file keys must appear in the agent's message.

        Contract: The agent can reference any of the uploaded files — not just the first one.
        """
        import handler as h  # noqa: PLC0415

        event = _make_event(files=[
            {'locationType': 's3', 's3Bucket': VALID_BUCKET, 's3Key': 'uploads/file-a.csv'},
            {'locationType': 's3', 's3Bucket': VALID_BUCKET, 's3Key': 'uploads/file-b.xlsx'},
        ])

        mock_ddb = MagicMock()
        captured_agent_message = {}

        class CapturingAgent:
            def __init__(self, **kwargs):
                pass

            def __call__(self, message, **kwargs):
                captured_agent_message['value'] = message
                return 'Both files analyzed.'

        with (
            patch.dict(os.environ, {'PIKA_S3_BUCKET': VALID_BUCKET}),
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(event, _make_ctx())

        assert result['statusCode'] == 200
        agent_message = captured_agent_message.get('value', '')
        assert 'uploads/file-a.csv' in agent_message, 'First file key must be in agent message'
        assert 'uploads/file-b.xlsx' in agent_message, 'Second file key must be in agent message'

    def test_empty_files_list_leaves_agent_message_unchanged(self):
        """When files list is empty, the agent message must be the original user message only.

        Contract: No spurious file info injected when no files are provided.
        """
        import handler as h  # noqa: PLC0415

        user_message = 'What is the weather like?'
        event = _make_event(message=user_message, files=[])

        mock_ddb = MagicMock()
        captured_agent_message = {}

        class CapturingAgent:
            def __init__(self, **kwargs):
                pass

            def __call__(self, message, **kwargs):
                captured_agent_message['value'] = message
                return 'Sunny.'

        with (
            patch.dict(os.environ, {'PIKA_S3_BUCKET': VALID_BUCKET}),
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(event, _make_ctx())

        assert result['statusCode'] == 200
        agent_message = captured_agent_message.get('value', '')
        assert 'Available S3 files' not in agent_message, (
            f'Empty files list must not inject S3 file info. Got: {agent_message!r}'
        )

    def test_non_s3_files_excluded_from_agent_message(self):
        """Non-s3 files must not appear in the agent's message injection.

        Contract: Only s3-type files are injected. URL-type or other locationType files
        are excluded so the agent doesn't receive unusable file references.
        """
        import handler as h  # noqa: PLC0415

        event = _make_event(files=[
            {'locationType': 's3', 's3Bucket': VALID_BUCKET, 's3Key': 'uploads/valid.csv'},
            {'locationType': 'url', 'url': 'https://example.com/excluded.pdf'},
        ])

        mock_ddb = MagicMock()
        captured_agent_message = {}

        class CapturingAgent:
            def __init__(self, **kwargs):
                pass

            def __call__(self, message, **kwargs):
                captured_agent_message['value'] = message
                return 'Processed.'

        with (
            patch.dict(os.environ, {'PIKA_S3_BUCKET': VALID_BUCKET}),
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', CapturingAgent),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(event, _make_ctx())

        assert result['statusCode'] == 200
        agent_message = captured_agent_message.get('value', '')
        assert 'uploads/valid.csv' in agent_message, 'Valid S3 key must appear in agent message'
        assert 'https://example.com' not in agent_message, (
            'URL-type file must not appear in agent message injection'
        )
