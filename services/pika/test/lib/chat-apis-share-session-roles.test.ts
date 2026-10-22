import { jest } from '@jest/globals';
import type { ChatApp, ChatSession, ChatUser, CreateSharedSessionRequest, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

const REQUIRED_ROLE = 'partner';

const getChatSessionByUserIdAndSessionId = jest.fn<() => Promise<ChatSession<RecordOrUndef> | undefined>>();
const markSessionAsShared = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const getChatApp = jest.fn<() => Promise<ChatApp | undefined>>();

jest.mock('../../src/lib/chat-ddb', () => ({
    getChatSessionByUserIdAndSessionId: () => getChatSessionByUserIdAndSessionId(),
    markSessionAsShared: () => markSessionAsShared()
}));
jest.mock('../../src/lib/bedrock-agent', () => ({}));
jest.mock('../../src/lib/chat-admin-apis', () => ({
    getChatApp: () => getChatApp()
}));
jest.mock('../../src/lib/chat-admin-ddb', () => ({}));
jest.mock('../../src/lib/utils', () => ({
    createSessionToken: () => 'token',
    getAccountBackfillAttributes: () => ({}),
    hasSessionAccountContext: () => true,
    getNextMessageId: (sessionId: string) => `${sessionId}:1`,
    validateUserCanAccessSession: () => ({ success: true, hasAccess: true }),
    getEntityFromCustomData: () => undefined
}));

import { createSharedSessionForSession } from '../../src/lib/chat-apis';

const chatApp = {
    chatAppId: 'app',
    title: 'App',
    agentId: 'agent-1',
    enabled: true,
    userTypes: ['internal-user'],
    userRoles: [REQUIRED_ROLE],
    applyRulesAs: 'and',
    features: {}
} as unknown as ChatApp;

function internalUser(roles: string[] | undefined): ChatUser<RecordOrUndef> {
    return { userId: 'sharer', firstName: 'A', lastName: 'B', userType: 'internal-user', features: {}, roles } as ChatUser<RecordOrUndef>;
}

function shareRequest(roles?: string[]): CreateSharedSessionRequest {
    return { sessionId: 's1', sessionUserId: 'owner', chatAppId: 'app', ...(roles ? { roles } : {}) };
}

beforeEach(() => {
    markSessionAsShared.mockClear();
    getChatSessionByUserIdAndSessionId.mockResolvedValue({ sessionId: 's1', userId: 'owner', chatAppId: 'app' } as ChatSession<RecordOrUndef>);
    getChatApp.mockResolvedValue(chatApp);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('createSharedSessionForSession role source for an internal user sharing another user session', () => {
    it('shares when request.roles has the required role the stored roles lack', async () => {
        const response = await createSharedSessionForSession(internalUser([]), shareRequest([REQUIRED_ROLE]));

        expect(response.success).toBe(true);
        expect(markSessionAsShared).toHaveBeenCalledTimes(1);
    });

    it('throws a 403 when the stored roles have the required role but request.roles is empty', async () => {
        await expect(createSharedSessionForSession(internalUser([REQUIRED_ROLE]), shareRequest([]))).rejects.toMatchObject({ statusCode: 403 });
        expect(markSessionAsShared).not.toHaveBeenCalled();
    });

    it('uses the stored roles when request.roles is undefined', async () => {
        const response = await createSharedSessionForSession(internalUser([REQUIRED_ROLE]), shareRequest());

        expect(response.success).toBe(true);
    });
});
