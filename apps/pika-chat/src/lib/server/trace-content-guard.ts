import type { ChatMessage } from 'pika-shared/types/chatbot/chatbot-types';

export const TRACE_S3_KEY_PREFIX = 'traces/';

export function isTraceS3Key(key: string): boolean {
    return key.replace(/^\/+/, '').startsWith(TRACE_S3_KEY_PREFIX);
}

export function withholdTraceContent<T extends ChatMessage>(messages: T[]): T[] {
    for (const m of messages) {
        delete m.traces;
        delete m.tracesS3;
        delete m.llmInstructions;
        delete m.tracesStrGzipped;
        m.hasOffloadedTraces = false;
    }
    return messages;
}
