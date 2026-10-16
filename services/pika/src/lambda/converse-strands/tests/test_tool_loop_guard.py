"""Contract tests for the per-turn identical tool-call circuit breaker."""
import contextlib
import json
from unittest.mock import MagicMock, patch

import pytest
from strands.hooks.events import AfterToolCallEvent, BeforeModelCallEvent, BeforeToolCallEvent

from custom_hooks_base import TOOL_DEADLINE_MESSAGE, TOOL_LOOP_TRIPPED_MESSAGE
from handler import DEFAULT_MODEL_ID
from tests.hook_defaults import base_hooks, override_hooks  # noqa: F401
from tool_loop_guard import (
    MAX_FAILED_IDENTICAL_EXECUTIONS,
    MAX_IDENTICAL_TOOL_EXECUTIONS,
    MAX_READ_ONLY_POLL_EXECUTIONS,
    ToolLoopGuard,
)

pytestmark = pytest.mark.usefixtures('base_hooks')


def _event(agent, name='reprocess_job', params=None, tool_use_id='use-1'):
    return BeforeToolCallEvent(
        agent=agent,
        selected_tool=MagicMock(),
        tool_use={
            'toolUseId': tool_use_id,
            'name': name,
            'input': params or {'job_id': 'job-1'},
        },
        invocation_state={},
    )


def _guard(**kwargs):
    kwargs.setdefault('loop_message', TOOL_LOOP_TRIPPED_MESSAGE)
    kwargs.setdefault('deadline_message', TOOL_DEADLINE_MESSAGE)
    return ToolLoopGuard(**kwargs)


class TestToolLoopGuard:
    def test_allows_initial_execution_plus_two_identical_retries(self):
        agent = MagicMock()
        guard = _guard()

        for index in range(MAX_IDENTICAL_TOOL_EXECUTIONS):
            event = _event(agent, tool_use_id=f'use-{index}')
            guard.before_tool_call(event)
            assert event.cancel_tool is False

        agent.cancel.assert_not_called()
        assert guard.tripped is False

    def test_fourth_identical_call_cancels_before_execution(self):
        agent = MagicMock()
        guard = _guard()

        for index in range(MAX_IDENTICAL_TOOL_EXECUTIONS + 1):
            event = _event(agent, tool_use_id=f'use-{index}')
            guard.before_tool_call(event)

        assert event.cancel_tool
        assert '3 identical executions' in event.cancel_tool
        agent.cancel.assert_called_once_with()
        assert guard.tripped is True
        assert guard.user_message == TOOL_LOOP_TRIPPED_MESSAGE

    def test_parameter_key_order_does_not_evade_the_breaker(self):
        agent = MagicMock()
        guard = _guard()

        params = [
            {'job_id': 'job-1', 'force': True},
            {'force': True, 'job_id': 'job-1'},
            {'job_id': 'job-1', 'force': True},
            {'force': True, 'job_id': 'job-1'},
        ]
        for index, value in enumerate(params):
            event = _event(agent, params=value, tool_use_id=f'use-{index}')
            guard.before_tool_call(event)

        assert event.cancel_tool
        agent.cancel.assert_called_once_with()

    @pytest.mark.parametrize('tool_name', ['poll_status', 'poll_progress'])
    def test_seven_read_only_status_polls_are_allowed(self, tool_name):
        agent = MagicMock()
        guard = _guard(polling_tools=frozenset({'poll_status', 'poll_progress'}))

        for index in range(7):
            event = _event(
                agent,
                name=tool_name,
                params={'proposal_id': 'proposal-1'},
                tool_use_id=f'poll-{index}',
            )
            guard.before_tool_call(event)
            assert event.cancel_tool is False

        agent.cancel.assert_not_called()

    def test_read_only_polling_budget_is_larger_but_still_bounded(self):
        agent = MagicMock()
        guard = _guard(polling_tools=frozenset({'poll_status'}))

        for index in range(MAX_READ_ONLY_POLL_EXECUTIONS):
            event = _event(
                agent,
                name='poll_status',
                params={'run_id': 'run-1'},
                tool_use_id=f'poll-{index}',
            )
            guard.before_tool_call(event)
            assert event.cancel_tool is False

        blocked = _event(
            agent,
            name='poll_status',
            params={'run_id': 'run-1'},
            tool_use_id='blocked-poll',
        )
        guard.before_tool_call(blocked)
        assert blocked.cancel_tool
        agent.cancel.assert_called_once_with()

    def test_polling_budget_applies_only_to_injected_tools(self):
        agent = MagicMock()
        guard = _guard()

        for index in range(MAX_IDENTICAL_TOOL_EXECUTIONS):
            event = _event(
                agent,
                name='poll_status',
                params={'run_id': 'run-1'},
                tool_use_id=f'poll-{index}',
            )
            guard.before_tool_call(event)
            assert event.cancel_tool is False

        blocked = _event(
            agent,
            name='poll_status',
            params={'run_id': 'run-1'},
            tool_use_id='blocked-poll',
        )
        guard.before_tool_call(blocked)
        assert blocked.cancel_tool
        agent.cancel.assert_called_once_with()

    def test_different_call_has_an_independent_budget_without_resetting_first(self):
        agent = MagicMock()
        guard = _guard()

        for index in range(2):
            guard.before_tool_call(_event(agent, tool_use_id=f'first-{index}'))

        different = _event(agent, params={'job_id': 'job-2'}, tool_use_id='different')
        guard.before_tool_call(different)
        assert different.cancel_tool is False

        third = _event(agent, tool_use_id='third')
        guard.before_tool_call(third)
        assert third.cancel_tool is False

        blocked = _event(agent, tool_use_id='blocked')
        guard.before_tool_call(blocked)
        assert blocked.cancel_tool
        agent.cancel.assert_called_once_with()

    def test_new_turn_gets_a_fresh_budget(self):
        first_agent = MagicMock()
        first_guard = _guard()
        for index in range(MAX_IDENTICAL_TOOL_EXECUTIONS + 1):
            first_guard.before_tool_call(_event(first_agent, tool_use_id=f'first-{index}'))
        assert first_guard.tripped is True

        next_agent = MagicMock()
        next_guard = _guard()
        next_event = _event(next_agent)
        next_guard.before_tool_call(next_event)

        assert next_event.cancel_tool is False
        next_agent.cancel.assert_not_called()


