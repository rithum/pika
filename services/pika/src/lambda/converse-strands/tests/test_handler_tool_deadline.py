"""Handler wiring of the tool start deadline and the tripped-guard user message."""
import contextlib
import json
import time
from unittest.mock import MagicMock, patch

import pytest

import handler as h
from agent_loader import TOOL_INVOKE_MAX_SECONDS
from custom_hooks_base import TOOL_DEADLINE_MESSAGE, TOOL_LOOP_TRIPPED_MESSAGE
from tests.hook_defaults import base_hooks  # noqa: F401
from tool_loop_guard import ToolLoopGuard

pytestmark = pytest.mark.usefixtures('base_hooks')

AGENT_RESULT = 'Normal agent answer.'
COLLAB_IDS = ('order-analyzer-2', 'item-analyzer')

PLAIN_DEF = {
    'agent_id': 'plain-bot',
    'base_prompt': 'You are a plain agent.',
    'foundation_model': 'test',
    'tool_ids': ['plain-tools'],
}

SUPERVISOR_DEF = {
    'agent_id': 'example-bot',
    'base_prompt': 'You route tasks.',
    'foundation_model': 'test',
    'tool_ids': ['sup-tools'],
    'collaborators': [
        {'agent_id': collab_id, 'instruction': f'Handles {collab_id}'}
        for collab_id in COLLAB_IDS
    ],
}

COLLAB_DEFS = {
    collab_id: {
        'agent_id': collab_id,
        'base_prompt': f'You are {collab_id}.',
        'foundation_model': 'test',
        'tool_ids': [f'{collab_id}-tools'],
    }
    for collab_id in COLLAB_IDS
}


def _event(agent_id):
    return {
        'body': json.dumps({
            'agentId': agent_id,
            'userId': 'user-001',
            'sessionId': 'sess-001',
            'message': 'Check my orders',
        })
    }


def _context(remaining_ms):
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = remaining_ms
    return ctx


class _Harness:
    def __init__(self, agent_def):
        self.guards = []
        self.guard_kwargs = []
        self.add_message = MagicMock()
        self.agent = MagicMock(return_value=AGENT_RESULT)
        self.swarm = MagicMock(return_value=AGENT_RESULT)
        self.swarm.stream_async.side_effect = RuntimeError('stream_async unavailable')
        self._agent_def = agent_def

    def _guard_factory(self, **kwargs):
        guard = ToolLoopGuard(**kwargs)
        self.guards.append(guard)
        self.guard_kwargs.append(kwargs)
        return guard

    def _load_agent(self, _ddb, agent_id):
        return COLLAB_DEFS.get(agent_id, self._agent_def)

    def run(self, agent_id, remaining_ms=300_000):
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch('boto3.resource', return_value=MagicMock()))
            stack.enter_context(patch('handler.add_message', self.add_message))
            stack.enter_context(patch('handler.ensure_session'))
            stack.enter_context(patch('handler.load_agent', side_effect=self._load_agent))
            stack.enter_context(patch('handler.load_tools', return_value=[{'tool_id': 't'}]))
            stack.enter_context(patch('handler.build_strands_tools', return_value=[MagicMock()]))
            stack.enter_context(patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}))
            stack.enter_context(patch('handler.get_messages', return_value=[]))
            stack.enter_context(patch('handler.Agent', MagicMock(return_value=self.agent)))
            stack.enter_context(patch('handler.Swarm', MagicMock(return_value=self.swarm)))
            stack.enter_context(patch('handler.ToolLoopGuard', side_effect=self._guard_factory))
            before = time.monotonic()
            result = h.handler(_event(agent_id), _context(remaining_ms))
            after = time.monotonic()
        assert result['statusCode'] == 200
        return before, after

    def assistant_message(self):
        messages = [
            call.args[2] for call in self.add_message.call_args_list
            if call.args[2].get('source') == 'assistant'
        ]
        assert len(messages) == 1
        return messages[0]['message']


def _trip(guard, message=TOOL_LOOP_TRIPPED_MESSAGE):
    guard.tripped = True
    guard.user_message = message


@pytest.fixture
def plain():
    return _Harness(PLAIN_DEF)


@pytest.fixture
def swarm():
    return _Harness(SUPERVISOR_DEF)


class TestToolStartDeadline:

    def test_plain_guard_deadline_is_budget_minus_tool_invoke_max(self, plain):
        remaining_ms = 200_000
        before, after = plain.run('plain-bot', remaining_ms)

        offset = remaining_ms / 1000 - h.LAMBDA_TIMEOUT_BUFFER_SECONDS - TOOL_INVOKE_MAX_SECONDS
        deadline = plain.guard_kwargs[0]['tool_start_deadline']
        assert len(plain.guards) == 1
        assert before + offset <= deadline <= after + offset

    def test_supervisor_and_collaborator_guards_share_the_same_deadline(self, swarm):
        remaining_ms = 250_000
        before, after = swarm.run('example-bot', remaining_ms)

        deadlines = [kwargs['tool_start_deadline'] for kwargs in swarm.guard_kwargs]
        offset = remaining_ms / 1000 - h.LAMBDA_TIMEOUT_BUFFER_SECONDS - TOOL_INVOKE_MAX_SECONDS
        assert len(deadlines) == 1 + len(COLLAB_IDS)
        assert len(set(deadlines)) == 1
        assert before + offset <= deadlines[0] <= after + offset


class TestUserMessageWhenGuardTrips:

    def test_plain_agent_persists_guard_user_message_when_tripped(self, plain):
        def run_agent(*_args, **_kwargs):
            _trip(plain.guards[0], TOOL_DEADLINE_MESSAGE)
            return AGENT_RESULT

        plain.agent.side_effect = run_agent
        plain.run('plain-bot')

        assert plain.assistant_message() == TOOL_DEADLINE_MESSAGE

    def test_plain_agent_persists_result_when_guard_not_tripped(self, plain):
        plain.run('plain-bot')

        assert plain.assistant_message() == AGENT_RESULT

    def test_swarm_persists_supervisor_user_message_when_only_supervisor_tripped(self, swarm):
        def run_swarm(*_args, **_kwargs):
            _trip(swarm.guards[0], TOOL_DEADLINE_MESSAGE)
            return AGENT_RESULT

        swarm.swarm.side_effect = run_swarm
        swarm.run('example-bot')

        assert swarm.assistant_message() == TOOL_DEADLINE_MESSAGE

    def test_swarm_persists_collaborator_user_message_when_collaborator_tripped(self, swarm):
        def run_swarm(*_args, **_kwargs):
            _trip(swarm.guards[2], TOOL_DEADLINE_MESSAGE)
            return AGENT_RESULT

        swarm.swarm.side_effect = run_swarm
        swarm.run('example-bot')

        assert swarm.assistant_message() == TOOL_DEADLINE_MESSAGE

    def test_swarm_prefers_supervisor_message_when_supervisor_and_collaborator_tripped(self, swarm):
        def run_swarm(*_args, **_kwargs):
            _trip(swarm.guards[0], TOOL_DEADLINE_MESSAGE)
            _trip(swarm.guards[1], TOOL_LOOP_TRIPPED_MESSAGE)
            return AGENT_RESULT

        swarm.swarm.side_effect = run_swarm
        swarm.run('example-bot')

        assert swarm.assistant_message() == TOOL_DEADLINE_MESSAGE

    def test_swarm_persists_result_when_no_guard_tripped(self, swarm):
        swarm.run('example-bot')

        assert swarm.assistant_message() == AGENT_RESULT
