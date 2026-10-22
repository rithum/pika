import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { ChatUser, CreateSharedSessionRequest, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

const invokeApiMock = jest.fn<(args: { path: string; body?: unknown }) => Promise<{ body: unknown }>>();

jest.mock('$lib/server/invoke-api', () => ({
    invokeApi: (args: { path: string; body?: unknown }) => invokeApiMock(args)
}));
jest.mock('$lib/server/config', () => ({
    appConfig: { pikaS3Bucket: 'bucket', awsRegion: 'us-east-1', chatApiId: 'api', stage: 'test', jwtSecret: 'secret' }
}));

import { createSharedSession } from '$lib/server/chat-apis';

const user = { userId: 'u1', roles: ['partner'] } as ChatUser<RecordOrUndef>;
const request: CreateSharedSessionRequest = { sessionId: 's1', sessionUserId: 'owner', chatAppId: 'app' };

describe('createSharedSession body', () => {
    beforeEach(() => {
        invokeApiMock.mockReset();
        invokeApiMock.mockResolvedValue({ body: {} });
    });

    it('sends the request with the session user roles', async () => {
        await createSharedSession(user, request);
        expect(invokeApiMock.mock.calls[0][0].body).toEqual({ ...request, roles: ['partner'] });
    });

    it('overwrites a roles value supplied in the request', async () => {
        await createSharedSession(user, { ...request, roles: ['admin'] });
        expect(invokeApiMock.mock.calls[0][0].body).toEqual({ ...request, roles: ['partner'] });
    });
});