def _after_event(agent, before_event, status='error', text='Tool Lambda error',
                 cancel_message=None, exception=None):
    return AfterToolCallEvent(
        agent=agent,
        selected_tool=MagicMock(),
        tool_use=before_event.tool_use,
        invocation_state={},
        result={
            'toolUseId': before_event.tool_use['toolUseId'],
            'status': status,
            'content': [{'text': text}],
        },
        exception=exception,
        cancel_message=cancel_message,
    )


def _model_call(guard, agent):
    guard.before_model_call(BeforeModelCallEvent(agent=agent, invocation_state={}))


def _run(guard, agent, tool_use_id, **after_kwargs):
    event = _event(agent, tool_use_id=tool_use_id)
    guard.before_tool_call(event)
    if not event.cancel_tool:
        guard.after_tool_call(_after_event(agent, event, **after_kwargs))
    return event


class TestFailedCallRetries:
    def test_failed_call_is_retried_once_then_returned_to_the_model(self):
        agent = MagicMock()
        guard = _guard()

        for index in range(MAX_FAILED_IDENTICAL_EXECUTIONS):
            assert _run(guard, agent, f'use-{index}').cancel_tool is False

        blocked = _run(guard, agent, 'blocked')

        assert 'Do not retry it' in blocked.cancel_tool
        agent.cancel.assert_not_called()
        assert guard.tripped is False

    def test_calling_a_blocked_failing_tool_again_cancels_the_turn(self):
        agent = MagicMock()
        guard = _guard()

        for index in range(MAX_FAILED_IDENTICAL_EXECUTIONS + 2):
            event = _run(guard, agent, f'use-{index}')
            _model_call(guard, agent)

        assert event.cancel_tool
        agent.cancel.assert_called_once_with()
        assert guard.tripped is True
        assert guard.user_message == TOOL_LOOP_TRIPPED_MESSAGE

    def test_blocked_call_repeated_in_the_same_response_does_not_cancel_the_turn(self):
        agent = MagicMock()
        guard = _guard()

        for index in range(MAX_FAILED_IDENTICAL_EXECUTIONS):
            _run(guard, agent, f'use-{index}')
        _model_call(guard, agent)

        first = _run(guard, agent, 'parallel-1')
        second = _run(guard, agent, 'parallel-2')

        assert first.cancel_tool and second.cancel_tool
        agent.cancel.assert_not_called()
        assert guard.tripped is False

    def test_error_text_with_success_status_is_not_a_failure(self):
        agent = MagicMock()
        guard = _guard()

        for index in range(MAX_FAILED_IDENTICAL_EXECUTIONS):
            _run(guard, agent, f'use-{index}', status='success',
                 text='{"error":"not ready"}')

        assert _run(guard, agent, 'next').cancel_tool is False

    def test_exception_counts_as_a_failure(self):
        agent = MagicMock()
        guard = _guard()

        for index in range(MAX_FAILED_IDENTICAL_EXECUTIONS):
            _run(guard, agent, f'use-{index}', exception=TimeoutError())

        assert _run(guard, agent, 'blocked').cancel_tool

    def test_successful_results_do_not_count_as_failures(self):
        agent = MagicMock()
        guard = _guard()

        for index in range(MAX_IDENTICAL_TOOL_EXECUTIONS):
            event = _run(guard, agent, f'use-{index}', status='success', text='ok')
            assert event.cancel_tool is False

    def test_cancelled_calls_do_not_count_as_failures(self):
        agent = MagicMock()
        guard = _guard()

        for index in range(MAX_FAILED_IDENTICAL_EXECUTIONS):
            _run(guard, agent, f'use-{index}', cancel_message='cancelled')

        assert _run(guard, agent, 'next').cancel_tool is False

    def test_failures_are_tracked_per_input(self):
        agent = MagicMock()
        guard = _guard()

        for index in range(MAX_FAILED_IDENTICAL_EXECUTIONS):
            _run(guard, agent, f'use-{index}')

        other = _event(agent, params={'job_id': 'job-2'}, tool_use_id='other')
        guard.before_tool_call(other)
        assert other.cancel_tool is False


