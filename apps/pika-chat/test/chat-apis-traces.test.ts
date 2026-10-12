import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const invokeApiMock = jest.fn<(args: { path: string }) => Promise<{ body: unknown }>>();

jest.mock('$lib/server/invoke-api', () => ({
    invokeApi: (args: { path: string }) => invokeApiMock(args)
}));
jest.mock('$lib/server/config', () => ({
    appConfig: { pikaS3Bucket: 'bucket', awsRegion: 'us-east-1', chatApiId: 'api', stage: 'test', jwtSecret: 'secret' }
}));

import { getChatMessages, getMessageTraces } from '$lib/server/chat-apis';

describe('chat-apis trace paths', () => {
    beforeEach(() => {
        invokeApiMock.mockReset();
        invokeApiMock.mockResolvedValue({ body: {} });
    });

    it('getMessageTraces encodes the message id', async () => {
        await getMessageTraces('s1', 's1:1', 'u1');
        expect(invokeApiMock.mock.calls[0][0].path).toBe('test/api/chat/s1/messages/s1%3A1/traces');
    });

    it('getMessageTraces adds share and entity segments', async () => {
        await getMessageTraces('s1', 's1:1', 'u1', 'sh1', 'e1');
        expect(invokeApiMock.mock.calls[0][0].path).toBe('test/api/chat/s1/messages/s1%3A1/traces/share/sh1/entity/e1');
    });

    it('getChatMessages appends includeTraces only when asked', async () => {
        await getChatMessages('s1', 'u1', undefined, undefined, true);
        await getChatMessages('s1', 'u1');
        expect(invokeApiMock.mock.calls[0][0].path).toBe('test/api/chat/s1/messages?includeTraces=true');
        expect(invokeApiMock.mock.calls[1][0].path).toBe('test/api/chat/s1/messages');
    });
});
