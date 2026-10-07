"""
CONTRACT TEST: the strands handler must stream the session title in the
final <pika-metadata> frame so the client updates the sidebar + chat header live,
without a page refresh.

Previously the handler generated and persisted the title but never included it
in the metadata frame, so the title only appeared after a reload. These tests pin
the observable contract: when a session has (or just got) a title, the metadata
frame carries `sessionTitle`.
"""

import json
import re
from unittest.mock import MagicMock, patch


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _make_agent_def(agent_id='agent-001'):
    return {
        'agent_id': agent_id,
        'base_prompt': 'Be helpful.',
        'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'tool_ids': [],
    }


def _parse_pika_metadata(body: str) -> dict:
    match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', body, re.DOTALL)
    if not match:
        return {}
    return json.loads(match.group(1))


def _run_handler(session_item, *, generated_title=None, generate_raises=False):
    """Invoke the handler for a first-turn message with the given session record."""
    with patch('handler.dynamodb') as mock_ddb, \
         patch('handler.Agent') as MockAgent, \
         patch('handler.load_agent', return_value=_make_agent_def()), \
         patch('handler.load_tools', return_value=[]), \
         patch('handler.build_strands_tools', return_value=[]), \
         patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}), \
         patch('handler.get_messages', return_value=[]), \
         patch('handler.generate_session_title') as mock_gen:
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': session_item} if session_item is not None else {}

        if generate_raises:
            mock_gen.side_effect = RuntimeError('bedrock unavailable')
        else:
            mock_gen.return_value = generated_title

        mock_agent_instance = MagicMock()
        mock_agent_instance.return_value = 'Answer'
        MockAgent.return_value = mock_agent_instance

        from handler import handler
        event = {'body': json.dumps({
            'agentId': 'agent-001', 'userId': 'user-001',
            'sessionId': 'sess-001', 'message': 'first message',
        })}
        result = handler(event, _make_ctx())
        return result, mock_gen


def test_generated_title_streamed_in_metadata():
    """Untitled session: the freshly generated title is included in the metadata frame."""
    result, mock_gen = _run_handler(
        {'user_id': 'user-001', 'session_id': 'sess-001'},  # no title yet
        generated_title='Weather in Denver',
    )
    assert result['statusCode'] == 200
    mock_gen.assert_called_once()
    metadata = _parse_pika_metadata(result.get('body', ''))
    assert metadata.get('sessionTitle') == 'Weather in Denver'


def test_existing_title_streamed_in_metadata():
    """Already-titled session: the existing title is echoed and generation is skipped."""
    result, mock_gen = _run_handler(
        {'user_id': 'user-001', 'session_id': 'sess-001', 'title': 'Existing Title'},
    )
    assert result['statusCode'] == 200
    mock_gen.assert_not_called()
    metadata = _parse_pika_metadata(result.get('body', ''))
    assert metadata.get('sessionTitle') == 'Existing Title'


def test_no_session_title_when_generation_fails():
    """Title generation failure is non-fatal and simply omits sessionTitle (no crash)."""
    result, _ = _run_handler(
        {'user_id': 'user-001', 'session_id': 'sess-001'},
        generate_raises=True,
    )
    assert result['statusCode'] == 200
    metadata = _parse_pika_metadata(result.get('body', ''))
    assert 'sessionTitle' not in metadata
