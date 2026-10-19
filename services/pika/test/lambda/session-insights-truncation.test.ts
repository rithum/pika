import { describe, expect, it } from '@jest/globals';
import { DEFAULT_ANALYSIS_TOKEN_BUDGET, estimateAnalysisTokens, truncateForAnalysis, TruncatableMessage } from '../../src/lambda/session-insights-runner/truncation';

function rationaleTrace(text: string) {
    return { orchestrationTrace: { rationale: { text } } };
}

function toolInvocationTrace(fn: string) {
    return { orchestrationTrace: { invocationInput: { actionGroupInvocationInput: { function: fn } } } };
}

function makeMessage(overrides: Partial<TruncatableMessage> = {}): TruncatableMessage {
    return { source: 'user', message: 'hello', ...overrides };
}

describe('truncateForAnalysis', () => {
    it('T3a: under-budget input passes through byte-identical', () => {
        const messages = [
            makeMessage({ message: 'What is my order status?' }),
            makeMessage({
                source: 'assistant',
                message: 'Let me check.',
                traces: [toolInvocationTrace('get_order'), rationaleTrace('Looking up the order')]
            })
        ];
        const before = JSON.stringify(messages);

        const result = truncateForAnalysis(messages);

        expect(result).toBe(messages); // same array reference — no copy, no transformation
        expect(JSON.stringify(result)).toBe(before);
    });

    it('T3b: traces are replaced by compact tool-name lists and the result is under budget', () => {
        const hugeRationale = rationaleTrace('r'.repeat(300_000));
        const messages = [
            makeMessage({ message: 'map my catalog', traces: [hugeRationale] }),
            makeMessage({
                source: 'assistant',
                message: 'Working on it.',
                traces: [
                    toolInvocationTrace('get_item_trace'),
                    toolInvocationTrace('get_enum_values'),
                    toolInvocationTrace('get_enum_values'),
                    toolInvocationTrace('get_enum_values'),
                    { ...hugeRationale }
                ]
            })
        ];
        expect(estimateAnalysisTokens(messages)).toBeGreaterThan(DEFAULT_ANALYSIS_TOKEN_BUDGET);

        const result = truncateForAnalysis(messages) as TruncatableMessage[];

        expect(estimateAnalysisTokens(result)).toBeLessThanOrEqual(DEFAULT_ANALYSIS_TOKEN_BUDGET);
        expect(result[0].traces).toEqual([{ orchestrationTrace: { rationale: { text: '[tools: none]' } } }]);
        expect(result[1].traces).toEqual([{ orchestrationTrace: { rationale: { text: '[tools: get_item_trace, get_enum_values ×3]' } } }]);
        expect(JSON.stringify(result)).not.toContain('rrrr');
    });

    it('T3c: 60 huge-body messages end under budget — first 2 + last 40 kept, one omission marker, order preserved', () => {
        const budget = 50_000;
        const messages = Array.from({ length: 60 }, (_, i) => makeMessage({ message: `msg-${i + 1}-` + 'x'.repeat(60_000) }));

        const result = truncateForAnalysis(messages, budget) as TruncatableMessage[];

        expect(estimateAnalysisTokens(result)).toBeLessThanOrEqual(budget);
        expect(result).toHaveLength(43); // first 2 + marker + last 40

        // first 2 and last 40 in original order
        expect(result[0].message.startsWith('msg-1-')).toBe(true);
        expect(result[1].message.startsWith('msg-2-')).toBe(true);
        for (let i = 0; i < 40; i++) {
            expect(result[3 + i].message.startsWith(`msg-${21 + i}-`)).toBe(true);
        }

        // exactly one omission marker, in the gap, naming the omitted count (60 - 42 = 18)
        const markers = result.filter((m) => /^\[…\d+ earlier messages omitted for length…\]$/.test(m.message));
        expect(markers).toHaveLength(1);
        expect(result[2].message).toBe('[…18 earlier messages omitted for length…]');

        // bodies over 4,000 chars were clipped with an explicit truncation note
        expect(result[0].message.length).toBeLessThanOrEqual(4_100);
        expect(result[0].message).toMatch(/…\[truncated \d+ chars\]$/);
    });

    it('T3d: idempotent — running twice equals running once', () => {
        const budget = 50_000;
        const messages = Array.from({ length: 60 }, (_, i) =>
            makeMessage({
                message: `msg-${i + 1}-` + 'x'.repeat(60_000),
                traces: [rationaleTrace('t'.repeat(10_000)), toolInvocationTrace('get_mapping_context')]
            })
        );

        const once = truncateForAnalysis(messages, budget);
        const twice = truncateForAnalysis(once as TruncatableMessage[], budget);

        expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    });

    it('T3e: output estimate ≤ default budget for a generated worst-case input', () => {
        const messages = Array.from({ length: 500 }, (_, i) =>
            makeMessage({
                source: i % 2 ? 'assistant' : 'user',
                message: 'y'.repeat(100_000),
                traces: [rationaleTrace('z'.repeat(50_000)), toolInvocationTrace(`tool_${i % 7}`), toolInvocationTrace(`tool_${i % 7}`)]
            })
        );
        expect(estimateAnalysisTokens(messages)).toBeGreaterThan(DEFAULT_ANALYSIS_TOKEN_BUDGET);

        const result = truncateForAnalysis(messages);

        expect(estimateAnalysisTokens(result as TruncatableMessage[])).toBeLessThanOrEqual(DEFAULT_ANALYSIS_TOKEN_BUDGET);
    });

    it('T3f: when the first-2 + last-40 window is itself over budget, the retained tail shrinks until it fits', () => {
        const budget = 20_000;
        const messages = Array.from({ length: 60 }, (_, i) => makeMessage({ message: `msg-${i + 1}-` + 'x'.repeat(60_000) }));

        const result = truncateForAnalysis(messages, budget) as TruncatableMessage[];

        expect(estimateAnalysisTokens(result)).toBeLessThanOrEqual(budget);
        expect(result.length).toBeLessThan(43); // proves the tail shrank past the fixed 43-message slice
        const markers = result.filter((m) => /^\[…\d+ earlier messages omitted for length…\]$/.test(m.message));
        expect(markers).toHaveLength(1);
        expect(result[0].message.startsWith('msg-1-')).toBe(true);
        expect(result[1].message.startsWith('msg-2-')).toBe(true);
        expect(result[result.length - 1].message.startsWith('msg-60-')).toBe(true); // true tail preserved
    });

    it('T3g: a ≤42-message session that is still over budget is reduced (no longer no-ops past the length guard)', () => {
        const budget = 5_000;
        const messages = Array.from({ length: 10 }, (_, i) => makeMessage({ message: `m-${i + 1}-` + 'x'.repeat(60_000) }));
        expect(estimateAnalysisTokens(messages)).toBeGreaterThan(budget);

        const result = truncateForAnalysis(messages, budget) as TruncatableMessage[];

        expect(estimateAnalysisTokens(result)).toBeLessThanOrEqual(budget);
        expect(result.length).toBeLessThan(10);
        expect(result[0].message.startsWith('m-1-')).toBe(true);
        expect(result[result.length - 1].message.startsWith('m-10-')).toBe(true);
    });

    it('counts tool failures only when a sentinel is supplied', () => {
        const failureTrace = { orchestrationTrace: { observation: { actionGroupInvocationOutput: { text: 'TOOL_FAILED ' + 'e'.repeat(5_000) } } } };
        const messages = [makeMessage({ source: 'assistant', message: 'hi', traces: [failureTrace] })];

        const withoutSentinel = estimateAnalysisTokens(messages);
        const withSentinel = estimateAnalysisTokens(messages, { toolFailureSentinel: 'TOOL_FAILED' });

        expect(withSentinel).toBeGreaterThan(withoutSentinel + 1_000);
        expect(estimateAnalysisTokens(messages, { toolFailureSentinel: 'OTHER' })).toBe(withoutSentinel);
    });

    it('threads the sentinel into the budget check', () => {
        const failureTrace = { orchestrationTrace: { observation: { actionGroupInvocationOutput: { text: 'TOOL_FAILED ' + 'e'.repeat(30_000) } } } };
        const messages = [makeMessage({ source: 'assistant', message: 'hi', traces: [failureTrace] })];

        expect(truncateForAnalysis(messages, 5_000)).toBe(messages);
        expect(truncateForAnalysis(messages, 5_000, { toolFailureSentinel: 'TOOL_FAILED' })).not.toBe(messages);
    });
});
