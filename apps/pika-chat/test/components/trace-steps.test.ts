import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Trace from '../../src/lib/client/features/chat/chat-app-main/trace.svelte';
import type { ChatAppOverridableFeatures, ChatMessageForRendering } from 'pika-shared/types/chatbot/chatbot-types';

const features = { traces: { enabled: true, detailedTraces: false } } as unknown as ChatAppOverridableFeatures;

const start = (id: string, extra: Record<string, unknown> = {}, traceId = `seg-${id}-start`) => ({
    step: { event: 'start', id, ...extra },
    traceId
});
const done = (id: string) => ({ step: { event: 'done', id }, traceId: `seg-${id}-done` });
const activity = { orchestrationTrace: { rationale: { traceId: 'activity', text: '' } }, traceId: 'seg-activity' };

function messageWith(traces: unknown[], isStreaming = false) {
    return { messageId: 'm1', segments: [], traces, isStreaming } as unknown as ChatMessageForRendering;
}

describe('trace.svelte step frames', () => {
    it('renders a started step label under the reasoning header', () => {
        render(Trace, { message: messageWith([start('a', { label: 'Checking your order' })]), features });
        expect(screen.getByText('Answer reasoning')).toBeInTheDocument();
        expect(screen.getByTestId('trace-steps')).toHaveTextContent('Checking your order');
    });

    it('renders labelDone for a finished step instead of the start label', () => {
        const traces = [start('a', { label: 'Checking your order', labelDone: 'Checked your order' }), done('a')];
        render(Trace, { message: messageWith(traces), features });
        expect(screen.getByText('Checked your order')).toBeInTheDocument();
        expect(screen.queryByText('Checking your order')).toBeNull();
    });

    it('shows the placeholder for an activity-only trace while streaming', () => {
        render(Trace, { message: messageWith([activity], true), features });
        expect(screen.getByText('Reasoning about the answer...')).toBeInTheDocument();
    });

    it('renders nothing for an activity-only trace when not streaming', () => {
        render(Trace, { message: messageWith([activity], false), features });
        expect(screen.queryByText('Answer reasoning')).toBeNull();
        expect(screen.queryByTestId('trace-steps')).toBeNull();
    });

    it('keeps the placeholder for an empty trace list while streaming', () => {
        render(Trace, { message: messageWith([], true), features });
        expect(screen.getByText('Reasoning about the answer...')).toBeInTheDocument();
    });
});
