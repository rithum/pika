"""Gating and redaction of orchestration trace content.

1. A forwarded `features.traces.enabled` decides; no decision permits, a malformed one withholds.
2. A withheld turn still emits trace frames, and they carry nothing derived from the payload.
"""
import json

import pytest

from trace_visibility import (ACTIVITY_TRACE_ID,
                              build_activity_trace, build_step_frame,
                              is_trace_content_permitted, redact_trace, step_handle)

# Values that must never survive redaction. Drawn from what the real emission sites put
# on the wire: the gzipped system prompt, raw tool output, and the agent/collaborator
# identifiers that reveal the orchestration topology.
SENSITIVE_MARKERS = (
    'llm-instruction',
    'compressedData',
    'H4sIAAAAAAAAA',
    'You are a helpful assistant',
    'get_item_trace',
    'actionGroupInvocationInput',
    'actionGroupInvocationOutput',
    'agentCollaboratorName',
    'semantic-directives',
    'agent-thinking',
    'supervisor',
    'account ACCT-TEST-0001',
)

SYSTEM_PROMPT_TRACE = {
    'orchestrationTrace': {
        'rationale': {
            'traceId': 'llm-instruction',
            'text': json.dumps({
                'type': 'llm-instruction',
                'compressedData': 'H4sIAAAAAAAAA1NW1EnKzE4tUgQAF5ZLmwsAAAA=',
            }),
        }
    }
}

TOOL_INPUT_TRACE = {
    'orchestrationTrace': {
        'invocationInput': {
            'invocationType': 'ACTION_GROUP',
            'actionGroupInvocationInput': {
                'function': 'get_item_trace',
                'parameters': [{'name': 'account', 'value': 'account ACCT-TEST-0001'}],
            },
        }
    }
}

TOOL_OUTPUT_TRACE = {
    'orchestrationTrace': {
        'observation': {
            'actionGroupInvocationOutput': {'text': 'sku,price\nA-1,9.99\n' * 50},
            'type': 'ACTION_GROUP',
        }
    }
}

COLLABORATOR_TRACE = {
    'orchestrationTrace': {
        'observation': {
            'agentCollaboratorInvocationOutput': {
                'output': {'text': 'specialist prose'},
                'agentCollaboratorName': 'support-supervisor',
            },
            'type': 'AGENT_COLLABORATOR',
        }
    }
}

THINKING_TRACE = {
    'orchestrationTrace': {
        'rationale': {
            'traceId': 'agent-thinking-supervisor-3',
            'text': '[Supervisor] I should call get_item_trace next',
        }
    }
}

REAL_TRACE_SHAPES = pytest.mark.parametrize('trace', [
    SYSTEM_PROMPT_TRACE,
    TOOL_INPUT_TRACE,
    TOOL_OUTPUT_TRACE,
    COLLABORATOR_TRACE,
    THINKING_TRACE,
], ids=['system-prompt', 'tool-input', 'tool-output', 'collaborator', 'thinking'])

# Every shape except a tool-call boundary: those keep their end-user labels and an
# opaque handle (see TestStepFrames), everything here must collapse to one identical frame.
CONTENT_FREE_SHAPES = pytest.mark.parametrize('trace', [
    SYSTEM_PROMPT_TRACE,
    TOOL_OUTPUT_TRACE,
    COLLABORATOR_TRACE,
    THINKING_TRACE,
], ids=['system-prompt', 'tool-output', 'collaborator', 'thinking'])


def _traces_features(enabled=True):
    return {'traces': {'enabled': enabled, 'detailedTraces': enabled}}


class TestTraceContentPermitted:

    def test_resolved_feature_enabled_permits_content(self):
        assert is_trace_content_permitted(_traces_features()) is True


class TestTraceContentWithheld:

    def test_resolved_feature_disabled_withholds_content(self):
        assert is_trace_content_permitted(_traces_features(False)) is False

    def test_traces_block_without_enabled_key_withholds_content(self):
        assert is_trace_content_permitted({'traces': {'detailedTraces': True}}) is False

    def test_no_feature_block_withholds_content(self):
        """A pika-chat that predates the forwarded decision must not unlock content."""
        assert is_trace_content_permitted(None) is False

    def test_feature_block_without_traces_withholds_content(self):
        assert is_trace_content_permitted({'verifyResponse': {}}) is False

    def test_no_arguments_withholds_content(self):
        assert is_trace_content_permitted() is False