class TestToolStartDeadline:
    def test_tool_runs_before_the_deadline(self):
        agent = MagicMock()
        guard = _guard(tool_start_deadline=1_000.0)

        with patch('tool_loop_guard.time.monotonic', return_value=999.0):
            event = _event(agent)
            guard.before_tool_call(event)

        assert event.cancel_tool is False

    def test_first_tool_past_the_deadline_goes_back_to_the_model(self):
        agent = MagicMock()
        guard = _guard(tool_start_deadline=1_000.0)

        with patch('tool_loop_guard.time.monotonic', return_value=1_000.0):
            event = _event(agent)
            guard.before_tool_call(event)

        assert 'Reply to the user now' in event.cancel_tool
        agent.cancel.assert_not_called()
        assert guard.tripped is False

    def test_second_tool_past_the_deadline_cancels_the_turn(self):
        agent = MagicMock()
        guard = _guard(tool_start_deadline=1_000.0)

        with patch('tool_loop_guard.time.monotonic', return_value=1_001.0):
            guard.before_tool_call(_event(agent, tool_use_id='first'))
            _model_call(guard, agent)
            second = _event(agent, params={'job_id': 'job-2'}, tool_use_id='second')
            guard.before_tool_call(second)

        assert second.cancel_tool
        agent.cancel.assert_called_once_with()
        assert guard.tripped is True
        assert guard.user_message == TOOL_DEADLINE_MESSAGE

    def test_parallel_tools_past_the_deadline_go_back_to_the_model(self):
        agent = MagicMock()
        guard = _guard(tool_start_deadline=1_000.0)

        with patch('tool_loop_guard.time.monotonic', return_value=1_001.0):
            first = _event(agent, tool_use_id='first')
            second = _event(agent, params={'job_id': 'job-2'}, tool_use_id='second')
            guard.before_tool_call(first)
            guard.before_tool_call(second)

        assert first.cancel_tool and second.cancel_tool
        agent.cancel.assert_not_called()
        assert guard.tripped is False


