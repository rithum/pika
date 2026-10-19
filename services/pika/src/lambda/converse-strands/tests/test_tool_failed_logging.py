import json
import logging
from unittest.mock import MagicMock, patch

from tests.hook_defaults import base_hooks, override_hooks  # noqa: F401

SENTINEL = 'TOOL_FAILED'
SENTINEL_BODY = 'TOOL_FAILED {"error":"x"}'
DETAIL_LIMIT = 300


def _make_tool():
    from agent_loader import _make_tool
    return _make_tool(
        tool_id='example_tool', lambda_arn='arn:test',
        func_name='action', func_desc='Search',
        params=[{'name': 'query', 'type': 'string', 'description': 'q', 'required': True}],
        session_id='sess-1', input_text='msg',
    )


def _payload(body, response_state='SUCCESS'):
    mock_payload = MagicMock()
    mock_payload.read.return_value = json.dumps({
        'response': {
            'functionResponse': {
                'responseState': response_state,
                'responseBody': {'TEXT': {'body': body}},
            }
        }
    }).encode()
    return mock_payload


def _invoke(caplog, body, response_state='SUCCESS'):
    tool = _make_tool()
    with caplog.at_level(logging.WARNING, logger='agent_loader'), \
            patch('agent_loader.lambda_client') as mock_lambda:
        mock_lambda.invoke.return_value = {'Payload': _payload(body, response_state)}
        tool._tool_func({'toolUseId': 'use-1', 'input': {'query': 'q'}})
    return [r.getMessage() for r in caplog.records if r.getMessage().startswith('TOOL_FAILED tool=')]


def test_failure_response_state_logs_warning(base_hooks, caplog):
    messages = _invoke(caplog, 'boom', 'FAILURE')
    assert len(messages) == 1
    assert messages[0].startswith('TOOL_FAILED tool=action session_id=sess-1 responseState=FAILURE')


def test_sentinel_body_not_logged_by_default(base_hooks, caplog):
    assert _invoke(caplog, SENTINEL_BODY) == []


def test_sentinel_body_logged_when_overridden(override_hooks, caplog):
    override_hooks.TOOL_FAILURE_BODY_SENTINEL = SENTINEL
    assert len(_invoke(caplog, SENTINEL_BODY)) == 1


def test_normal_body_not_logged_when_overridden(override_hooks, caplog):
    override_hooks.TOOL_FAILURE_BODY_SENTINEL = SENTINEL
    assert _invoke(caplog, 'the actual data') == []


def test_detail_truncated_without_newlines(base_hooks, caplog):
    body = 'line one\n' + 'x' * 500
    messages = _invoke(caplog, body, 'FAILURE')
    detail = messages[0].split('detail=', 1)[1]
    assert len(detail) == DETAIL_LIMIT
    assert '\n' not in detail
    assert detail.startswith('line one x')


def test_logging_failure_does_not_change_a_successful_tool_result(override_hooks, caplog):
    tool = _make_tool()
    with caplog.at_level(logging.WARNING, logger='agent_loader'), \
            patch('agent_loader.resolve_hook', side_effect=RuntimeError('hook broke')), \
            patch('agent_loader.lambda_client') as mock_lambda:
        mock_lambda.invoke.return_value = {'Payload': _payload('the actual data')}
        result = tool._tool_func({'toolUseId': 'use-1', 'input': {'query': 'q'}})

    assert result['status'] == 'success'
    assert result['content'] == [{'text': 'the actual data'}]
    assert any(r.getMessage() == 'TOOL_FAILED logging failed' for r in caplog.records)