class TestTraceContentGateEdges:

    @pytest.mark.parametrize('enabled', ['true', 'True', 1, [1], {'a': 1}, 'false', 'yes'])
    def test_non_boolean_enabled_withholds_content(self, enabled):
        """`bool('false')` is True, so a truthiness check here would fail open."""
        assert is_trace_content_permitted({'traces': {'enabled': enabled}}) is False

    @pytest.mark.parametrize('traces', [None, [], 'enabled', 0, True])
    def test_non_dict_traces_block_withholds_content(self, traces):
        assert is_trace_content_permitted({'traces': traces}) is False

    @pytest.mark.parametrize('features', [[], 'traces', 0, True, ('traces',)])
    def test_non_dict_features_withholds_content(self, features):
        assert is_trace_content_permitted(features) is False

    def test_empty_features_withholds_content(self):
        assert is_trace_content_permitted({}) is False

    def test_gate_returns_a_real_boolean(self):
        """Callers branch on this; a truthy dict would still work but is a trap."""
        for result in (is_trace_content_permitted(_traces_features()),
                       is_trace_content_permitted(_traces_features(False)),
                       is_trace_content_permitted({'traces': {'enabled': 'true'}})):
            assert result is True or result is False



class TestRedaction:

    @REAL_TRACE_SHAPES
    def test_no_sensitive_marker_survives(self, trace):
        serialized = json.dumps(redact_trace(trace))
        for marker in SENSITIVE_MARKERS:
            assert marker not in serialized

    def test_system_prompt_payload_is_gone(self):
        serialized = json.dumps(redact_trace(SYSTEM_PROMPT_TRACE))
        assert 'compressedData' not in serialized
        assert 'H4sIAAAAAAAAA1NW1EnKzE4tUgQAF5ZLmwsAAAA=' not in serialized

    def test_raw_tool_output_is_gone(self):
        serialized = json.dumps(redact_trace(TOOL_OUTPUT_TRACE))
        assert 'sku,price' not in serialized
        assert '9.99' not in serialized

    def test_tool_name_and_inputs_are_gone(self):
        serialized = json.dumps(redact_trace(TOOL_INPUT_TRACE))
        assert 'get_item_trace' not in serialized
        assert 'ACCT-TEST-0001' not in serialized

    def test_orchestration_topology_is_gone(self):
        """Collaborator and node identifiers describe the agent graph."""
        serialized = json.dumps(redact_trace(COLLABORATOR_TRACE))
        assert 'support-supervisor' not in serialized
        assert 'agentCollaboratorName' not in serialized

    @CONTENT_FREE_SHAPES
    def test_redaction_is_constant_across_inputs(self, trace):
        """Varying the output with the input is itself a channel."""
        assert redact_trace(trace) == build_activity_trace()

    def test_all_real_shapes_redact_identically(self):
        outputs = {json.dumps(redact_trace(t), sort_keys=True) for t in (
            SYSTEM_PROMPT_TRACE, TOOL_OUTPUT_TRACE,
            COLLABORATOR_TRACE, THINKING_TRACE,
        )}
        assert len(outputs) == 1

    @REAL_TRACE_SHAPES
    def test_redaction_is_idempotent(self, trace):
        once = redact_trace(trace)
        assert redact_trace(once) == once


class TestRedactedFramePreservesLiveness:

    def test_frame_is_a_trace_shaped_dict(self):
        frame = redact_trace(SYSTEM_PROMPT_TRACE)
        assert isinstance(frame, dict)
        assert 'orchestrationTrace' in frame

    def test_frame_carries_a_stable_neutral_trace_id(self):
        frame = redact_trace(TOOL_OUTPUT_TRACE)
        assert frame['orchestrationTrace']['rationale']['traceId'] == ACTIVITY_TRACE_ID

    def test_frame_is_json_serializable(self):
        """It goes onto the wire inside a <trace> element, so it must serialize."""
        assert json.loads(json.dumps(redact_trace(THINKING_TRACE)))

    def test_wire_element_is_detectable_as_activity(self):
        """The client counts a chunk as activity by the presence of the element."""
        element = f'<trace>{json.dumps(redact_trace(THINKING_TRACE))}</trace>'
        assert element.replace('<heartbeat/>', '').find('<trace>') != -1

    def test_frame_is_not_empty(self):
        """An empty payload would still be a frame, but leaves nothing to key on."""
        assert json.dumps(redact_trace(THINKING_TRACE)) != '{}'

    def test_returned_frame_is_not_shared_between_calls(self):
        """A caller mutating one frame must not corrupt the next turn's frame."""
        first = redact_trace(THINKING_TRACE)
        first['orchestrationTrace']['rationale']['text'] = 'mutated'
        assert redact_trace(THINKING_TRACE)['orchestrationTrace']['rationale']['text'] == ''


class TestRedactionOfDegenerateInput:

    @pytest.mark.parametrize('trace', [
        None, {}, [], '', 'a string', 0, True, 3.14, object(),
        {'orchestrationTrace': None},
        {'orchestrationTrace': {'rationale': None}},
        {'unexpectedKey': {'nested': ['deep', {'deeper': 'value'}]}},
    ])
    def test_degenerate_input_yields_the_activity_frame_without_raising(self, trace):
        """A redactor that raises inside the stream loop would break the whole turn."""
        assert redact_trace(trace) == build_activity_trace()

    def test_deeply_nested_input_is_not_traversed(self):
        deep = {'orchestrationTrace': {}}
        cursor = deep['orchestrationTrace']
        for _ in range(2000):
            cursor['next'] = {'compressedData': 'secret'}
            cursor = cursor['next']
        serialized = json.dumps(redact_trace(deep))
        assert 'secret' not in serialized
        assert 'compressedData' not in serialized


