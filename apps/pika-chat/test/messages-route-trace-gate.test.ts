import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const getChatMessagesMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mayReceiveMock = jest.fn<(user: unknown, enabled: boolean) => boolean>();

jest.mock('$lib/server/config', () => ({
    appConfig: { pikaS3Bucket: 'bucket', awsRegion: 'us-east-1', chatApiId: 'api', stage: 'test', jwtSecret: 'secret' }
}));
jest.mock('pika-shared/util/server-utils', () => ({
    getOverridableFeatures: () => ({ traces: { enabled: true }, entity: { enabled: false } }),
    getEntityIdForUser: () => undefined
}));
jest.mock('$lib/server/chat-admin-apis', () => ({
    getMatchingChatApps: async () => [{ chatAppId: 'app-1' }]
}));
jest.mock('$lib/server/chat-apis', () => ({
    getChatMessages: (...args: unknown[]) => getChatMessagesMock(...args)
}));
jest.mock('$lib/custom/trace-content-access', () => ({
    mayReceiveTraceContent: (user: unknown, enabled: boolean) => mayReceiveMock(user, enabled)
}));

import { GET } from '../src/routes/(auth)/api/message/[chatAppId]/[sessionId]/+server';

const user = { userId: 'u1' };

function event() {
    return {
        params: { chatAppId: 'app-1', sessionId: 's1' },
        locals: { user },
        url: new URL('https://example.com/api/message/app-1/s1'),
        request: new Request('https://example.com/'),
        cookies: {}
    } as never;
}

describe('GET /api/message/[chatAppId]/[sessionId] trace gate', () => {
    beforeEach(() => {
        getChatMessagesMock.mockReset();
        getChatMessagesMock.mockResolvedValue({
            messages: [{ messageId: 's1:1', message: 'hi', traces: [{ a: 1 }], hasOffloadedTraces: true }]
        });
        mayReceiveMock.mockReset();
    });

    it('drops inline traces when the hook denies', async () => {
        mayReceiveMock.mockReturnValue(false);
        const response = (await GET(event())) as Response;
        const body = (await response.json()) as { messages: Record<string, unknown>[] };
        expect(body.messages[0]).not.toHaveProperty('traces');
        expect(body.messages[0].hasOffloadedTraces).toBe(false);
        expect(body.messages[0].message).toBe('hi');
        expect(mayReceiveMock).toHaveBeenCalledWith(user, true);
    });

    it('leaves messages unchanged when the hook allows', async () => {
        mayReceiveMock.mockReturnValue(true);
        const response = (await GET(event())) as Response;
        const body = (await response.json()) as { messages: Record<string, unknown>[] };
        expect(body.messages[0]).toEqual({ messageId: 's1:1', message: 'hi', traces: [{ a: 1 }], hasOffloadedTraces: true });
    });
});
