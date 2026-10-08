"""Tests for LOCAL_TOOLS routing — per-tool redirection to a locally running Lambda."""
import json
import pytest
from unittest.mock import MagicMock, patch

DEPLOYED_ARN = 'arn:aws:lambda:us-east-1:123456789:function:my-app-test-my-tool'
LOCAL_ENDPOINT = 'http://127.0.0.1:3002'


@pytest.fixture(autouse=True)
def _clear_local_clients():
    import agent_loader
    agent_loader._local_tool_clients.clear()
    yield
    agent_loader._local_tool_clients.clear()


def _success_response():
    payload = MagicMock()
    payload.read.return_value = json.dumps({
        'response': {
            'functionResponse': {
                'responseState': 'SUCCESS',
                'responseBody': {'TEXT': {'body': 'tool output'}},
            }
        }
    }).encode()
    return {'Payload': payload}


def _run_tool(tool_id='my_new_tool', lambda_arn=DEPLOYED_ARN):
    from agent_loader import _make_tool
    tool = _make_tool(
        tool_id=tool_id, lambda_arn=lambda_arn,
        func_name='action', func_desc='Do the thing',
        params=[{'name': 'query', 'type': 'string', 'description': 'q', 'required': True}],
        session_id='sess-1', input_text='msg',
    )
    return tool._tool_func({'toolUseId': 'use-1', 'input': {'query': 'q'}})


class TestLambdaFunctionName:

    def test_derives_name_from_arn(self):
        from agent_loader import _lambda_function_name
        assert _lambda_function_name(DEPLOYED_ARN) == 'my-app-test-my-tool'

    def test_derives_name_from_qualified_arn(self):
        from agent_loader import _lambda_function_name
        qualified = f'{DEPLOYED_ARN}:live'
        assert _lambda_function_name(qualified) == 'my-app-test-my-tool'

    def test_passes_through_bare_function_name(self):
        from agent_loader import _lambda_function_name
        assert _lambda_function_name('my-app-test-my-tool') == 'my-app-test-my-tool'

    def test_passes_through_non_function_arn(self):
        from agent_loader import _lambda_function_name
        arn = 'arn:aws:sqs:us-east-1:123456789:some-queue'
        assert _lambda_function_name(arn) == arn


class TestEndpointParsing:

    def test_unset_env_var_yields_no_endpoints(self, monkeypatch):
        from agent_loader import _local_tool_endpoints
        monkeypatch.delenv('LOCAL_TOOLS', raising=False)
        assert _local_tool_endpoints() == {}

    def test_blank_env_var_yields_no_endpoints(self, monkeypatch):
        from agent_loader import _local_tool_endpoints
        monkeypatch.setenv('LOCAL_TOOLS', '   ')
        assert _local_tool_endpoints() == {}

    def test_value_that_is_neither_json_nor_a_file_yields_no_endpoints(self, monkeypatch):
        from agent_loader import _local_tool_endpoints
        monkeypatch.setenv('LOCAL_TOOLS', '{not json')
        assert _local_tool_endpoints() == {}

    def test_non_object_json_yields_no_endpoints(self, monkeypatch):
        from agent_loader import _local_tool_endpoints
        monkeypatch.setenv('LOCAL_TOOLS', '["my_new_tool"]')
        assert _local_tool_endpoints() == {}

    def test_drops_entries_without_a_url(self, monkeypatch):
        from agent_loader import _local_tool_endpoints
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({
            'my_new_tool': LOCAL_ENDPOINT,
            'other_tool': '',
            'bad_tool': 3002,
        }))
        assert _local_tool_endpoints() == {'my_new_tool': LOCAL_ENDPOINT}


