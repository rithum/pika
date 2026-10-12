"""Whether a turn's orchestration traces may carry their content to the client.

A turn that may not carry content still emits content-free frames, because the client
reads trace frames as its only evidence that the agent is still working.
"""
import hashlib
import json

ACTIVITY_TRACE_ID = 'activity'


def is_trace_content_permitted(features: dict | None = None) -> bool:
    """Whether this turn's traces may carry their real content.

    pika-chat forwards its server-side decision as `features.traces.enabled`. A request
    without a `traces` dict is permitted; one whose `enabled` is not exactly True is not.
    """
    if isinstance(features, dict):
        traces = features.get('traces')
        if isinstance(traces, dict):
            return traces.get('enabled') is True
    return True


def build_activity_trace() -> dict:
    """A trace frame that proves the agent is working and says nothing else."""
    return {
        'orchestrationTrace': {
            'rationale': {
                'traceId': ACTIVITY_TRACE_ID,
                'text': '',
            }
        }
    }


def step_handle(tool_name: str) -> str:
    """Opaque, stable per tool: pairs a start frame with its finish without naming the tool."""
    return hashlib.sha256(tool_name.encode('utf-8')).hexdigest()[:10]


def build_step_frame(trace_payload: object) -> dict | None:
    """The content-free frame for a tool-call boundary, or None for any other trace.

    Carries only the end-user labels the tool's author wrote and an opaque handle;
    parameters, outputs and the tool name never appear.
    """
    if not isinstance(trace_payload, dict):
        return None
    existing = trace_payload.get('step')
    if isinstance(existing, dict) and existing.get('event') in ('start', 'done') and isinstance(existing.get('id'), str):
        return {'step': dict(existing)}
    orchestration = trace_payload.get('orchestrationTrace')
    if not isinstance(orchestration, dict):
        return None
    invocation = orchestration.get('invocationInput')
    if isinstance(invocation, dict):
        action = invocation.get('actionGroupInvocationInput')
        if isinstance(action, dict) and isinstance(action.get('function'), str) and action['function']:
            frame = {'event': 'start', 'id': step_handle(action['function'])}
            for key, out in (('userLabel', 'label'), ('userLabelDone', 'labelDone')):
                value = action.get(key)
                if isinstance(value, str) and value:
                    frame[out] = value
            return {'step': frame}
    observation = orchestration.get('observation')
    if isinstance(observation, dict):
        output = observation.get('actionGroupInvocationOutput')
        if isinstance(output, dict) and isinstance(output.get('function'), str) and output['function']:
            return {'step': {'event': 'done', 'id': step_handle(output['function'])}}
    return None


def redact_trace(trace_payload: object) -> dict:
    """Reduce any trace to a frame safe for a caller without trace content.

    Tool-call boundaries become step frames; everything else becomes the activity frame.
    """
    return build_step_frame(trace_payload) or build_activity_trace()


# Serialised once at import. A withheld turn reuses this string for every frame instead
# of encoding the payload it is replacing, so the assembled system prompt and each raw
# tool output — the largest things this service serialises — never reach json.dumps.
ACTIVITY_TRACE_ELEMENT = (
    f"<trace>{json.dumps(build_activity_trace(), separators=(',', ':'))}</trace>"
)
