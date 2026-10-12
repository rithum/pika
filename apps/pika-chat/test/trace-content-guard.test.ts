import { describe, it, expect } from '@jest/globals';
import type { ChatMessage } from 'pika-shared/types/chatbot/chatbot-types';
import { isTraceS3Key, withholdTraceContent } from '$lib/server/trace-content-guard';

describe('isTraceS3Key', () => {
    it('matches keys under the traces/ prefix, with or without a leading slash', () => {
        expect(isTraceS3Key('traces/u/s/m.json.gz')).toBe(true);
        expect(isTraceS3Key('/traces/x')).toBe(true);
    });

    it('does not match other keys', () => {
        expect(isTraceS3Key('uploads/traces/x')).toBe(false);
        expect(isTraceS3Key('tracesx/y')).toBe(false);
        expect(isTraceS3Key('Traces/x')).toBe(false);
    });
});

describe('withholdTraceContent', () => {
    it('removes trace content fields, marks traces unavailable and keeps the rest', () => {
        const message = {
            message: 'hello',
            messageId: 's1:1',
            traces: [{ a: 1 }],
            tracesS3: { key: 'traces/u/s/m.json.gz' },
            llmInstructions: 'system prompt',
            tracesStrGzipped: 'abc',
            hasOffloadedTraces: true
        } as unknown as ChatMessage;

        const [result] = withholdTraceContent([message]);

        expect(result).not.toHaveProperty('traces');
        expect(result).not.toHaveProperty('tracesS3');
        expect(result).not.toHaveProperty('llmInstructions');
        expect(result).not.toHaveProperty('tracesStrGzipped');
        expect(result.hasOffloadedTraces).toBe(false);
        expect(result.message).toBe('hello');
        expect(result.messageId).toBe('s1:1');
    });
});
