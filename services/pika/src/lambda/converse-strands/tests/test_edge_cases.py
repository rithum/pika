"""Edge case tests — verify defensive fixes from code review.

Each test targets a specific finding from the edge case and code smell reviews.
"""
import json
import re
from unittest.mock import patch, MagicMock


MOCK_AGENT_DEF = {
    'agent_id': 'test-agent-001',
    'base_prompt': 'You are a test assistant.',
    'foundation_model': 'test-model',
    'tool_ids': [],
}


class TestToolUseIdMissing:
    """CRITICAL: tool_use dict without toolUseId must not double-fault."""

    def test_missing_tool_use_id_returns_result(self):
        from agent_loader import _make_tool

        with patch('agent_loader.lambda_client') as mock_lambda:
            mock_payload = MagicMock()
            mock_payload.read.return_value = json.dumps({
                'response': {'functionResponse': {'responseState': 'SUCCESS',
                    'responseBody': {'TEXT': {'body': 'data'}}}}
            }).encode()
            mock_lambda.invoke.return_value = {'Payload': mock_payload}

            tool = _make_tool(
                tool_id='test_tool', lambda_arn='arn:test',
                func_name='action', func_desc='test',
                params=[{'name': 'q', 'type': 'string', 'description': 'query', 'required': True}],
                session_id='s1', input_text='msg',
            )

            result = tool._tool_func({'input': {'q': 'hello'}})
            assert result['status'] == 'success'
            assert result['toolUseId'] == ''

    def test_missing_tool_use_id_on_lambda_error(self):
        from agent_loader import _make_tool

        with patch('agent_loader.lambda_client') as mock_lambda:
            mock_payload = MagicMock()
            mock_payload.read.return_value = json.dumps({'errorMessage': 'boom'}).encode()
            mock_lambda.invoke.return_value = {'Payload': mock_payload, 'FunctionError': 'Unhandled'}

            tool = _make_tool(
                tool_id='test_tool', lambda_arn='arn:test',
                func_name='action', func_desc='test',
                params=[], session_id='s1', input_text='msg',
            )

            result = tool._tool_func({'input': {}})
            assert result['status'] == 'error'
            assert result['toolUseId'] == ''


class TestCustomDataNotDict:
    """custom_data stored as string should fall back to empty dict."""

    def test_string_custom_data_does_not_crash(self, valid_event, fake_context):
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value=MOCK_AGENT_DEF), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]), \
             patch('handler.get_user', return_value={
                 'user_id': 'test-user-001',
                 'custom_data': '{"accountId": "123"}',
             }):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }
            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            result = handler(valid_event, fake_context)
            assert result['statusCode'] == 200

    def test_none_custom_data_does_not_crash(self, valid_event, fake_context):
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value=MOCK_AGENT_DEF), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]), \
             patch('handler.get_user', return_value={
                 'user_id': 'test-user-001',
                 'custom_data': None,
             }):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }
            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = 'response'
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            result = handler(valid_event, fake_context)
            assert result['statusCode'] == 200


class TestFunctionSchemaInvalid:
    """function_schema that is None or string should not crash."""

    def test_none_function_schema_returns_empty_tools(self):
        from agent_loader import build_strands_tools
        tool_def = {'tool_id': 'bad', 'lambda_arn': 'arn:test', 'function_schema': None}
        assert build_strands_tools([tool_def], 'sess', 'msg') == []

    def test_string_function_schema_returns_empty_tools(self):
        from agent_loader import build_strands_tools
        tool_def = {'tool_id': 'bad', 'lambda_arn': 'arn:test', 'function_schema': 'not a list'}
        assert build_strands_tools([tool_def], 'sess', 'msg') == []


class TestAgentReturnsNone:
    """Agent returning None should not store 'None' string in DynamoDB."""

    def test_none_result_stores_empty_string(self, valid_event, fake_context):
        with patch('handler.dynamodb') as mock_ddb, \
             patch('handler.Agent') as MockAgent, \
             patch('handler.load_agent', return_value=MOCK_AGENT_DEF), \
             patch('handler.load_tools', return_value=[]), \
             patch('handler.build_strands_tools', return_value=[]), \
             patch('handler.get_user', return_value=None):
            mock_table = MagicMock()
            mock_ddb.Table.return_value = mock_table
            mock_table.get_item.return_value = {
                'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
            }
            mock_agent_instance = MagicMock()
            mock_agent_instance.return_value = None
            MockAgent.return_value = mock_agent_instance

            from handler import handler
            result = handler(valid_event, fake_context)
            assert result['statusCode'] == 200

            put_calls = mock_table.put_item.call_args_list
            items = [c.kwargs.get('Item', {}) for c in put_calls]
            assistant_msgs = [i for i in items if i.get('source') == 'assistant']
            assert len(assistant_msgs) >= 1
            assert assistant_msgs[0]['message'] != 'None'
            assert assistant_msgs[0]['message'] == ''


class TestEmptyLambdaArn:
    """Tool with empty lambda_arn should return error, not crash."""

    def test_empty_arn_returns_error(self):
        from agent_loader import _make_tool

        with patch('agent_loader.lambda_client') as mock_lambda:
            mock_lambda.invoke.side_effect = Exception("Invalid function name")

            tool = _make_tool(
                tool_id='bad', lambda_arn='',
                func_name='action', func_desc='test',
                params=[], session_id='s1', input_text='msg',
            )

            result = tool._tool_func({'toolUseId': 'use-1', 'input': {}})
            assert result['status'] == 'error'
