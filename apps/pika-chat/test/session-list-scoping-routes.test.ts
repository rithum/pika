import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const scopeSessionsMock = jest.fn<(...args: unknown[]) => unknown[]>();
const scopePinnedMock = jest.fn<(...args: unknown[]) => unknown[] | undefined>();
const getChatSessionsMock = jest.fn<(userId: string, chatAppId: string) => Promise<unknown[]>>();
const getPinnedSessionsMock = jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>();
const searchForSessionsMock = jest.fn<(search: unknown) => Promise<{ sessions?: unknown[]; total?: number }>>();
const isContentAdminMock = jest.fn<(user: unknown) => boolean>();

jest.mock('$lib/custom/session-account-context', () => ({
    scopeSessionsToAccount: (...args: unknown[]) => scopeSessionsMock(...args),
    scopePinnedResultsToAccount: (...args: unknown[]) => scopePinnedMock(...args)
}));
jest.mock('$lib/server/chat-apis', () => ({
    getChatSessions: (userId: string, chatAppId: string) => getChatSessionsMock(userId, chatAppId),
    getPinnedSessions: (...args: unknown[]) => getPinnedSessionsMock(...args),
    getChatMessages: jest.fn(),
    searchForUser: jest.fn()
}));
jest.mock('$lib/server/utils', () => ({
    handleApiGatewayError: (e: unknown) => {
        throw e;
    },
    isUserContentAdmin: (user: unknown) => isContentAdminMock(user),
    isUserAllowedToUseEntityAccessControl: () => true,
    isUserAllowedToUseSpecificUserAccessControl: () => true
}));
jest.mock('$lib/server/chat-admin-apis', () => ({
    searchForSessions: (search: unknown) => searchForSessionsMock(search)
}));
jest.mock('$lib/server/custom-site-features', () => ({ siteFeatures: {} }));
jest.mock('$lib/server/invoke-converse-fn-url', () => ({ invokeConverseFunctionUrl: jest.fn() }));
jest.mock('$lib/custom/site-admin', () => ({ isUserAllowedAdminAccess: async () => true }));
jest.mock('$lib/custom/trace-content-access', () => ({ mayReceiveTraceContent: () => true }));
jest.mock('$lib/server/trace-content-guard', () => ({ withholdTraceContent: (m: unknown) => m }));
jest.mock('../src/routes/(auth)/api/site-admin/custom-data', () => ({
    getValuesForEntityAutoComplete: jest.fn(),
    getValuesForEntityList: jest.fn()
}));

import { GET } from '../src/routes/(auth)/api/session/[chatAppId]/+server';
import { POST as pinnedSearch } from '../src/routes/(auth)/api/session/pinned/search/+server';
import { POST as siteAdminPost } from '../src/routes/(auth)/api/site-admin/+server';

const SESSIONS = [{ sessionId: 's1' }, { sessionId: 's2' }];

function getEvent(user: Record<string, unknown>) {
    return { request: new Request('https://example.com/api/session/app-1'), params: { chatAppId: 'app-1' }, locals: { user } } as never;
}

describe('GET /api/session/[chatAppId] scoping', () => {
    beforeEach(() => {
        scopeSessionsMock.mockReset();
        getChatSessionsMock.mockReset();
        isContentAdminMock.mockReset();
        getChatSessionsMock.mockResolvedValue(SESSIONS);
        scopeSessionsMock.mockReturnValue([{ sessionId: 's1' }]);
    });

    it('scopes the caller own sessions with viewingAnotherUser false and returns the scoped list', async () => {
        const user = { userId: 'u1' };
        const response = (await GET(getEvent(user))) as Response;
        expect(scopeSessionsMock).toHaveBeenCalledWith(SESSIONS, user, 'app-1', false);
        expect((await response.json()).sessions).toEqual([{ sessionId: 's1' }]);
    });

    it('passes viewingAnotherUser true when a content admin views another user', async () => {
        isContentAdminMock.mockReturnValue(true);
        const user = { userId: 'admin', viewingContentFor: { 'app-1': { userId: 'u2' } } };
        await GET(getEvent(user));
        expect(getChatSessionsMock).toHaveBeenCalledWith('u2', 'app-1');
        expect(scopeSessionsMock).toHaveBeenCalledWith(SESSIONS, user, 'app-1', true);
    });

    it('passes viewingAnotherUser false when viewingContentFor has no entry for this app', async () => {
        isContentAdminMock.mockReturnValue(true);
        const user = { userId: 'admin', viewingContentFor: { 'other-app': { userId: 'u2' } } };
        await GET(getEvent(user));
        expect(getChatSessionsMock).toHaveBeenCalledWith('admin', 'app-1');
        expect(scopeSessionsMock).toHaveBeenCalledWith(SESSIONS, user, 'app-1', false);
    });
});

describe('POST /api/session/pinned/search scoping', () => {
    beforeEach(() => {
        scopePinnedMock.mockReset();
        getPinnedSessionsMock.mockReset();
    });

    it('returns the result with results replaced by the scoped list', async () => {
        const user = { userId: 'u1' };
        getPinnedSessionsMock.mockResolvedValue({ success: true, nextToken: 'n1', results: [{ id: 'a' }, { id: 'b' }] });
        scopePinnedMock.mockReturnValue([{ id: 'a' }]);
        const response = (await pinnedSearch({
            request: new Request('https://example.com/api/session/pinned/search', { method: 'POST', body: JSON.stringify({ chatAppId: 'app-1', limit: 5 }) }),
            locals: { user }
        } as never)) as Response;
        expect(scopePinnedMock).toHaveBeenCalledWith([{ id: 'a' }, { id: 'b' }], user, 'app-1');
        expect(await response.json()).toEqual({ success: true, nextToken: 'n1', results: [{ id: 'a' }] });
    });
});

describe('POST /api/site-admin sessionSearch', () => {
    beforeEach(() => {
        scopeSessionsMock.mockReset();
        searchForSessionsMock.mockReset();
    });

    it('returns the searched sessions unchanged and never applies account scoping', async () => {
        const sessions = [{ sessionId: 's1' }, { sessionId: 's2', accountId: '000000002' }];
        searchForSessionsMock.mockResolvedValue({ sessions, total: 2 });
        const response = (await siteAdminPost({
            request: new Request('https://example.com/api/site-admin', { method: 'POST', body: JSON.stringify({ command: 'sessionSearch', search: { text: 'x' } }) }),
            locals: { user: { userId: 'admin', customData: { accountId: '000000001' } } },
            cookies: {}
        } as never)) as Response;
        const body = await response.json();
        expect(body.sessions).toEqual(sessions);
        expect(body.sessions[0]).not.toHaveProperty('accountId');
        expect(scopeSessionsMock).not.toHaveBeenCalled();
    });
});
