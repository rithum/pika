import { describe, it, expect } from '@jest/globals';
import { buildStepItems, isActivityTrace, isStepTrace } from '../src/lib/client/features/chat/chat-app-main/trace-steps';

const start = (id: string, extra: Record<string, unknown> = {}) => ({ step: { event: 'start', id, ...extra } });
const done = (id: string) => ({ step: { event: 'done', id } });
const activity = { orchestrationTrace: { rationale: { traceId: 'activity', text: '' } } };

describe('buildStepItems', () => {
    it('shows a started step with its label', () => {
        expect(buildStepItems([start('a', { label: 'Checking your order' })])).toEqual([
            { id: 'a', text: 'Checking your order', done: false }
        ]);
    });

    it('closes a step with labelDone', () => {
        const items = buildStepItems([start('a', { label: 'Checking', labelDone: 'Checked' }), done('a')]);
        expect(items).toEqual([{ id: 'a', text: 'Checked', done: true }]);
    });

    it('creates a finished item for a done with no start', () => {
        expect(buildStepItems([done('a')])).toEqual([{ id: 'a', text: 'Step finished', done: true }]);
    });

    it('falls back to a generic running label', () => {
        expect(buildStepItems([start('a')])).toEqual([{ id: 'a', text: 'Running a step', done: false }]);
    });

    it('opens a new item when an id is started again after it finished', () => {
        const items = buildStepItems([start('a', { label: 'One' }), done('a'), start('a', { label: 'Two' })]);
        expect(items).toHaveLength(2);
        expect(items[0].done).toBe(true);
        expect(items[1]).toEqual({ id: 'a', text: 'Two', done: false });
    });

    it('ignores orchestration and activity entries', () => {
        const orchestration = { orchestrationTrace: { invocationInput: { traceId: 'x' } } };
        expect(buildStepItems([orchestration, activity])).toEqual([]);
    });

    it('returns an empty list for undefined and empty input', () => {
        expect(buildStepItems(undefined)).toEqual([]);
        expect(buildStepItems([])).toEqual([]);
    });
});

describe('trace shape guards', () => {
    it('recognizes step frames', () => {
        expect(isStepTrace(start('a'))).toBe(true);
        expect(isStepTrace(done('a'))).toBe(true);
        expect(isStepTrace(activity)).toBe(false);
    });

    it('recognizes the activity frame only when text is empty', () => {
        expect(isActivityTrace(activity)).toBe(true);
        expect(isActivityTrace({ orchestrationTrace: { rationale: { traceId: 'activity', text: 'hi' } } })).toBe(false);
        expect(isActivityTrace({ orchestrationTrace: { invocationInput: { traceId: 'activity' } } })).toBe(false);
        expect(isStepTrace({ orchestrationTrace: { invocationInput: {} } })).toBe(false);
    });
});
