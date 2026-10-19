import { extractToolFailuresFromTraces } from '../../src/lambda/session-insights-runner/tool-failures';

const SENTINEL = 'TOOL_FAILED';

describe('extractToolFailuresFromTraces', () => {
    it('extracts a failure body from orchestrationTrace.observation.actionGroupInvocationOutput.text', () => {
        const traces = [{ orchestrationTrace: { observation: { actionGroupInvocationOutput: { text: 'TOOL_FAILED tool=get_orders_stats: no data' } } } }];
        expect(extractToolFailuresFromTraces(traces, SENTINEL)).toEqual(['TOOL_FAILED tool=get_orders_stats: no data']);
    });

    it('extracts from knowledgeBaseLookupOutput.text as well', () => {
        const traces = [{ orchestrationTrace: { observation: { knowledgeBaseLookupOutput: { text: 'TOOL_FAILED kb miss' } } } }];
        expect(extractToolFailuresFromTraces(traces, SENTINEL)).toEqual(['TOOL_FAILED kb miss']);
    });

    it('ignores a top-level observation.text shape', () => {
        const traces = [{ observation: { text: 'TOOL_FAILED legacy-shape' } }];
        expect(extractToolFailuresFromTraces(traces, SENTINEL)).toEqual([]);
    });

    it('ignores observation text that does not start with the sentinel', () => {
        const traces = [{ orchestrationTrace: { observation: { actionGroupInvocationOutput: { text: 'normal result, TOOL_FAILED appears mid-string' } } } }];
        expect(extractToolFailuresFromTraces(traces, SENTINEL)).toEqual([]);
    });

    it('detects a failure body with leading whitespace', () => {
        const traces = [{ orchestrationTrace: { observation: { actionGroupInvocationOutput: { text: '  \n TOOL_FAILED tool=x: boom' } } } }];
        expect(extractToolFailuresFromTraces(traces, SENTINEL)).toEqual(['  \n TOOL_FAILED tool=x: boom']);
    });

    it('returns empty for undefined or empty traces', () => {
        expect(extractToolFailuresFromTraces(undefined, SENTINEL)).toEqual([]);
        expect(extractToolFailuresFromTraces([], SENTINEL)).toEqual([]);
    });

    it('collects multiple failures and skips non-observation traces', () => {
        const traces = [
            { orchestrationTrace: { observation: { actionGroupInvocationOutput: { text: 'TOOL_FAILED a' } } } },
            { orchestrationTrace: { rationale: { text: 'just thinking' } } },
            { orchestrationTrace: { observation: { actionGroupInvocationOutput: { text: 'TOOL_FAILED b' } } } }
        ];
        expect(extractToolFailuresFromTraces(traces, SENTINEL)).toEqual(['TOOL_FAILED a', 'TOOL_FAILED b']);
    });

    it('returns empty when no sentinel is given', () => {
        const traces = [{ orchestrationTrace: { observation: { actionGroupInvocationOutput: { text: 'TOOL_FAILED a' } } } }];
        expect(extractToolFailuresFromTraces(traces)).toEqual([]);
        expect(extractToolFailuresFromTraces(traces, undefined)).toEqual([]);
        expect(extractToolFailuresFromTraces(traces, '')).toEqual([]);
    });

    it('matches only the sentinel it is given', () => {
        const traces = [
            { orchestrationTrace: { observation: { actionGroupInvocationOutput: { text: 'TOOL_FAILED a' } } } },
            { orchestrationTrace: { observation: { actionGroupInvocationOutput: { text: 'ERR_CUSTOM b' } } } }
        ];
        expect(extractToolFailuresFromTraces(traces, 'ERR_CUSTOM')).toEqual(['ERR_CUSTOM b']);
    });
});
