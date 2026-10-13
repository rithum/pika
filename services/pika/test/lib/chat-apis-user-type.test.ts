import { jest } from '@jest/globals';
import type { BaseRequestData, ChatMessage, ChatSession, ChatUser, RecordOrUndef, SimpleAuthenticatedUser } from 'pika-shared/types/chatbot/chatbot-types';

const addChatSession = jest.fn<(session: ChatSession<RecordOrUndef>) => Promise<void>>().mockResolvedValue(undefined);
const addMessage = jest.fn<(message: ChatMessage) => Promise<void>>().mockResolvedValue(undefined);
const updateSession = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock('../../src/lib/chat-ddb', () => ({
    addChatSession: (session: ChatSession<RecordOrUndef>) => addChatSession(session),
    addMessage: (message: ChatMessage) => addMessage(message),
    updateSession: () => updateSession()
}));
jest.mock('../../src/lib/bedrock-agent', () => ({}));
jest.mock('../../src/lib/chat-admin-apis', () => ({}));
jest.mock('../../src/lib/chat-admin-ddb', () => ({}));
jest.mock('../../src/lib/get-matching-chat-apps', () => ({}));
jest.mock('../../src/lib/utils', () => ({
    createSessionToken: () => 'token',
    getAccountBackfillAttributes: () => ({}),
    hasSessionAccountContext: () => true,
    getNextMessageId: (sessionId: string) => `${sessionId}:1`,
    validateUserCanAccessSession: () => ({ success: true, hasAccess: true })
}));

import { addChatMessage, ensureChatSession } from '../../src/lib/chat-apis';

const user = { userId: 'u1', firstName: 'A', lastName: 'B' } as ChatUser<RecordOrUndef>;
const simpleUser = { userId: 'u1' } as SimpleAuthenticatedUser<RecordOrUndef>;

function newSession(userType?: 'internal-user' | 'external-user') {
    return ensureChatSession(user, {} as BaseRequestData, 'agent', 'app', simpleUser, 'chat-app', false, undefined, 'user', userType);
}

function sessionWith(userType?: 'internal-user' | 'external-user'): ChatSession<RecordOrUndef> {
    return { sessionId: 's1', userId: 'u1', chatAppId: 'app', ...(userType ? { userType } : {}) } as ChatSession<RecordOrUndef>;
}

const assistantMessage = { userId: 'assistant', sessionId: 's1', source: 'assistant', message: 'hi' } as Parameters<typeof addChatMessage>[0];

beforeEach(() => {
    addChatSession.mockClear();
    addMessage.mockClear();
});

describe('userType is written only when known', () => {
    it('ensureChatSession omits userType on a new session when none is given', async () => {
        await newSession(undefined);

        expect(addChatSession).toHaveBeenCalledTimes(1);
        expect(addChatSession.mock.calls[0][0]).not.toHaveProperty('userType');
    });

    it('ensureChatSession keeps a provided userType', async () => {
        await newSession('external-user');

        expect(addChatSession.mock.calls[0][0].userType).toBe('external-user');
    });

    it('addChatMessage omits userType when the session has none', async () => {
        await addChatMessage(assistantMessage, sessionWith());

        expect(addMessage).toHaveBeenCalledTimes(1);
        expect(addMessage.mock.calls[0][0]).not.toHaveProperty('userType');
    });

    it('addChatMessage copies userType from the session', async () => {
        await addChatMessage(assistantMessage, sessionWith('external-user'));

        expect(addMessage.mock.calls[0][0].userType).toBe('external-user');
    });
});
