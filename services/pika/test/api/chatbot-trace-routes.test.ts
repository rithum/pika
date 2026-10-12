import { jest } from '@jest/globals';
import { S3 } from '@aws-sdk/client-s3';
import { gzipSync } from 'zlib';
import { gunzipBase64EncodedString, gzipAndBase64EncodeString } from 'pika-shared/util/server-utils';
import type { ChatMessage } from 'pika-shared/types/chatbot/chatbot-types';

process.env.STAGE = 'test';
process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE = 'pika';
process.env.PIKA_S3_BUCKET = 'test-pika-bucket';
process.env.AWS_REGION = 'us-east-1';

const getChatSession = jest.fn<(userId: string, sessionId: string) => Promise<unknown>>();
const getChatMessages = jest.fn<(userId: string, sessionId: string) => Promise<ChatMessage[]>>();
const getChatMessageById = jest.fn<(userId: string, messageId: string) => Promise<ChatMessage | undefined>>();

jest.mock('../../src/lib/chat-apis', () => ({
    getChatSession: (u: string, s: string) => getChatSession(u, s),
    getChatMessages: (u: string, s: string) => getChatMessages(u, s)
}));
jest.mock('../../src/lib/chat-ddb', () => ({
    getChatMessageById: (u: string, m: string) => getChatMessageById(u, m),
    getChatSessionByShareId: jest.fn(),
    getUserByUserId: jest.fn<() => Promise<unknown>>().mockResolvedValue({ userId: 'u1', userType: 'external-user' })
}));
jest.mock('../../src/lib/memory', () => ({}));
jest.mock('../../src/lib/ssm', () => ({
    getValueFromParameterStore: jest.fn<() => Promise<string>>().mockResolvedValue('secret')
}));
jest.mock('../../src/lib/utils', () => ({
    getRegion: () => 'us-east-1',
    getMemoryId: jest.fn(),
    validateUserCanAccessSession: jest.fn()
}));
jest.mock('pika-shared/util/jwt', () => ({
    extractFromJwtString: () => [{ userId: 'u1' }, undefined]
}));

import { handlerFn } from '../../src/api/chatbot/index';

const sendSpy = jest.spyOn(S3.prototype, 'send');

function s3Gzipped(payload: string) {
    const gzipped = gzipSync(payload);
    return { Body: { transformToByteArray: async () => new Uint8Array(gzipped) } };
}

function request(path: string, query?: Record<string, string>) {
    return {
        httpMethod: 'GET',
        path,
        headers: { 'x-chat-auth': 'jwt' },
        pathParameters: {},
        queryStringParameters: query
    } as any;
}

function offloaded(messageId: string): ChatMessage {
    return {
        userId: 'u1',
        sessionId: 's1',
        messageId,
        message: 'm',
        source: 'assistant',
        timestamp: 't',
        tracesS3: { s3Key: `traces/u1/s1/${messageId}.json.gz`, traceCount: 1, compressedSize: 10 }
    };
}

beforeEach(() => {
    sendSpy.mockReset();
    getChatSession.mockReset().mockResolvedValue({ sessionId: 's1', userId: 'u1' });
    getChatMessages.mockReset();
    getChatMessageById.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('GET /api/chat/{sessionId}/messages/{messageId}/traces', () => {
    it('rejects a messageId that does not belong to the session', async () => {
        await expect(handlerFn(request('/api/chat/s1/messages/other:1/traces'))).rejects.toThrow(/does not belong to this session/);

        expect(getChatMessageById).not.toHaveBeenCalled();
    });

    it('returns an empty trace list when the message no longer exists', async () => {
        getChatMessageById.mockResolvedValue(undefined);

        const response = await handlerFn(request('/api/chat/s1/messages/s1:1/traces'));

        expect(response).toEqual({ success: true, traces: [] });
    });

    it('hydrates an offloaded message and reconstitutes its llm-instruction', async () => {
        getChatMessageById.mockResolvedValue(offloaded('s1:1'));
        const stored = [
            {
                orchestrationTrace: {
                    rationale: {
                        text: JSON.stringify({
                            type: 'llm-instruction',
                            systemPromptRef: 'system-prompt-abcd1234',
                            compressedData: gzipAndBase64EncodeString('delta')
                        })
                    }
                }
            }
        ];
        sendSpy.mockImplementation((async (cmd: any) =>
            cmd.input.Key.includes('system-prompt-') ? s3Gzipped('THE SYSTEM PROMPT') : s3Gzipped(JSON.stringify(stored))) as never);

        const response: any = await handlerFn(request('/api/chat/s1/messages/s1:1/traces'));

        expect(response.success).toBe(true);
        const data = JSON.parse(response.traces[0].orchestrationTrace.rationale.text);
        expect(data.systemPromptRef).toBeUndefined();
        expect(gunzipBase64EncodedString(data.compressedData)).toBe('THE SYSTEM PROMPT\n\ndelta');
    });
});

describe('GET /api/chat/{sessionId}/messages', () => {
    it('flags offloaded messages without reading S3 when includeTraces is absent', async () => {
        getChatMessages.mockResolvedValue([offloaded('s1:1'), offloaded('s1:2')]);

        const response: any = await handlerFn(request('/api/chat/s1/messages'));

        expect(sendSpy).not.toHaveBeenCalled();
        expect(response.messages.map((m: ChatMessage) => m.hasOffloadedTraces)).toEqual([true, true]);
        expect(response.messages[0]).not.toHaveProperty('tracesS3');
    });

    it('hydrates three offloaded messages in parallel when includeTraces=true', async () => {
        getChatMessages.mockResolvedValue([offloaded('s1:1'), offloaded('s1:2'), offloaded('s1:3')]);
        const resolvers: Array<() => void> = [];
        sendSpy.mockImplementation((() =>
            new Promise((resolve) => resolvers.push(() => resolve(s3Gzipped('[]'))))) as never);

        const pending = handlerFn(request('/api/chat/s1/messages', { includeTraces: 'true' }));
        await new Promise((r) => setTimeout(r, 20));

        expect(sendSpy).toHaveBeenCalledTimes(3);
        resolvers.forEach((resolve) => resolve());
        const response: any = await pending;
        expect(response.messages.every((m: ChatMessage) => Array.isArray(m.traces))).toBe(true);
    });
});

describe('GET /api/chat/{sessionId}/messages hydration failure', () => {
    it('leaves only the failing message without traces and keeps the others', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        getChatMessages.mockResolvedValue([offloaded('s1:1'), offloaded('s1:2'), offloaded('s1:3')]);
        sendSpy.mockImplementation((async (cmd: any) => {
            if (cmd.input.Key.includes('s1:2')) {
                throw new Error('S3 throttled');
            }
            return s3Gzipped('[]');
        }) as never);

        const response: any = await handlerFn(request('/api/chat/s1/messages', { includeTraces: 'true' }));

        const [first, second, third] = response.messages as ChatMessage[];
        expect(second.hasOffloadedTraces).toBe(true);
        expect(second).not.toHaveProperty('traces');
        expect(first.traces).toEqual([]);
        expect(third.traces).toEqual([]);
    });
});
