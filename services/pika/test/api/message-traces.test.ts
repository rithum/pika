import { describe, it, expect, jest } from '@jest/globals';
import type { Trace } from '@aws-sdk/client-bedrock-agent-runtime';
import type { ChatMessage } from 'pika-shared/types/chatbot/chatbot-types';
import { applyOffloadedTraces, messageBelongsToSession } from '../../src/api/chatbot/message-traces';

const POINTER = { s3Key: 'traces/u1/s1/m.json.gz', traceCount: 1, compressedSize: 10 };

function offloaded(messageId: string): ChatMessage {
    return { userId: 'u1', sessionId: 's1', messageId, message: 'm', source: 'assistant', timestamp: 't', tracesS3: POINTER };
}

function tracesOf(text: string): Trace[] {
    return [{ orchestrationTrace: { rationale: { text } } }] as Trace[];
}

describe('applyOffloadedTraces', () => {
    it('flags offloaded messages without hydrating when includeTraces is false', async () => {
        const hydrate = jest.fn<(m: ChatMessage) => Promise<Trace[]>>();
        const messages = [offloaded('s1:1')];

        await applyOffloadedTraces(messages, false, hydrate);

        expect(hydrate).not.toHaveBeenCalled();
        expect(messages[0].hasOffloadedTraces).toBe(true);
        expect(messages[0]).not.toHaveProperty('tracesS3');
        expect(messages[0]).not.toHaveProperty('traces');
    });

    it('sets hydrated traces and drops the pointer when includeTraces is true', async () => {
        const traces = tracesOf('a');
        const messages = [offloaded('s1:1')];

        await applyOffloadedTraces(messages, true, async () => traces);

        expect(messages[0].traces).toEqual(traces);
        expect(messages[0]).not.toHaveProperty('tracesS3');
        expect(messages[0].hasOffloadedTraces).toBeUndefined();
    });

    it('starts every hydration before any resolves', async () => {
        const resolvers: Array<(t: Trace[]) => void> = [];
        const hydrate = jest.fn<(m: ChatMessage) => Promise<Trace[]>>().mockImplementation(() => new Promise<Trace[]>((resolve) => resolvers.push(resolve)));
        const messages = [offloaded('s1:1'), offloaded('s1:2')];

        const pending = applyOffloadedTraces(messages, true, hydrate);
        await Promise.resolve();

        expect(hydrate).toHaveBeenCalledTimes(2);
        resolvers.forEach((resolve) => resolve(tracesOf('x')));
        await pending;
    });

    it('falls back to the flag for messages past the byte budget', async () => {
        const first = tracesOf('a');
        const budget = Buffer.byteLength(JSON.stringify(first));
        const messages = [offloaded('s1:1'), offloaded('s1:2')];

        await applyOffloadedTraces(messages, true, async () => first, budget);

        expect(messages[0].traces).toEqual(first);
        expect(messages[1].hasOffloadedTraces).toBe(true);
        expect(messages[1]).not.toHaveProperty('traces');
        expect(messages[1]).not.toHaveProperty('tracesS3');
    });

    it('flags a message whose hydration rejects without throwing', async () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const messages = [offloaded('s1:1')];

        await expect(applyOffloadedTraces(messages, true, async () => Promise.reject(new Error('S3 down')))).resolves.toBeUndefined();

        expect(messages[0].hasOffloadedTraces).toBe(true);
        expect(messages[0]).not.toHaveProperty('tracesS3');
        errorSpy.mockRestore();
    });

    it.each([true, false])('leaves legacy inline traces untouched (includeTraces=%s)', async (includeTraces) => {
        const inline = tracesOf('legacy');
        const message: ChatMessage = { ...offloaded('s1:1'), tracesS3: undefined, traces: inline };
        const hydrate = jest.fn<(m: ChatMessage) => Promise<Trace[]>>();

        await applyOffloadedTraces([message], includeTraces, hydrate);

        expect(hydrate).not.toHaveBeenCalled();
        expect(message.traces).toBe(inline);
        expect(message.hasOffloadedTraces).toBeUndefined();
    });
});

describe('messageBelongsToSession', () => {
    it('matches only the exact session prefix', () => {
        expect(messageBelongsToSession('sess-1', 'sess-1:123')).toBe(true);
        expect(messageBelongsToSession('sess-1', 'sess-10:123')).toBe(false);
        expect(messageBelongsToSession('sess-1', 'other:1')).toBe(false);
    });
});
