"""Tests for agent_loader.py — DynamoDB agent/tool loading and Strands tool building."""
import json
import pytest
from unittest.mock import MagicMock, patch, call

MOCK_AGENT = {
    'agent_id': 'order-analyzer-2',
    'base_prompt': 'You are an insights expert.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': ['oa_elasticsearch', 'oa_account_data'],
}

MOCK_TOOL_ES = {
    'tool_id': 'oa_elasticsearch',
    'name': 'oa_elasticsearch',
    'description': 'Access to elasticsearch',
    'execution_type': 'lambda',
    'lambda_arn': 'arn:aws:lambda:us-east-1:123456789:function:test-tool',
    'function_schema': [
        {
            'name': 'action',
            'description': 'Search for data with a custom query',
            'parameters': [
                {'name': 'query', 'type': 'string', 'description': 'ES query', 'required': True},
                {'name': 'index', 'type': 'string', 'description': 'Index name', 'required': True},
            ],
        }
    ],
}

MOCK_TOOL_ACCOUNT = {
    'tool_id': 'oa_account_data',
    'name': 'oa_account_data',
    'description': 'Account data lookups',
    'execution_type': 'lambda',
    'lambda_arn': 'arn:aws:lambda:us-east-1:123456789:function:test-tool',
    'function_schema': [
        {
            'name': 'get_account',
            'description': 'Returns account data',
            'parameters': [
                {'name': 'account_id', 'type': 'string', 'description': 'Account ID', 'required': True},
            ],
        },
        {
            'name': 'search_trading_partners',
            'description': 'Search trading partners',
            'parameters': [
                {'name': 'query', 'type': 'string', 'description': 'Search query', 'required': True},
            ],
        },
    ],
}


class TestLoadAgent:

    def test_loads_agent_from_dynamodb(self):
        from agent_loader import load_agent
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {'Item': MOCK_AGENT}

        with patch('agent_loader.AGENT_DEFINITIONS_TABLE', 'test-agents-table'):
            result = load_agent(mock_ddb, 'order-analyzer-2')

        assert result['agent_id'] == 'order-analyzer-2'
        assert result['base_prompt'] == 'You are an insights expert.'
        mock_ddb.Table.assert_called_with('test-agents-table')

    def test_raises_on_missing_agent(self):
        from agent_loader import load_agent
        mock_ddb = MagicMock()
        mock_table = MagicMock()
        mock_ddb.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        with patch('agent_loader.AGENT_DEFINITIONS_TABLE', 'test-agents-table'):
            with pytest.raises(ValueError, match="not found"):
                load_agent(mock_ddb, 'nonexistent-agent')


class TestLoadTools:

    def test_loads_multiple_tools(self):
        from agent_loader import load_tools
        mock_ddb = MagicMock()
        mock_ddb.batch_get_item.return_value = {
            'Responses': {
                'test-tools-table': [MOCK_TOOL_ES, MOCK_TOOL_ACCOUNT],
            }
        }

        with patch('agent_loader.TOOL_DEFINITIONS_TABLE', 'test-tools-table'):
            result = load_tools(mock_ddb, ['oa_elasticsearch', 'oa_account_data'])

        assert len(result) == 2
        assert result[0]['tool_id'] == 'oa_elasticsearch'
        assert result[1]['tool_id'] == 'oa_account_data'

    def test_skips_missing_tools(self):
        from agent_loader import load_tools
        mock_ddb = MagicMock()
        # Only oa_elasticsearch returned — missing_tool not in response
        mock_ddb.batch_get_item.return_value = {
            'Responses': {
                'test-tools-table': [MOCK_TOOL_ES],
            }
        }

        with patch('agent_loader.TOOL_DEFINITIONS_TABLE', 'test-tools-table'):
            result = load_tools(mock_ddb, ['oa_elasticsearch', 'missing_tool'])

        assert len(result) == 1


