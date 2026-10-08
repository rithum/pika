/** Guards trace.svelte: unrecognized rationale text is rendered only when detailed traces are enabled. */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Trace from '../../src/lib/client/features/chat/chat-app-main/trace.svelte';
import type { ChatAppOverridableFeatures, ChatMessageForRendering } from 'pika-shared/types/chatbot/chatbot-types';

const RATIONALE = 'internal planner reasoning that is not a typed trace';

const message = {
    messageId: 'm1',
    segments: [],
    traces: [{ orchestrationTrace: { rationale: { text: RATIONALE, traceId: 't1' } } }]
} as unknown as ChatMessageForRendering;

function features(detailedTraces: boolean) {
    return { traces: { enabled: true, detailedTraces } } as unknown as ChatAppOverridableFeatures;
}

describe('trace.svelte detailed-trace gate', () => {
    it('hides unrecognized rationale text when detailed traces are off', () => {
        render(Trace, { message, features: features(false) });
        expect(screen.queryByText(RATIONALE)).toBeNull();
    });

    it('shows unrecognized rationale text when detailed traces are on', () => {
        render(Trace, { message, features: features(true) });
        expect(screen.getByText(RATIONALE)).toBeInTheDocument();
    });
});
