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

/**
 * Bedrock observations carry no function name, only the traceId of the model step that
 * called the tool; parallel calls in one step share it and finish in call order.
 */
export type PendingToolCalls = Map<string, string[]>;

export function buildStepFrame(payload: unknown, pending: PendingToolCalls = new Map()): JsonObject | null {
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
        if (isObject(invocationInput) && nonEmptyString(invocationInput.traceId)) {
            const queue = pending.get(invocationInput.traceId);
            if (queue) {
                queue.push(input.function);
            } else {
                pending.set(invocationInput.traceId, [input.function]);
            }
        }
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
    if (isObject(output) && isObject(observation) && nonEmptyString(observation.traceId)) {
        const queue = pending.get(observation.traceId);
        const fn = queue?.shift();
        if (queue && queue.length === 0) {
            pending.delete(observation.traceId);
        }
        if (fn) {
            return { step: { event: 'done', id: stepHandle(fn) } };
        }
    }

    return null;
}

export function redactTrace(payload: unknown, pending?: PendingToolCalls): JsonObject {
    return buildStepFrame(payload, pending) ?? ACTIVITY_TRACE_PAYLOAD;
}

function parseFrame(inner: string): { ok: true; payload: unknown } | { ok: false } {
    try {
        return { ok: true, payload: JSON.parse(inner) };
    } catch {
        return { ok: false };
    }
}

// Escaping '<' keeps a label containing a literal close tag from ending the frame early in the client parser.
function encodeFrame(payload: unknown, pending?: PendingToolCalls): string {
    return `${TRACE_OPEN}${JSON.stringify(redactTrace(payload, pending)).replace(/</g, '\\u003c')}${TRACE_CLOSE}`;
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
    // Offset in buf (an open frame starts at 0) from which to look for the next close-tag candidate.
    let closeSearchFrom = 0;
    let sawUnparseableClose = false;
    const pending: PendingToolCalls = new Map();

    // A frame ends at the first close tag whose inner text parses as JSON: valid JSON cannot hold a
    // literal close tag outside a string, so earlier candidates sit inside a string value. Text after
    // an open tag is never emitted raw: at end of stream an unparseable frame becomes one activity
    // frame and an unterminated one is dropped.
    function drain(final: boolean): string {
        let out = '';
        for (;;) {
            if (closeSearchFrom === 0) {
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
                buf = buf.slice(i);
                closeSearchFrom = TRACE_OPEN.length;
            }

            let closed = false;
            for (;;) {
                const j = buf.indexOf(TRACE_CLOSE, closeSearchFrom);
                if (j === -1) {
                    closeSearchFrom = Math.max(TRACE_OPEN.length, buf.length - (TRACE_CLOSE.length - 1));
                    break;
                }
                const parsed = parseFrame(buf.slice(TRACE_OPEN.length, j));
                if (parsed.ok) {
                    out += encodeFrame(parsed.payload, pending);
                    buf = buf.slice(j + TRACE_CLOSE.length);
                    closeSearchFrom = 0;
                    sawUnparseableClose = false;
                    closed = true;
                    break;
                }
                closeSearchFrom = j + TRACE_CLOSE.length;
                sawUnparseableClose = true;
            }

            if (!closed) {
                if (final) {
                    if (sawUnparseableClose) {
                        out += encodeFrame(undefined);
                    }
                    buf = '';
                    closeSearchFrom = 0;
                    sawUnparseableClose = false;
                }
                return out;
            }
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