LABELED_TOOL_INPUT_TRACE = {
    'orchestrationTrace': {
        'invocationInput': {
            'invocationType': 'ACTION_GROUP',
            'actionGroupInvocationInput': {
                'actionGroupName': 'get_item_trace',
                'function': 'get_item_trace',
                'parameters': [{'name': 'account', 'value': 'account ACCT-TEST-0001'}],
                'userLabel': 'Checking how your item was processed',
                'userLabelDone': 'Checked how your item was processed',
            },
        }
    }
}

NAMED_TOOL_OUTPUT_TRACE = {
    'orchestrationTrace': {
        'observation': {
            'actionGroupInvocationOutput': {'text': 'sku,price\nA-1,9.99\n' * 50, 'function': 'get_item_trace'},
            'type': 'ACTION_GROUP',
        }
    }
}


class TestStepFrames:
    """A tool-call boundary keeps its end-user labels and an opaque handle, nothing else."""

    def test_labeled_start_keeps_labels_and_an_opaque_handle(self):
        frame = redact_trace(LABELED_TOOL_INPUT_TRACE)
        assert frame == {'step': {
            'event': 'start',
            'id': step_handle('get_item_trace'),
            'label': 'Checking how your item was processed',
            'labelDone': 'Checked how your item was processed',
        }}

    def test_start_frame_leaks_no_engine_content(self):
        serialized = json.dumps(redact_trace(LABELED_TOOL_INPUT_TRACE))
        for marker in SENSITIVE_MARKERS + ('parameters', 'actionGroupName'):
            assert marker not in serialized

    def test_handle_is_not_the_tool_name_but_is_stable(self):
        assert step_handle('get_item_trace') != 'get_item_trace'
        assert step_handle('get_item_trace') == step_handle('get_item_trace')
        assert step_handle('get_item_trace') != step_handle('get_kensho_verdict')

    def test_unlabeled_start_still_marks_the_boundary(self):
        frame = redact_trace(TOOL_INPUT_TRACE)
        assert frame == {'step': {'event': 'start', 'id': step_handle('get_item_trace')}}

    def test_named_output_becomes_a_done_frame_without_the_output(self):
        frame = redact_trace(NAMED_TOOL_OUTPUT_TRACE)
        assert frame == {'step': {'event': 'done', 'id': step_handle('get_item_trace')}}
        assert 'sku,price' not in json.dumps(frame)

    def test_start_and_done_share_one_handle(self):
        start = redact_trace(LABELED_TOOL_INPUT_TRACE)['step']['id']
        done = redact_trace(NAMED_TOOL_OUTPUT_TRACE)['step']['id']
        assert start == done

    def test_unnamed_output_stays_the_activity_frame(self):
        assert redact_trace(TOOL_OUTPUT_TRACE) == build_activity_trace()

    @pytest.mark.parametrize('trace', [SYSTEM_PROMPT_TRACE, COLLABORATOR_TRACE, None, 'x', 42, {}])
    def test_everything_else_stays_the_activity_frame(self, trace):
        assert build_step_frame(trace) is None
        assert redact_trace(trace) == build_activity_trace()

    def test_step_frames_are_idempotent_under_redaction(self):
        for frame in (redact_trace(LABELED_TOOL_INPUT_TRACE), redact_trace(NAMED_TOOL_OUTPUT_TRACE)):
            assert redact_trace(frame) == frame

    def test_existing_step_frame_keeps_only_event_id_and_labels(self):
        frame = {'step': {'event': 'start', 'id': 'abc', 'label': 'L', 'labelDone': 'D',
                          'tool': 'get_weather', 'parameters': {'city': 'Paris'}}}
        assert redact_trace(frame) == {'step': {'event': 'start', 'id': 'abc', 'label': 'L', 'labelDone': 'D'}}

    def test_existing_step_frame_omits_empty_or_non_string_labels(self):
        frame = {'step': {'event': 'done', 'id': 'abc', 'label': '', 'labelDone': 5}}
        assert redact_trace(frame) == {'step': {'event': 'done', 'id': 'abc'}}

    def test_step_frames_carry_no_trace_id(self):
        """The client dedupes on traceId; every step frame must stay its own segment."""
        for frame in (redact_trace(LABELED_TOOL_INPUT_TRACE), redact_trace(NAMED_TOOL_OUTPUT_TRACE)):
            assert 'traceId' not in json.dumps(frame)
