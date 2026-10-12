import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mayReceiveMock = jest.fn<(user: unknown, enabled: boolean) => boolean>();
const invokeMock = jest.fn<(params: { features?: Record<string, unknown> }) => Promise<Response>>();

const INVOCATION_FRAME = `<trace>${JSON.stringify({
    orchestrationTrace: {
        invocationInput: { actionGroupInvocationInput: { function: 'get_weather', parameters: [{ name: 'city', value: 'Paris' }], userLabel: 'Checking' } }
    }
})}</trace>`;
const UPSTREAM_BODY = `hi${INVOCATION_FRAME}`;

jest.mock('$lib/server/config', () => ({
    appConfig: { pikaS3Bucket: 'bucket', awsRegion: 'us-east-1', chatApiId: 'api', stage: 'test', jwtSecret: 'secret' }
}));
jest.mock('pika-shared/util/server-utils', () => ({
    getOverridableFeatures: () => ({ traces: { enabled: true }, entity: { enabled: false }, fileUpload: { enabled: true } }),
    getEntityIdForUser: () => undefined
}));
jest.mock('$lib/server/chat-admin-apis', () => ({
    getMatchingChatApps: async () => [{ chatAppId: 'app-1' }]
}));
jest.mock('$lib/custom/server-hooks', () => ({
    transformCustomUserData: async (data: unknown) => data
}));
jest.mock('$lib/server/resolve-user-id', () => ({
    resolveUserId: async () => 'u1'
}));
jest.mock('$lib/custom/trace-content-access', () => ({
    mayReceiveTraceContent: (user: unknown, enabled: boolean) => mayReceiveMock(user, enabled)
}));
jest.mock('$lib/server/invoke-converse-fn-url', () => ({
    invokeConverseFunctionUrl: (params: { features?: Record<string, unknown> }) => invokeMock(params)
}));

import { POST } from '../src/routes/(auth)/api/message/+server';

function event() {
    return {
        request: new Request('https://example.com/api/message', {
            method: 'POST',
            body: JSON.stringify({ userId: 'u1', message: 'hello', agentId: 'agent-1', chatAppId: 'app-1', features: { traces: { enabled: true } } })
        }),
        locals: { user: { userId: 'u1' } },
        cookies: {}
    } as never;
}

describe('POST /api/message live trace forwarding', () => {
    let captured: { features?: Record<string, unknown> } | undefined;

    beforeEach(() => {
        captured = undefined;
        mayReceiveMock.mockReset();
        invokeMock.mockReset();
        invokeMock.mockImplementation(async (params) => {
            captured = params;
            return new Response(UPSTREAM_BODY, { headers: { 'x-chatbot-session-id': 's1' } });
        });
    });

    it('sends traces disabled and redacts the stream when the hook denies', async () => {
        mayReceiveMock.mockReturnValue(false);
        const response = (await POST(event())) as Response;
        const text = await response.text();
        expect(captured?.features?.traces).toEqual({ enabled: false });
        expect(text).toContain('"event":"start"');
        expect(text).not.toContain('get_weather');
        expect(text.startsWith('hi<trace>')).toBe(true);
    });

    it('sends traces enabled and forwards the stream byte-identical when the hook allows', async () => {
        mayReceiveMock.mockReturnValue(true);
        const response = (await POST(event())) as Response;
        expect(captured?.features?.traces).toEqual({ enabled: true });
        expect(await response.text()).toBe(UPSTREAM_BODY);
    });
});
