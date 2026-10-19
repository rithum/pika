import { jest } from '@jest/globals';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { ChatMessage } from 'pika-shared/types/chatbot/chatbot-types';

process.env.AWS_REGION = 'us-east-1';
process.env.PIKA_S3_BUCKET = 'pika-test-bucket';

const getChatMessagesInSession = jest.fn<(userId: string, sessionId: string) => Promise<ChatMessage[]>>();
jest.mock('../../src/lib/chat-ddb', () => ({
    getChatMessagesInSession: (u: string, s: string) => getChatMessagesInSession(u, s)
}));

const getTracesForMessage = jest.fn<(m: ChatMessage) => Promise<unknown[]>>();
jest.mock('../../src/lib/trace-store', () => ({
    getTracesForMessage: (m: ChatMessage) => getTracesForMessage(m)
}));

jest.mock('../../src/lib/opensearch/opensearch-client', () => ({
    __esModule: true,
    default: { getClient: jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('no opensearch in test')) }
}));

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) })),
    PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input }))
}));

const bedrockSend = jest.spyOn(BedrockRuntimeClient.prototype, 'send');

import { analyzeSession } from '../../src/lambda/session-insights-runner/insights-analyzer';

const SCORING = { assessments: { critical_issues_present: false, requires_followup: false, escalation_needed: false } };

function message(messageId: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
    return { userId: 'u1', sessionId: 's1', messageId, message: 'm', source: 'assistant', timestamp: 't', ...overrides };
}

function offloaded(messageId: string): ChatMessage {
    return message(messageId, { tracesS3: { s3Key: `traces/u1/s1/${messageId}.json.gz`, traceCount: 1, compressedSize: 10 } });
}

function rationale(text: string) {
    return [{ orchestrationTrace: { rationale: { text } } }];
}

const session = { sessionId: 's1', userId: 'u1', chatAppId: 'app', agentId: 'agent', lastMessageId: 's1:9' } as any;

function sentPrompt(): string {
    const body = JSON.parse((bedrockSend.mock.calls[0][0] as any).input.body);
    return body.messages[0].content[0].text;
}

beforeEach(() => {
    getChatMessagesInSession.mockReset();
    getTracesForMessage.mockReset();
    bedrockSend.mockReset();
    bedrockSend.mockImplementation((async () => ({
        body: new TextEncoder().encode(
            JSON.stringify({ model: 'm', usage: {}, content: [{ type: 'text', text: `<json>${JSON.stringify(SCORING)}</json>` }] })
        )
    })) as never);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('analyzeSession trace hydration', () => {
    it('hydrates an offloaded assistant message before extracting its thinking', async () => {
        getChatMessagesInSession.mockResolvedValue([offloaded('s1:1')]);
        getTracesForMessage.mockResolvedValue(rationale('OFFLOADED RATIONALE'));

        await analyzeSession(session, []);

        expect(getTracesForMessage).toHaveBeenCalledTimes(1);
        expect(sentPrompt()).toContain('OFFLOADED RATIONALE');
    });

    it('does not hydrate messages that already carry inline traces', async () => {
        getChatMessagesInSession.mockResolvedValue([message('s1:1', { traces: rationale('INLINE RATIONALE') as any })]);

        await analyzeSession(session, []);

        expect(getTracesForMessage).not.toHaveBeenCalled();
        expect(sentPrompt()).toContain('INLINE RATIONALE');
    });

    it('continues the analysis when hydrating one message fails', async () => {
        getChatMessagesInSession.mockResolvedValue([offloaded('s1:1'), offloaded('s1:2')]);
        getTracesForMessage.mockRejectedValueOnce(new Error('S3 throttled')).mockResolvedValueOnce(rationale('SECOND RATIONALE'));

        const outcome = await analyzeSession(session, []);

        expect(bedrockSend).toHaveBeenCalledTimes(1);
        expect(sentPrompt()).toContain('SECOND RATIONALE');
        expect(outcome.update).toBeDefined();
    });
});