class TestHandlerIntegration:
    def test_tool_equipped_agent_receives_per_turn_guard(
            self, valid_event, fake_context):
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value={
                 'agent_id': 'test',
                 'base_prompt': 'test',
                 'foundation_model': 'test',
                 'tool_ids': ['test-tools'],
             }), \
             patch('handler.load_tools', return_value=[{'tool_id': 'test-tools'}]), \
             patch('handler.build_strands_tools', return_value=[MagicMock()]):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {
                    'user_id': 'test-user-001',
                    'session_id': 'test-session-001',
                }
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            handler(valid_event, fake_context)

            hooks = MockAgent.call_args.kwargs['hooks']
            assert len(hooks) == 1
            assert isinstance(hooks[0], ToolLoopGuard)

    def test_tripped_guard_streams_and_persists_user_message(
            self, valid_event, fake_context):
        internal_result = 'Circuit breaker: internal cancellation detail'

        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value={
                 'agent_id': 'test',
                 'base_prompt': 'test',
                 'foundation_model': 'test',
                 'tool_ids': ['test-tools'],
             }), \
             patch('handler.load_tools', return_value=[{'tool_id': 'test-tools'}]), \
             patch('handler.build_strands_tools', return_value=[MagicMock()]):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {
                    'user_id': 'test-user-001',
                    'session_id': 'test-session-001',
                }
            }

            mock_agent_instance = MagicMock()

            def run_agent(*_args, **_kwargs):
                guard = MockAgent.call_args.kwargs['hooks'][0]
                for index in range(MAX_IDENTICAL_TOOL_EXECUTIONS + 1):
                    guard.before_tool_call(_event(
                        mock_agent_instance,
                        tool_use_id=f'handler-trip-{index}',
                    ))
                return internal_result

            mock_agent_instance.side_effect = run_agent
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            result = handler(valid_event, fake_context)

            assert result['body'].count(TOOL_LOOP_TRIPPED_MESSAGE) == 1
            assert internal_result not in result['body']

            items = [
                call.kwargs.get('Item', {})
                for call in mock_table.put_item.call_args_list
            ]
            assistant_messages = [
                item for item in items if item.get('source') == 'assistant'
            ]
            assert len(assistant_messages) == 1
            assert assistant_messages[0]['message'] == TOOL_LOOP_TRIPPED_MESSAGE

    def test_tool_past_the_deadline_persists_out_of_time_message(
            self, valid_event, fake_context):
        fake_context.get_remaining_time_in_millis.return_value = 60_000

        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value={
                 'agent_id': 'test',
                 'base_prompt': 'test',
                 'foundation_model': 'test',
                 'tool_ids': ['test-tools'],
             }), \
             patch('handler.load_tools', return_value=[{'tool_id': 'test-tools'}]), \
             patch('handler.build_strands_tools', return_value=[MagicMock()]):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {
                    'user_id': 'test-user-001',
                    'session_id': 'test-session-001',
                }
            }

            mock_agent_instance = MagicMock()
            cancellations = []

            def run_agent(*_args, **_kwargs):
                guard = MockAgent.call_args.kwargs['hooks'][0]
                for index in range(2):
                    event = _event(
                        mock_agent_instance,
                        params={'job_id': f'job-{index}'},
                        tool_use_id=f'handler-deadline-{index}',
                    )
                    guard.before_tool_call(event)
                    cancellations.append(event.cancel_tool)
                    _model_call(guard, mock_agent_instance)
                return 'internal'

            mock_agent_instance.side_effect = run_agent
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            handler(valid_event, fake_context)

            assert all(cancellations)
            items = [
                call.kwargs.get('Item', {})
                for call in mock_table.put_item.call_args_list
            ]
            assistant_messages = [
                item for item in items if item.get('source') == 'assistant'
            ]
            assert len(assistant_messages) == 1
            assert assistant_messages[0]['message'] == TOOL_DEADLINE_MESSAGE

    def test_handler_injects_resolved_hook_settings(
            self, override_hooks, valid_event, fake_context):
        override_hooks.TOOL_LOOP_POLLING_TOOLS = frozenset({'poll_status'})
        override_hooks.TOOL_LOOP_TRIPPED_MESSAGE = 'Custom loop text.'

        with patch('handler.dynamodb') as mock_ddb,              patch('handler.Agent') as MockAgent,              patch('handler.load_agent', return_value={
                 'agent_id': 'test',
                 'base_prompt': 'test',
                 'foundation_model': 'test',
                 'tool_ids': ['test-tools'],
             }),              patch('handler.load_tools', return_value=[{'tool_id': 'test-tools'}]),              patch('handler.build_strands_tools', return_value=[MagicMock()]):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {
                    'user_id': 'test-user-001',
                    'session_id': 'test-session-001',
                }
            }

            mock_agent_instance = MagicMock()

            def run_agent(*_args, **_kwargs):
                guard = MockAgent.call_args.kwargs['hooks'][0]
                for index in range(MAX_IDENTICAL_TOOL_EXECUTIONS + 1):
                    guard.before_tool_call(_event(
                        mock_agent_instance,
                        tool_use_id=f'handler-trip-{index}',
                    ))
                return 'internal'

            mock_agent_instance.side_effect = run_agent
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            handler(valid_event, fake_context)

            items = [
                call.kwargs.get('Item', {})
                for call in mock_table.put_item.call_args_list
            ]
            assistant_messages = [
                item for item in items if item.get('source') == 'assistant'
            ]
            assert assistant_messages[0]['message'] == 'Custom loop text.'
            assert MockAgent.call_args.kwargs['hooks'][0]._polling_tools == frozenset({'poll_status'})


