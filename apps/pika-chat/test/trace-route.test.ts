import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const getMessageTracesMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
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
    getMessageTraces: (...args: unknown[]) => getMessageTracesMock(...args)
}));
jest.mock('$lib/custom/trace-content-access', () => ({
    mayReceiveTraceContent: (user: unknown, enabled: boolean) => mayReceiveMock(user, enabled)
}));

import { GET } from '../src/routes/(auth)/api/trace/[chatAppId]/[sessionId]/[messageId]/+server';

const user = { userId: 'u1' };

function event(params: Record<string, string>) {
    return {
        params,
        locals: { user },
        url: new URL('https://example.com/api/trace/app-1/s1/s1:1'),
        request: new Request('https://example.com/'),
        cookies: {}
    } as never;
}

describe('GET /api/trace/[chatAppId]/[sessionId]/[messageId]', () => {
    beforeEach(() => {
        getMessageTracesMock.mockReset();
        getMessageTracesMock.mockResolvedValue({ traces: [{ a: 1 }] });
        mayReceiveMock.mockReset();
    });

    it('returns traces when the hook allows trace content', async () => {
        mayReceiveMock.mockReturnValue(true);
        const response = (await GET(event({ chatAppId: 'app-1', sessionId: 's1', messageId: 's1:1' }))) as Response;
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ traces: [{ a: 1 }] });
        expect(getMessageTracesMock).toHaveBeenCalledWith('s1', 's1:1', 'u1', undefined, undefined);
        expect(mayReceiveMock).toHaveBeenCalledWith(user, true);
    });

    it('returns 403 without fetching traces when the hook denies', async () => {
        mayReceiveMock.mockReturnValue(false);
        await expect(GET(event({ chatAppId: 'app-1', sessionId: 's1', messageId: 's1:1' }))).rejects.toMatchObject({ status: 403 });
        expect(getMessageTracesMock).not.toHaveBeenCalled();
    });

    it('returns 400 when messageId is missing', async () => {
        await expect(GET(event({ chatAppId: 'app-1', sessionId: 's1' }))).rejects.toMatchObject({ status: 400 });
    });
});