class TestBuildStrandsTools:

    def test_creates_one_tool_per_function(self):
        from agent_loader import build_strands_tools
        tools = build_strands_tools([MOCK_TOOL_ES, MOCK_TOOL_ACCOUNT], 'sess-1', 'hello')
        # oa_elasticsearch: 1 function, oa_account_data: 2 functions = 3 total
        assert len(tools) == 3

    def test_tool_has_correct_name(self):
        from agent_loader import build_strands_tools
        tools = build_strands_tools([MOCK_TOOL_ES], 'sess-1', 'hello')
        assert tools[0].tool_name == 'action'

    def test_tool_spec_has_input_schema(self):
        from agent_loader import build_strands_tools
        tools = build_strands_tools([MOCK_TOOL_ES], 'sess-1', 'hello')
        spec = tools[0].tool_spec
        assert 'inputSchema' in spec
        assert 'json' in spec['inputSchema']
        props = spec['inputSchema']['json']['properties']
        assert 'query' in props
        assert 'index' in props

    def test_tool_invocation_sends_correct_payload(self):
        from agent_loader import _make_tool

        with patch('agent_loader.lambda_client') as mock_lambda:
            mock_payload = MagicMock()
            mock_payload.read.return_value = json.dumps({
                'response': {
                    'functionResponse': {
                        'responseState': 'SUCCESS',
                        'responseBody': {'TEXT': {'body': 'search results'}},
                    }
                }
            }).encode()
            mock_lambda.invoke.return_value = {'Payload': mock_payload}

            tool = _make_tool(
                tool_id='oa_elasticsearch', lambda_arn='arn:test',
                func_name='action', func_desc='Search',
                params=[
                    {'name': 'query', 'type': 'string', 'description': 'q', 'required': True},
                    {'name': 'index', 'type': 'string', 'description': 'i', 'required': True},
                ],
                session_id='sess-1', input_text='test query',
            )

            # Call the tool_func directly (same signature PythonAgentTool uses)
            tool_use = {'toolUseId': 'use-1', 'input': {'query': '{"match_all": {}}', 'index': 'order:order'}}
            # Access the internal function via the tool's closure
            result = tool._tool_func(tool_use)

            mock_lambda.invoke.assert_called_once()
            payload = json.loads(mock_lambda.invoke.call_args.kwargs['Payload'])

            assert payload['messageVersion'] == '1.0'
            assert payload['function'] == 'action'
            assert payload['actionGroup'] == 'oa_elasticsearch'
            assert payload['sessionId'] == 'sess-1'
            assert payload['agent']['name'] == 'INLINE_AGENT'

            params = payload['parameters']
            param_names = [p['name'] for p in params]
            assert 'query' in param_names
            assert 'index' in param_names

    def test_tool_invocation_extracts_response_body(self):
        from agent_loader import _make_tool

        with patch('agent_loader.lambda_client') as mock_lambda:
            mock_payload = MagicMock()
            mock_payload.read.return_value = json.dumps({
                'response': {
                    'functionResponse': {
                        'responseState': 'SUCCESS',
                        'responseBody': {'TEXT': {'body': 'the actual data'}},
                    }
                }
            }).encode()
            mock_lambda.invoke.return_value = {'Payload': mock_payload}

            tool = _make_tool(
                tool_id='oa_elasticsearch', lambda_arn='arn:test',
                func_name='action', func_desc='Search',
                params=[{'name': 'query', 'type': 'string', 'description': 'q', 'required': True}],
                session_id='sess-1', input_text='msg',
            )

            result = tool._tool_func({'toolUseId': 'use-1', 'input': {'query': 'q'}})

            assert result['status'] == 'success'
            assert result['content'][0]['text'] == 'the actual data'

    def test_tool_invocation_handles_lambda_error(self):
        from agent_loader import _make_tool

        with patch('agent_loader.lambda_client') as mock_lambda:
            mock_payload = MagicMock()
            mock_payload.read.return_value = json.dumps({
                'errorMessage': 'Function timed out',
            }).encode()
            mock_lambda.invoke.return_value = {
                'Payload': mock_payload,
                'FunctionError': 'Unhandled',
            }

            tool = _make_tool(
                tool_id='oa_elasticsearch', lambda_arn='arn:test',
                func_name='action', func_desc='Search',
                params=[{'name': 'query', 'type': 'string', 'description': 'q', 'required': True}],
                session_id='sess-1', input_text='msg',
            )

            result = tool._tool_func({'toolUseId': 'use-1', 'input': {'query': 'q'}})

            assert result['status'] == 'error'
            assert 'timed out' in result['content'][0]['text'].lower() or 'error' in result['content'][0]['text'].lower()
