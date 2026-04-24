"""Tests for iteration limits and time budget enforcement."""
from unittest.mock import patch, MagicMock
from handler import MAX_ITERATIONS, LAMBDA_TIMEOUT_BUFFER_SECONDS


class TestIterationLimits:

    def test_default_max_iterations_is_10(self):
        assert MAX_ITERATIONS == 10

    def test_max_iterations_passed_to_agent(self, valid_event, fake_context):
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value={
                 'agent_id': 'test', 'base_prompt': 'test', 'foundation_model': 'test', 'tool_ids': [],
             }), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            handler(valid_event, fake_context)

            # Verify max_iterations was passed via invocation_state (SDK >= 0.x deprecates **kwargs)
            mock_agent_instance.assert_called_once()
            call_kwargs = mock_agent_instance.call_args.kwargs
            assert call_kwargs['invocation_state']['max_iterations'] == MAX_ITERATIONS


class TestTimeBudget:

    def test_buffer_is_30_seconds(self):
        assert LAMBDA_TIMEOUT_BUFFER_SECONDS == 30

    def test_stop_event_passed_to_agent(self, valid_event, fake_context):
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value={
                 'agent_id': 'test', 'base_prompt': 'test', 'foundation_model': 'test', 'tool_ids': [],
             }), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            handler(valid_event, fake_context)

            # Verify stop_event was passed via invocation_state (SDK >= 0.x deprecates **kwargs)
            call_kwargs = mock_agent_instance.call_args.kwargs
            assert 'stop_event' in call_kwargs['invocation_state']
            # stop_event should be a threading.Event
            import threading
            assert isinstance(call_kwargs['invocation_state']['stop_event'], threading.Event)

    def test_budget_calculated_from_remaining_time(self, valid_event):
        """Timer should fire at (remaining_ms/1000) - BUFFER seconds."""
        mock_context = MagicMock()
        mock_context.get_remaining_time_in_millis.return_value = 60000  # 60s remaining

        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.threading.Timer') as MockTimer, \
             patch('handler.load_agent', return_value={
                 'agent_id': 'test', 'base_prompt': 'test', 'foundation_model': 'test', 'tool_ids': [],
             }), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }

            mock_timer_instance = MagicMock()
            MockTimer.return_value = mock_timer_instance

            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            handler(valid_event, mock_context)

            # Timer should be set to 60 - 30 = 30 seconds.
            # threading.Timer is called more than once (budget + heartbeat), so check
            # that the first call (budget timer) has the right timeout.
            assert MockTimer.call_count >= 1
            budget = MockTimer.call_args_list[0][0][0]
            assert budget == 30.0
