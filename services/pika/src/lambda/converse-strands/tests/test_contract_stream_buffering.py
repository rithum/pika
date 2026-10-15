"""Contract tests: a tool-equipped agent's stream matches its persisted message."""

import json
from unittest.mock import MagicMock, patch

import pytest

from handler import DEFAULT_MODEL_ID
from tests.agent_doubles import assert_primary_path, streaming_agent_cls
from tests.hook_defaults import base_hooks  # noqa: F401

pytestmark = pytest.mark.usefixtures('base_hooks')

FINAL_ANSWER = 'Here is your final answer.'
NARRATION = 'Let me check the mapping context first.'


def _make_event(agent_id='agent-tools', session_id='sess-001', user_id='user-001',
                message='Fix my errors'):
    return {
        'body': json.dumps({
            'agentId': agent_id,
            'userId': user_id,
            'sessionId': session_id,
            'message': message,
        })
    }


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _run_handler(agent_def, strands_tools, narrate, memory_tools=None):
    import handler as h  # noqa: PLC0415

    agent_cls, created = streaming_agent_cls(
        FINAL_ANSWER, narration=(NARRATION,) if narrate else ())
    with (
        patch('boto3.resource', return_value=MagicMock()),
        patch('handler.Agent', agent_cls),
        patch('handler.load_agent', return_value=agent_def),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=strands_tools),
        patch('handler._build_memory_tools', return_value=memory_tools or []),
        patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
        patch('handler.get_messages', return_value=[]),
    ):
        return h.handler(_make_event(), _make_ctx()), created


class TestToolAgentStreamBuffering:
    """Tool-equipped agents must not stream intermediate-turn narration."""

    def test_tool_agent_gets_no_live_callback(self, caplog):
        """An agent with tools is constructed with callback_handler=None."""
        agent_def = {
            'agent_id': 'agent-tools',
            'base_prompt': 'You fix validation errors.',
            'foundation_model': DEFAULT_MODEL_ID,
            'tool_ids': ['example_tools'],
        }
        result, created = _run_handler(agent_def, [MagicMock()], narrate=True)

        assert result['statusCode'] == 200
        assert created[0].init_kwargs.get('callback_handler') is None, (
            'Tool-equipped agent must have its live callback suppressed '
            '(intermediate ReAct turns would leak unpersisted narration)'
        )
        assert_primary_path(caplog)

    def test_tool_agent_streams_final_answer_exactly_once(self, caplog):
        """With the callback suppressed, the final answer is still written once."""
        agent_def = {
            'agent_id': 'agent-tools',
            'base_prompt': 'You fix validation errors.',
            'foundation_model': DEFAULT_MODEL_ID,
            'tool_ids': ['example_tools'],
        }
        result, _created = _run_handler(agent_def, [MagicMock()], narrate=True)

        assert result['statusCode'] == 200
        assert result['body'].count(FINAL_ANSWER) == 1, (
            f'Final answer must be streamed exactly once. Body: {result["body"]!r}'
        )
        assert NARRATION not in result['body'], (
            'Intermediate-turn narration must never reach the stream '
            f'(it is not persisted). Body: {result["body"]!r}'
        )
        assert_primary_path(caplog)

    def test_toolless_agent_keeps_live_streaming(self, caplog):
        """A tool-less, KB-less agent keeps the live callback and writes the answer once."""
        agent_def = {
            'agent_id': 'agent-plain',
            'base_prompt': 'You answer questions.',
            'foundation_model': DEFAULT_MODEL_ID,
            'tool_ids': [],
        }
        result, created = _run_handler(agent_def, [], narrate=False)

        assert result['statusCode'] == 200
        assert created[0].init_kwargs.get('callback_handler') is not None, (
            'Tool-less agent must keep live token streaming'
        )
        assert result['body'].count(FINAL_ANSWER) == 1, (
            f'Live-streamed answer must not be duplicated by an end-of-run write. '
            f'Body: {result["body"]!r}'
        )
        assert_primary_path(caplog)

    def test_memory_only_agent_buffers(self, caplog):
        """Memory tools extend strands_tools before the buffering decision."""
        agent_def = {
            'agent_id': 'agent-memory',
            'base_prompt': 'You remember things.',
            'foundation_model': DEFAULT_MODEL_ID,
            'tool_ids': [],
            'memory_feature': {'enabled': True, 'memory_id': 'mem-001'},
        }
        result, created = _run_handler(agent_def, [], narrate=True,
                                       memory_tools=[MagicMock()])

        assert result['statusCode'] == 200
        assert created[0].init_kwargs.get('callback_handler') is None, (
            'Memory-tools-only agent must buffer — memory tools make the '
            'agent multi-turn-capable even with no tool_ids and no KBs'
        )
        assert result['body'].count(FINAL_ANSWER) == 1
        assert NARRATION not in result['body']
        assert_primary_path(caplog)

    def test_kb_agent_still_buffers(self, caplog):
        """Regression guard: KB agents already buffered for citation rendering."""
        agent_def = {
            'agent_id': 'agent-kb',
            'base_prompt': 'You answer from the KB.',
            'foundation_model': DEFAULT_MODEL_ID,
            'tool_ids': [],
            'knowledge_bases': [
                {'id': 'kb-001', 'description': 'Docs'},
            ],
        }
        result, created = _run_handler(agent_def, [], narrate=True)

        assert result['statusCode'] == 200
        assert created[0].init_kwargs.get('callback_handler') is None, (
            'KB agent must keep its suppressed callback (citation rendering)'
        )
        assert result['body'].count(FINAL_ANSWER) == 1
        assert_primary_path(caplog)

    def test_swarm_answer_is_written_exactly_once(self, caplog):
        """A swarm turn buffers and writes the answer once."""
        import handler as h  # noqa: PLC0415

        supervisor_def = {
            'agent_id': 'agent-swarm',
            'base_prompt': 'You route tasks.',
            'foundation_model': DEFAULT_MODEL_ID,
            'tool_ids': [],
            'collaborators': [{'agent_id': 'helper-agent', 'instruction': 'Helps'}],
        }
        helper_def = {
            'agent_id': 'helper-agent',
            'base_prompt': 'You help.',
            'foundation_model': DEFAULT_MODEL_ID,
            'tool_ids': [],
        }

        async def _stream(*_args, **_kwargs):
            yield {'type': 'multiagent_result', 'result': 'Swarm answer.'}

        swarm = MagicMock()
        swarm.stream_async = _stream
        with (
            patch('boto3.resource', return_value=MagicMock()),
            patch('handler.Agent', streaming_agent_cls('unused')[0]),
            patch('handler.Swarm', MagicMock(return_value=swarm)),
            patch('handler.load_agent', side_effect=lambda _ddb, agent_id: (
                helper_def if agent_id == 'helper-agent' else supervisor_def)),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler._build_memory_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
        ):
            result = h.handler(_make_event(agent_id='agent-swarm'), _make_ctx())

        assert result['statusCode'] == 200
        assert result['body'].count('Swarm answer.') == 1
        assert_primary_path(caplog)
