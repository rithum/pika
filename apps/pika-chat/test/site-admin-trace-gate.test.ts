import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const getChatMessagesMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mayReceiveMock = jest.fn<(user: unknown, enabled: boolean) => boolean>();

jest.unstable_mockModule('$lib/server/config', () => ({
    appConfig: { pikaS3Bucket: 'bucket', awsRegion: 'us-east-1', chatApiId: 'api', stage: 'test', jwtSecret: 'secret' }
}));
jest.unstable_mockModule('pika-shared/util/server-utils', () => ({
    getOverridableFeatures: () => ({ traces: { enabled: true }, entity: { enabled: false } }),
    getEntityIdForUser: () => undefined
}));
jest.unstable_mockModule('$lib/server/chat-admin-apis', () => ({
    addChatSessionFeedback: jest.fn(),
    clearSvelteKitCache: jest.fn(),
    createOrUpdateChatAppOverride: jest.fn(),
    createOrUpdateSemanticDirective: jest.fn(),
    createOrUpdateTagDefinition: jest.fn(),
    deleteChatAppOverride: jest.fn(),
    deleteSemanticDirective: jest.fn(),
    deleteTagDefinition: jest.fn(),
    getAgent: jest.fn(),
    getAllAgents: jest.fn(),
    getAllChatApps: jest.fn(),
    getAllTools: jest.fn(),
    getChatApp: jest.fn(),
    getInstructionAssistanceConfigFromSsm: jest.fn(),
    getInstructionsAddedForUserMemory: jest.fn(),
    getSessionAnalytics: jest.fn(),
    getUserMemoriesForStrategy: jest.fn(),
    getUsersForUserList: jest.fn(),
    searchForSessions: jest.fn(),
    searchSemanticDirectives: jest.fn(),
    searchTagDefinitions: jest.fn(),
    updateChatSessionFeedback: jest.fn(),
    getMatchingChatApps: async () => [{ chatAppId: 'app-1' }]
}));
jest.unstable_mockModule('$lib/server/chat-apis', () => ({
    getChatMessages: (...args: unknown[]) => getChatMessagesMock(...args),
    searchForUser: jest.fn()
}));
jest.unstable_mockModule('$lib/custom/site-admin', () => ({
    isUserAllowedAdminAccess: async () => true
}));
jest.unstable_mockModule('$lib/custom/trace-content-access', () => ({
    mayReceiveTraceContent: (user: unknown, enabled: boolean) => mayReceiveMock(user, enabled)
}));

const { POST } = await import('../src/routes/(auth)/api/site-admin/+server');

const user = { userId: 'admin-1' };

function event() {
    return {
        locals: { user },
        request: new Request('https://example.com/api/site-admin', {
            method: 'POST',
            body: JSON.stringify({ command: 'getChatMessagesAsAdmin', sessionId: 's1', chatAppId: 'app-1', userId: 'u1' })
        })
    } as never;
}

describe('site-admin getChatMessagesAsAdmin trace gate', () => {
    beforeEach(() => {
        getChatMessagesMock.mockReset();
        getChatMessagesMock.mockResolvedValue({
            messages: [{ messageId: 's1:1', message: 'hi', traces: [{ a: 1 }], hasOffloadedTraces: true }]
        });
        mayReceiveMock.mockReset();
    });

    it('requests hydrated traces and returns them when the hook allows', async () => {
        mayReceiveMock.mockReturnValue(true);
        const response = (await POST(event())) as Response;
        const body = (await response.json()) as { messages: Record<string, unknown>[] };
        expect(getChatMessagesMock).toHaveBeenCalledWith('s1', 'u1', undefined, undefined, true);
        expect(mayReceiveMock).toHaveBeenCalledWith(user, true);
        expect(body.messages[0].traces).toEqual([{ a: 1 }]);
    });

    it('does not request traces and withholds them when the hook denies', async () => {
        mayReceiveMock.mockReturnValue(false);
        const response = (await POST(event())) as Response;
        const body = (await response.json()) as { messages: Record<string, unknown>[] };
        expect(getChatMessagesMock).toHaveBeenCalledWith('s1', 'u1', undefined, undefined, false);
        expect(body.messages[0]).not.toHaveProperty('traces');
        expect(body.messages[0].hasOffloadedTraces).toBe(false);
    });
});
