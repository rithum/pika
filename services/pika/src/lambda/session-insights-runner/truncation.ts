import { extractToolFailuresFromTraces } from './tool-failures';

export const DEFAULT_ANALYSIS_TOKEN_BUDGET = 150_000;
const CHARS_PER_TOKEN = 3.5;
const MAX_MESSAGE_CHARS = 4_000;
const KEEP_FIRST = 2;
const KEEP_LAST = 40;

const CLIP_SUFFIX_PATTERN = /…\[truncated \d+ chars\]$/;
const TOOL_LIST_PREFIX = '[tools:';
const OMISSION_MARKER_PATTERN = /^\[…\d+ earlier messages omitted for length…\]$/;

/** The message fields the analyzer's prompt build reads; anything satisfying this can be truncated. */
export interface TruncatableMessage {
    source: string;
    message: string;
    traces?: unknown[];
    toolFailures?: string[];
}

/** Structural subset of a Bedrock agent Trace — only the parts the prompt build / tool listing read. */
export interface TraceLike {
    orchestrationTrace?: {
        rationale?: { text?: string };
        invocationInput?: {
            actionGroupInvocationInput?: { function?: string; apiPath?: string; actionGroupName?: string };
            knowledgeBaseLookupInput?: unknown;
            codeInterpreterInvocationInput?: unknown;
        };
        observation?: {
            actionGroupInvocationOutput?: { text?: string };
            knowledgeBaseLookupOutput?: { text?: string };
        };
    };
    failureTrace?: { failureReason?: string };
}

/** Estimated token count (chars / 3.5, rounded up) of the serialized prompt payload for these messages. */
export function estimateAnalysisTokens(messages: TruncatableMessage[], opts?: { toolFailureSentinel?: string }): number {
    const projected = messages.map((m) => ({
        role: m.source,
        content: m.message,
        thinking: m.traces
            ?.map((raw) => {
                const t = raw as TraceLike;
                if (t.orchestrationTrace?.rationale?.text) {
                    return t.orchestrationTrace.rationale.text;
                } else if (t.failureTrace?.failureReason && t.failureTrace.failureReason != 'Max iterations exceeded') {
                    return t.failureTrace.failureReason;
                }
            })
            .filter((a) => !!a),
        toolFailures: m.toolFailures ?? extractToolFailuresFromTraces(m.traces, opts?.toolFailureSentinel)
    }));
    return Math.ceil(JSON.stringify(projected).length / CHARS_PER_TOKEN);
}

function isToolListTrace(raw: unknown): boolean {
    return !!(raw as TraceLike | undefined)?.orchestrationTrace?.rationale?.text?.startsWith(TOOL_LIST_PREFIX);
}

/** Collapse a message's traces to a single synthetic rationale trace listing the tools invoked. */
function buildToolListTrace(traces: unknown[]): TraceLike {
    const counts = new Map<string, number>();
    for (const raw of traces) {
        const input = (raw as TraceLike).orchestrationTrace?.invocationInput;
        let name: string | undefined;
        if (input?.actionGroupInvocationInput) {
            const agi = input.actionGroupInvocationInput;
            name = agi.function ?? agi.apiPath ?? agi.actionGroupName;
        } else if (input?.knowledgeBaseLookupInput) {
            name = 'knowledge_base';
        } else if (input?.codeInterpreterInvocationInput) {
            name = 'code_interpreter';
        }
        if (name) {
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
    }
    const parts = [...counts.entries()].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name));
    return { orchestrationTrace: { rationale: { text: `${TOOL_LIST_PREFIX} ${parts.join(', ') || 'none'}]` } } };
}

function clipMessageBody<T extends TruncatableMessage>(m: T): T {
    if (m.message.length <= MAX_MESSAGE_CHARS || CLIP_SUFFIX_PATTERN.test(m.message)) {
        return m;
    }
    const dropped = m.message.length - MAX_MESSAGE_CHARS;
    return { ...m, message: m.message.slice(0, MAX_MESSAGE_CHARS) + `…[truncated ${dropped} chars]` };
}

/**
 * Reduce the message payload deterministically until its estimated token count fits budgetTokens.
 * Under-budget input is returned as-is (same array reference); lastAnalyzedMessageId must be captured from the ORIGINAL array.
 */
export function truncateForAnalysis<T extends TruncatableMessage>(
    messages: T[],
    budgetTokens: number = DEFAULT_ANALYSIS_TOKEN_BUDGET,
    opts?: { toolFailureSentinel?: string }
): (T | TruncatableMessage)[] {
    if (estimateAnalysisTokens(messages, opts) <= budgetTokens) {
        return messages;
    }

    let reduced: (T | TruncatableMessage)[] = messages.map((m) =>
        m.traces?.length && !(m.traces.length === 1 && isToolListTrace(m.traces[0]))
            ? {
                  ...m,
                  traces: [buildToolListTrace(m.traces)],
                  toolFailures: extractToolFailuresFromTraces(m.traces, opts?.toolFailureSentinel)
              }
            : m
    );
    if (estimateAnalysisTokens(reduced, opts) <= budgetTokens) {
        return reduced;
    }

    reduced = reduced.map((m) => clipMessageBody(m));
    if (estimateAnalysisTokens(reduced, opts) <= budgetTokens) {
        return reduced;
    }

    const alreadyMarked = reduced.some((m) => OMISSION_MARKER_PATTERN.test(m.message));
    if (!alreadyMarked && reduced.length > KEEP_FIRST + 1) {
        for (let keepLast = Math.min(KEEP_LAST, reduced.length - KEEP_FIRST - 1); keepLast >= 1; keepLast--) {
            const omitted = reduced.length - KEEP_FIRST - keepLast;
            const marker: TruncatableMessage = {
                source: 'system',
                message: `[…${omitted} earlier messages omitted for length…]`
            };
            const candidate = [...reduced.slice(0, KEEP_FIRST), marker, ...reduced.slice(reduced.length - keepLast)];
            if (estimateAnalysisTokens(candidate, opts) <= budgetTokens || keepLast === 1) {
                return candidate;
            }
        }
    }
    return reduced;
}