class TestEndpointFile:

    def test_reads_a_relative_file_path(self, monkeypatch, tmp_path):
        from agent_loader import _local_tool_endpoints
        endpoints = tmp_path / 'custom-local-action-group-endpoints.json'
        endpoints.write_text(json.dumps({'my_new_tool': LOCAL_ENDPOINT}), encoding='utf-8')
        monkeypatch.chdir(tmp_path)
        monkeypatch.setenv('LOCAL_TOOLS', 'custom-local-action-group-endpoints.json')

        assert _local_tool_endpoints() == {'my_new_tool': LOCAL_ENDPOINT}

    def test_resolves_a_path_against_the_working_directory(self, monkeypatch, tmp_path):
        from agent_loader import _local_tool_endpoints
        endpoints = tmp_path / 'custom-local-action-group-endpoints.json'
        endpoints.write_text(json.dumps({'my_new_tool': LOCAL_ENDPOINT}), encoding='utf-8')
        workdir = tmp_path / 'apps' / 'pika-chat'
        workdir.mkdir(parents=True)
        monkeypatch.chdir(workdir)
        monkeypatch.setenv('LOCAL_TOOLS', '../../custom-local-action-group-endpoints.json')

        assert _local_tool_endpoints() == {'my_new_tool': LOCAL_ENDPOINT}

    def test_reads_an_absolute_file_path(self, monkeypatch, tmp_path):
        from agent_loader import _local_tool_endpoints
        endpoints = tmp_path / 'endpoints.json'
        endpoints.write_text(json.dumps({'my_new_tool': LOCAL_ENDPOINT}), encoding='utf-8')
        monkeypatch.setenv('LOCAL_TOOLS', str(endpoints))

        assert _local_tool_endpoints() == {'my_new_tool': LOCAL_ENDPOINT}

    def test_missing_file_yields_no_endpoints(self, monkeypatch, tmp_path):
        from agent_loader import _local_tool_endpoints
        monkeypatch.chdir(tmp_path)
        monkeypatch.setenv('LOCAL_TOOLS', 'custom-local-action-group-endpoints.json')

        assert _local_tool_endpoints() == {}

    def test_file_with_bad_json_yields_no_endpoints(self, monkeypatch, tmp_path):
        from agent_loader import _local_tool_endpoints
        endpoints = tmp_path / 'endpoints.json'
        endpoints.write_text('{not json', encoding='utf-8')
        monkeypatch.setenv('LOCAL_TOOLS', str(endpoints))

        assert _local_tool_endpoints() == {}

    def test_file_holding_a_non_object_yields_no_endpoints(self, monkeypatch, tmp_path):
        from agent_loader import _local_tool_endpoints
        endpoints = tmp_path / 'endpoints.json'
        endpoints.write_text(json.dumps(['my_new_tool']), encoding='utf-8')
        monkeypatch.setenv('LOCAL_TOOLS', str(endpoints))

        assert _local_tool_endpoints() == {}

    def test_a_directory_path_yields_no_endpoints(self, monkeypatch, tmp_path):
        from agent_loader import _local_tool_endpoints
        monkeypatch.setenv('LOCAL_TOOLS', str(tmp_path))

        assert _local_tool_endpoints() == {}

    def test_file_mapping_routes_the_tool_locally(self, monkeypatch, tmp_path):
        endpoints = tmp_path / 'endpoints.json'
        endpoints.write_text(json.dumps({'my_new_tool': LOCAL_ENDPOINT}), encoding='utf-8')
        monkeypatch.setenv('LOCAL_TOOLS', str(endpoints))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client') as mock_lambda, \
             patch('boto3.client', return_value=local_client) as mock_boto3:

            result = _run_tool()

            assert result['status'] == 'success'
            mock_boto3.assert_called_once_with('lambda', endpoint_url=LOCAL_ENDPOINT)
            assert local_client.invoke.call_args.kwargs['FunctionName'] == 'my-app-test-my-tool'
            mock_lambda.invoke.assert_not_called()

    def test_missing_file_leaves_the_tool_on_its_deployed_lambda(self, monkeypatch, tmp_path):
        monkeypatch.chdir(tmp_path)
        monkeypatch.setenv('LOCAL_TOOLS', 'custom-local-action-group-endpoints.json')
        with patch('agent_loader.lambda_client') as mock_lambda, \
             patch('boto3.client') as mock_boto3:
            mock_lambda.invoke.return_value = _success_response()

            result = _run_tool()

            assert result['status'] == 'success'
            assert mock_lambda.invoke.call_args.kwargs['FunctionName'] == DEPLOYED_ARN
            mock_boto3.assert_not_called()


