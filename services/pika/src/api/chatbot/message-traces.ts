import type { Trace } from '@aws-sdk/client-bedrock-agent-runtime';
import type { ChatMessage } from 'pika-shared/types/chatbot/chatbot-types';

// Lambda responses cap at 6 MB; past this, messages fall back to the lazy traces route.
export const INCLUDE_TRACES_MAX_BYTES = 5_000_000;

export function messageBelongsToSession(sessionId: string, messageId: string): boolean {
    return messageId.startsWith(`${sessionId}:`);
}

export async function applyOffloadedTraces(
    messages: ChatMessage[],
    includeTraces: boolean,
    hydrate: (m: ChatMessage) => Promise<Trace[]>,
    maxBytes: number = INCLUDE_TRACES_MAX_BYTES
): Promise<void> {
    const offloaded = messages.filter((m) => m.tracesS3);

    if (!includeTraces) {
        for (const m of offloaded) {
            m.hasOffloadedTraces = true;
            delete m.tracesS3;
        }
        return;
    }

    const results = await Promise.allSettled(offloaded.map((m) => hydrate(m)));

    let totalBytes = 0;
    let budgetExceeded = false;
    offloaded.forEach((m, i) => {
        const result = results[i];
        if (result.status === 'rejected') {
            console.error(`Failed to hydrate traces for message ${m.messageId}:`, result.reason);
            m.hasOffloadedTraces = true;
        } else if (budgetExceeded) {
            m.hasOffloadedTraces = true;
        } else {
            const bytes = Buffer.byteLength(JSON.stringify(result.value));
            if (totalBytes + bytes > maxBytes) {
                budgetExceeded = true;
                m.hasOffloadedTraces = true;
            } else {
                totalBytes += bytes;
                m.traces = result.value;
            }
        }
        delete m.tracesS3;
    });
}
