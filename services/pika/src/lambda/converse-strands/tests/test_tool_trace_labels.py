"""Observation traces name the function so the client can pair them with the
invocation that started them, even under parallel tool calls.
"""
import queue

from handler import _StreamWriter, _STREAM_DONE


def _writer(**kwargs):
    q = queue.Queue()
    writer = _StreamWriter(q, **kwargs)

    def drain():
        parts = []
        while True:
            item = q.get_nowait()
            if item is _STREAM_DONE:
                break
            parts.append(item)
        return ''.join(parts)

    return writer, drain


class TestObservationCarriesFunction:

    def test_observation_payload_includes_function(self):
        writer, _ = _writer()
        writer.write_tool_result_trace('get_catalog_rows', 'sku,price\nA-1,9.99')
        observation = writer.traces[0]['orchestrationTrace']['observation']
        assert observation['actionGroupInvocationOutput']['function'] == 'get_catalog_rows'
        assert observation['actionGroupInvocationOutput']['text'] == 'sku,price\nA-1,9.99'

    def test_observation_payload_includes_function_without_invocation_input(self):
        """The observation half of a pair carries `function` on its own — the
        client has no invocationInput to fall back on for older traces."""
        writer, _ = _writer()
        writer.write_tool_result_trace('search_trading_partners', 'no results')
        observation = writer.traces[0]['orchestrationTrace']['observation']
        assert observation['actionGroupInvocationOutput']['function'] == 'search_trading_partners'

    def test_invocation_input_trace_unaffected(self):
        writer, _ = _writer()
        writer.write_tool_result_trace('get_catalog_rows', None, invocation_input={
            'actionGroupName': 'get_catalog_rows',
            'function': 'get_catalog_rows',
            'parameters': [],
        })
        invocation_input = writer.traces[0]['orchestrationTrace']['invocationInput']
        assert invocation_input['actionGroupInvocationInput']['function'] == 'get_catalog_rows'
