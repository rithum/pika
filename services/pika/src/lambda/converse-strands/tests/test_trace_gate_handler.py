"""The handler applies the forwarded trace decision to the frames it streams."""
import json
import re
from unittest.mock import MagicMock, patch

import handler as h


def _run(features=None):
    body = {
        'agentId': 'agent-x',
        'userId': 'user-001',
        'sessionId': 'sess-1',
        'message': 'hi',
    }
    if features is not None:
        body['features'] = features
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    with (
        patch('boto3.resource', return_value=MagicMock()),
        patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='ok'))),
        patch('handler.load_agent', return_value={'agent_id': 'agent-x', 'base_prompt': 'hi',
                                                  'foundation_model': 'm', 'tool_ids': []}),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
        patch('handler.get_user', return_value={'user_id': 'user-001'}),
        patch('handler.get_messages', return_value=[]),
    ):
        result = h.handler({'body': json.dumps(body)}, ctx)
    assert result['statusCode'] == 200
    return result['body']


def _trace_frames(body):
    return re.findall(r'<trace>(.*?)</trace>', body, re.DOTALL)


class TestHandlerAppliesTraceDecision:

    def test_no_features_streams_trace_content(self):
        body = _run()
        assert any('compressedData' in frame for frame in _trace_frames(body))

    def test_disabled_traces_stream_frames_without_content(self):
        body = _run({'traces': {'enabled': False}})
        assert _trace_frames(body)
        assert 'compressedData' not in body

    def test_enabled_traces_stream_trace_content(self):
        body = _run({'traces': {'enabled': True}})
        assert 'compressedData' in body