class TestSwarmIntegration:
    def test_supervisor_past_the_deadline_persists_out_of_time_message(self):
        supervisor_def = {
            'agent_id': 'supervisor-bot',
            'base_prompt': 'You route tasks.',
            'foundation_model': DEFAULT_MODEL_ID,
            'tool_ids': ['test-tools'],
            'collaborators': [{
                'agent_id': 'helper-bot',
                'instruction': 'Helps',
                'base_prompt': 'You help.',
            }],
        }
        helper_def = {
            'agent_id': 'helper-bot',
            'base_prompt': 'You help.',
            'foundation_model': DEFAULT_MODEL_ID,
            'tool_ids': [],
        }
        context = MagicMock()
        context.get_remaining_time_in_millis.return_value = 60_000
        mock_agent_cls = MagicMock()
        mock_swarm = MagicMock()
        mock_swarm.stream_async.side_effect = RuntimeError('stream_async unavailable')

        def run_swarm(*_args, **_kwargs):
            supervisor = mock_agent_cls.call_args_list[0].kwargs
            guard = supervisor['hooks'][0]
            agent = MagicMock()
            for index in range(2):
                guard.before_tool_call(_event(
                    agent,
                    params={'job_id': f'job-{index}'},
                    tool_use_id=f'swarm-deadline-{index}',
                ))
                _model_call(guard, agent)
            return 'partial supervisor text'

        mock_swarm.side_effect = run_swarm

        with contextlib.ExitStack() as stack:
            stack.enter_context(patch('boto3.resource', return_value=MagicMock()))
            mock_add_message = stack.enter_context(patch('handler.add_message'))
            stack.enter_context(patch('handler.ensure_session'))
            stack.enter_context(patch(
                'handler.load_agent',
                side_effect=lambda _ddb, agent_id: (
                    helper_def if agent_id == 'helper-bot' else supervisor_def
                ),
            ))
            stack.enter_context(patch('handler.load_tools', return_value=[{'tool_id': 'test-tools'}]))
            stack.enter_context(patch('handler.build_strands_tools', return_value=[MagicMock()]))
            stack.enter_context(patch(
                'handler.get_user',
                return_value={'user_id': 'user-001', 'custom_data': {}},
            ))
            stack.enter_context(patch('handler.get_messages', return_value=[]))
            stack.enter_context(patch('handler.Agent', mock_agent_cls))
            stack.enter_context(patch('handler.Swarm', MagicMock(return_value=mock_swarm)))

            from handler import handler
            handler({'body': json.dumps({
                'agentId': 'supervisor-bot',
                'userId': 'user-001',
                'sessionId': 'sess-001',
                'message': 'Analyze this item',
            })}, context)

        assistant_messages = [
            call.args[2] for call in mock_add_message.call_args_list
            if call.args[2].get('source') == 'assistant'
        ]
        assert assistant_messages[-1]['message'] == TOOL_DEADLINE_MESSAGE
