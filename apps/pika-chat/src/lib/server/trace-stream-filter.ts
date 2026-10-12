import { createHash } from 'crypto';

const TRACE_OPEN = '<trace>';
const TRACE_CLOSE = '</trace>';
const STEP_HANDLE_LENGTH = 10;

export const ACTIVITY_TRACE_PAYLOAD = { orchestrationTrace: { rationale: { traceId: 'activity', text: '' } } };

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

export function stepHandle(name: string): string {
    return createHash('sha256').update(name, 'utf8').digest('hex').slice(0, STEP_HANDLE_LENGTH);
}

export function buildStepFrame(payload: unknown): JsonObject | null {
    if (!isObject(payload)) {
        return null;
    }

    const step = payload.step;
    if (isObject(step) && (step.event === 'start' || step.event === 'done') && typeof step.id === 'string') {
        const out: JsonObject = { event: step.event, id: step.id };
        if (nonEmptyString(step.label)) {
            out.label = step.label;
        }
        if (nonEmptyString(step.labelDone)) {
            out.labelDone = step.labelDone;
        }
        return { step: out };
    }

    const orchestration = payload.orchestrationTrace;
    if (!isObject(orchestration)) {
        return null;
    }

    const invocationInput = orchestration.invocationInput;
    const input = isObject(invocationInput) ? invocationInput.actionGroupInvocationInput : undefined;
    if (isObject(input) && nonEmptyString(input.function)) {
        const out: JsonObject = { event: 'start', id: stepHandle(input.function) };
        if (nonEmptyString(input.userLabel)) {
            out.label = input.userLabel;
        }
        if (nonEmptyString(input.userLabelDone)) {
            out.labelDone = input.userLabelDone;
        }
        return { step: out };
    }

    const observation = orchestration.observation;
    const output = isObject(observation) ? observation.actionGroupInvocationOutput : undefined;
    if (isObject(output) && nonEmptyString(output.function)) {
        return { step: { event: 'done', id: stepHandle(output.function) } };
    }

    return null;
}

export function redactTrace(payload: unknown): JsonObject {
    return buildStepFrame(payload) ?? ACTIVITY_TRACE_PAYLOAD;
}

function redactFrame(inner: string): string {
    let payload: unknown;
    try {
        payload = JSON.parse(inner);
    } catch {
        payload = undefined;
    }
    return `${TRACE_OPEN}${JSON.stringify(redactTrace(payload))}${TRACE_CLOSE}`;
}

function heldPrefixLength(buf: string): number {
    for (let len = Math.min(buf.length, TRACE_OPEN.length - 1); len > 0; len--) {
        if (TRACE_OPEN.startsWith(buf.slice(buf.length - len))) {
            return len;
        }
    }
    return 0;
}

export function createTraceRedactionStream(): TransformStream<Uint8Array, Uint8Array> {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buf = '';

    function drain(final: boolean): string {
        let out = '';
        for (;;) {
            const i = buf.indexOf(TRACE_OPEN);
            if (i === -1) {
                if (final) {
                    out += buf;
                    buf = '';
                } else {
                    const held = heldPrefixLength(buf);
                    out += buf.slice(0, buf.length - held);
                    buf = buf.slice(buf.length - held);
                }
                return out;
            }
            out += buf.slice(0, i);
            // The first closing tag ends the frame, matching the client parser.
            const j = buf.indexOf(TRACE_CLOSE, i + TRACE_OPEN.length);
            if (j === -1) {
                buf = final ? '' : buf.slice(i);
                return out;
            }
            out += redactFrame(buf.slice(i + TRACE_OPEN.length, j));
            buf = buf.slice(j + TRACE_CLOSE.length);
        }
    }

    return new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
            buf += decoder.decode(chunk, { stream: true });
            const out = drain(false);
            if (out) {
                controller.enqueue(encoder.encode(out));
            }
        },
        flush(controller) {
            buf += decoder.decode();
            const out = drain(true);
            if (out) {
                controller.enqueue(encoder.encode(out));
            }
        }
    });
}