class TestDeployedPathUnchanged:

    def test_unset_env_var_invokes_deployed_lambda_with_the_arn(self, monkeypatch):
        monkeypatch.delenv('LOCAL_TOOLS', raising=False)
        with patch('agent_loader.lambda_client') as mock_lambda, \
             patch('boto3.client') as mock_boto3:
            mock_lambda.invoke.return_value = _success_response()

            result = _run_tool()

            assert result['status'] == 'success'
            assert mock_lambda.invoke.call_args.kwargs['FunctionName'] == DEPLOYED_ARN
            mock_boto3.assert_not_called()

    def test_unmapped_tool_invokes_deployed_lambda_with_the_arn(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({'some_other_tool': LOCAL_ENDPOINT}))
        with patch('agent_loader.lambda_client') as mock_lambda, \
             patch('boto3.client') as mock_boto3:
            mock_lambda.invoke.return_value = _success_response()

            result = _run_tool()

            assert result['status'] == 'success'
            assert mock_lambda.invoke.call_args.kwargs['FunctionName'] == DEPLOYED_ARN
            mock_boto3.assert_not_called()

    def test_unreadable_env_var_invokes_deployed_lambda(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', '{not json')
        with patch('agent_loader.lambda_client') as mock_lambda, \
             patch('boto3.client') as mock_boto3:
            mock_lambda.invoke.return_value = _success_response()

            result = _run_tool()

            assert result['status'] == 'success'
            assert mock_lambda.invoke.call_args.kwargs['FunctionName'] == DEPLOYED_ARN
            mock_boto3.assert_not_called()


class TestLocalRouting:

    def test_mapped_tool_id_invokes_the_local_endpoint(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({'my_new_tool': LOCAL_ENDPOINT}))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client') as mock_lambda, \
             patch('boto3.client', return_value=local_client) as mock_boto3:

            result = _run_tool()

            assert result['status'] == 'success'
            assert result['content'][0]['text'] == 'tool output'
            mock_boto3.assert_called_once_with('lambda', endpoint_url=LOCAL_ENDPOINT)
            mock_lambda.invoke.assert_not_called()

    def test_local_invocation_uses_the_bare_function_name(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({'my_new_tool': LOCAL_ENDPOINT}))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client'), \
             patch('boto3.client', return_value=local_client):

            _run_tool()

            assert local_client.invoke.call_args.kwargs['FunctionName'] == 'my-app-test-my-tool'

    def test_local_invocation_strips_an_arn_qualifier(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({'my_new_tool': LOCAL_ENDPOINT}))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client'), \
             patch('boto3.client', return_value=local_client):

            _run_tool(lambda_arn=f'{DEPLOYED_ARN}:live')

            assert local_client.invoke.call_args.kwargs['FunctionName'] == 'my-app-test-my-tool'

    def test_mapping_by_function_name_also_routes_locally(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({'my-app-test-my-tool': LOCAL_ENDPOINT}))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client') as mock_lambda, \
             patch('boto3.client', return_value=local_client):

            _run_tool()

            assert local_client.invoke.call_args.kwargs['FunctionName'] == 'my-app-test-my-tool'
            mock_lambda.invoke.assert_not_called()

    def test_local_payload_matches_the_deployed_payload(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({'my_new_tool': LOCAL_ENDPOINT}))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client'), \
             patch('boto3.client', return_value=local_client):

            _run_tool()

        payload = json.loads(local_client.invoke.call_args.kwargs['Payload'])
        assert payload['messageVersion'] == '1.0'
        assert payload['function'] == 'action'
        assert payload['actionGroup'] == 'my_new_tool'
        assert payload['sessionId'] == 'sess-1'
        assert [p['name'] for p in payload['parameters']] == ['query']

    def test_one_client_is_reused_across_invocations(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({'my_new_tool': LOCAL_ENDPOINT}))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client'), \
             patch('boto3.client', return_value=local_client) as mock_boto3:

            _run_tool()
            _run_tool()

            mock_boto3.assert_called_once_with('lambda', endpoint_url=LOCAL_ENDPOINT)
            assert local_client.invoke.call_count == 2

    def test_separate_endpoints_get_separate_clients(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({
            'my_new_tool': LOCAL_ENDPOINT,
            'other_tool': 'http://127.0.0.1:3003',
        }))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client'), \
             patch('boto3.client', return_value=local_client) as mock_boto3:

            _run_tool(tool_id='my_new_tool')
            _run_tool(tool_id='other_tool')

            endpoints = [c.kwargs['endpoint_url'] for c in mock_boto3.call_args_list]
            assert endpoints == [LOCAL_ENDPOINT, 'http://127.0.0.1:3003']


class TestFunctionNameOverride:

    def test_object_entry_yields_its_endpoint(self, monkeypatch):
        from agent_loader import _local_tool_endpoints
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({
            'my_new_tool': {'endpoint': LOCAL_ENDPOINT, 'function': 'my-app-local-my-tool'},
        }))
        assert _local_tool_endpoints() == {'my_new_tool': LOCAL_ENDPOINT}

    def test_object_entry_without_an_endpoint_is_dropped(self, monkeypatch):
        from agent_loader import _local_tool_endpoints
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({
            'my_new_tool': {'function': 'my-app-local-my-tool'},
            'other_tool': {'endpoint': '  '},
        }))
        assert _local_tool_endpoints() == {}

    def test_override_replaces_the_arn_derived_function_name(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({
            'my_new_tool': {'endpoint': LOCAL_ENDPOINT, 'function': 'my-app-local-my-tool'},
        }))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client') as mock_lambda, \
             patch('boto3.client', return_value=local_client) as mock_boto3:

            result = _run_tool()

            assert result['status'] == 'success'
            mock_boto3.assert_called_once_with('lambda', endpoint_url=LOCAL_ENDPOINT)
            assert local_client.invoke.call_args.kwargs['FunctionName'] == 'my-app-local-my-tool'
            mock_lambda.invoke.assert_not_called()

    def test_object_entry_without_a_function_keeps_the_arn_derived_name(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({
            'my_new_tool': {'endpoint': LOCAL_ENDPOINT},
        }))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client'), \
             patch('boto3.client', return_value=local_client):

            _run_tool()

            assert local_client.invoke.call_args.kwargs['FunctionName'] == 'my-app-test-my-tool'

    def test_blank_or_non_string_function_is_ignored(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({
            'my_new_tool': {'endpoint': LOCAL_ENDPOINT, 'function': 42},
        }))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client'), \
             patch('boto3.client', return_value=local_client):

            _run_tool()

            assert local_client.invoke.call_args.kwargs['FunctionName'] == 'my-app-test-my-tool'

    def test_override_applies_when_mapped_by_function_name(self, monkeypatch):
        monkeypatch.setenv('LOCAL_TOOLS', json.dumps({
            'my-app-test-my-tool': {'endpoint': LOCAL_ENDPOINT, 'function': 'my-app-local-my-tool'},
        }))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client'), \
             patch('boto3.client', return_value=local_client):

            _run_tool()

            assert local_client.invoke.call_args.kwargs['FunctionName'] == 'my-app-local-my-tool'

    def test_string_and_object_entries_mix_in_one_map(self, monkeypatch, tmp_path):
        endpoints = tmp_path / 'endpoints.json'
        endpoints.write_text(json.dumps({
            'my_new_tool': {'endpoint': LOCAL_ENDPOINT, 'function': 'my-app-local-my-tool'},
            'other_tool': 'http://127.0.0.1:3003',
        }), encoding='utf-8')
        monkeypatch.setenv('LOCAL_TOOLS', str(endpoints))
        local_client = MagicMock()
        local_client.invoke.return_value = _success_response()
        with patch('agent_loader.lambda_client'), \
             patch('boto3.client', return_value=local_client):

            _run_tool(tool_id='my_new_tool')
            _run_tool(tool_id='other_tool')

            names = [c.kwargs['FunctionName'] for c in local_client.invoke.call_args_list]
            assert names == ['my-app-local-my-tool', 'my-app-test-my-tool']
