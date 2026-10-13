import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Trace from '../../src/lib/client/features/chat/chat-app-main/trace.svelte';
import type { ChatAppOverridableFeatures, ChatMessageForRendering } from 'pika-shared/types/chatbot/chatbot-types';

vi.mock('pika-ux/shadcn/button', async () => ({
    Button: (await import('pika-ux/shadcn/button/button.svelte')).default
}));

const features = { traces: { enabled: true, detailedTraces: false } } as unknown as ChatAppOverridableFeatures;

function makeMessage() {
    return {
        messageId: 's1:1',
        sessionId: 's1',
        segments: [],
        traces: [],
        hasOffloadedTraces: true
    } as unknown as ChatMessageForRendering;
}

function makeStub(status: string) {
    return {
        getTraceLoadState: vi.fn(() => ({ status })),
        loadTracesForMessage: vi.fn(),
        retryTraceLoad: vi.fn()
    };
}

describe('trace.svelte offloaded traces', () => {
    it('shows a loading indicator while loading', () => {
        render(Trace, { message: makeMessage(), features, chatAppState: makeStub('loading') as never });
        expect(screen.getByText('Loading reasoning...')).toBeInTheDocument();
    });

    it('shows an error with a working Retry button', async () => {
        const message = makeMessage();
        const stub = makeStub('error');
        render(Trace, { message, features, chatAppState: stub as never });
        expect(screen.getByText("Couldn't load the reasoning for this answer.")).toBeInTheDocument();
        await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(stub.retryTraceLoad).toHaveBeenCalledWith(message);
    });

    it('shows the empty message', () => {
        render(Trace, { message: makeMessage(), features, chatAppState: makeStub('empty') as never });
        expect(screen.getByText('No reasoning was recorded for this answer.')).toBeInTheDocument();
    });

    it('requests the load once on mount', () => {
        const message = makeMessage();
        const stub = makeStub('idle');
        render(Trace, { message, features, chatAppState: stub as never });
        expect(stub.loadTracesForMessage).toHaveBeenCalledTimes(1);
        expect(stub.loadTracesForMessage).toHaveBeenCalledWith(message);
    });

    it('explains when there is no chatAppState', () => {
        render(Trace, { message: makeMessage(), features });
        expect(screen.getByText("Reasoning for this answer isn't available in this view.")).toBeInTheDocument();
    });
});
