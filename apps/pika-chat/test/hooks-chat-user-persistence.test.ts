import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

type Rec = Record<string, unknown>;

const authenticateMock = jest.fn<(event: unknown) => Promise<{ authenticatedUser?: Rec }>>();
const getChatUserMock = jest.fn<(userId: string) => Promise<Rec | undefined>>();
const createChatUserMock = jest.fn<(user: Rec) => Promise<Rec | undefined>>();
const deserializeMock = jest.fn<(event: unknown, km: unknown) => Rec | undefined>();
const serializeMock = jest.fn<(event: unknown, user: Rec, km: unknown) => void>();
const validateCookiesMock = jest.fn<(event: unknown, km: unknown) => { overallStatus: string; details?: unknown }>();
const writeBackMock = jest.fn<(user: Rec, chatUser: Rec) => Rec | undefined>();

jest.mock('$lib/server/auth', () => ({
    loadAuthProvider: async () => ({ authenticate: (event: unknown) => authenticateMock(event) }),
    ForceUserToReauthenticateError: class extends Error {},
    NotAuthenticatedError: class extends Error {}
}));
jest.mock('$lib/custom/chat-user-auth', () => ({
    shouldBypassChatUserRoleMerge: () => false,
    rolesForChatUserRecord: (roles: string[] | undefined) => (roles ? [...roles, 'tagged'] : roles),
    mergeStoredRolesIntoSession: (sessionRoles: string[] | undefined, storedRoles: string[] | undefined) => [...(storedRoles ?? sessionRoles ?? []), 'merged'],
    mergeChatUserCustomData: (user: Rec, chatUser: Rec) => ({ ...((chatUser.customData as Rec) ?? {}), mergedFor: user.userId }),
    resolveChatUserAccountWriteBack: (user: Rec, chatUser: Rec) => writeBackMock(user, chatUser)
}));
jest.mock('$lib/custom/server-hooks', () => ({
    onAuthProviderCallback: async () => undefined,
    onBeforeAuth: async () => ({ clearSession: false })
}));
jest.mock('$lib/server/chat-apis', () => ({
    getChatUser: (userId: string) => getChatUserMock(userId),
    createChatUser: (user: Rec) => createChatUserMock(user)
}));
jest.mock('$lib/server/config', () => ({
    appConfig: {
        isLocal: false,
        cookieMaxAgeHours: 12,
        init: async () => undefined,
        ssmParameterPrefix: 'p',
        kmsKeyAlias: 'a',
        awsRegion: 'us-east-1',
        keyRefreshIntervalHours: 1,
        maxKeyVersions: 2
    }
}));
jest.mock('$lib/server/cookies', () => ({
    clearAllCookies: jest.fn(),
    clearForceReauthRetryCookie: jest.fn(),
    clearForceReauthRetryCookieIfExists: () => false,
    deserializeAuthenticatedUserFromCookies: (event: unknown, km: unknown) => deserializeMock(event, km),
    deserializeContentAdminDataFromCookies: jest.fn(),
    deserializeUserOverrideDataFromCookies: jest.fn(),
    getForceRetryAuthRetryAttemptsCookieValue: () => 0,
    serializeAuthenticatedUserToCookies: (event: unknown, user: Rec, km: unknown) => serializeMock(event, user, km),
    setForceReauthRetryCookie: jest.fn(),
    validateAllCookieVersions: (event: unknown, km: unknown) => validateCookiesMock(event, km)
}));
jest.mock('$lib/server/encryption/KeyManager', () => ({
    KeyManager: class {
        initialize = async () => undefined;
        refreshKeysIfNeeded = async () => undefined;
    }
}));
jest.mock('$lib/server/encryption/KeyManagerFactory', () => ({
    KeyManagerFactory: { setInstance: jest.fn() }
}));
jest.mock('$lib/server/utils', () => ({
    addSecurityHeaders: (response: Response) => response,
    arraysEqual: (a: string[] | undefined, b: string[] | undefined) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []),
    isUserAllowedToUseUserDataOverrides: () => false,
    isUserContentAdmin: () => false,
    mergeAuthenticatedUserWithExistingChatUser: jest.fn(),
    validateRedirectPath: () => undefined
}));

import { handle, init } from '../src/hooks.server';

function makeEvent() {
    return { url: new URL('https://example.com/chat'), locals: {}, cookies: {} } as never;
}

const resolve = async () => new Response('ok', { status: 200 });

describe('hooks.server chat-user persistence seams', () => {
    let logSpy: jest.SpiedFunction<typeof console.log>;
    let warnSpy: jest.SpiedFunction<typeof console.warn>;

    beforeEach(async () => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        for (const m of [authenticateMock, getChatUserMock, createChatUserMock, deserializeMock, serializeMock, validateCookiesMock, writeBackMock]) m.mockReset();
        writeBackMock.mockReturnValue(undefined);
        createChatUserMock.mockImplementation(async (u) => u);
        await init({} as never);
    });

    afterEach(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
    });

    describe('login', () => {
        beforeEach(() => {
            validateCookiesMock.mockReturnValue({ overallStatus: 'no_auth_cookie' });
        });

        it('persists roles through rolesForChatUserRecord when creating the chat user', async () => {
            authenticateMock.mockResolvedValue({ authenticatedUser: { userId: 'u1', roles: ['x'], authData: { token: 't' } } });
            getChatUserMock.mockResolvedValue(undefined);

            await handle({ event: makeEvent(), resolve } as never);

            expect(createChatUserMock).toHaveBeenCalledTimes(1);
            const created = createChatUserMock.mock.calls[0][0];
            expect(created.roles).toEqual(['x', 'tagged']);
            expect(created).not.toHaveProperty('authData');
        });

        it('persists roles through rolesForChatUserRecord when updating an existing chat user', async () => {
            authenticateMock.mockResolvedValue({ authenticatedUser: { userId: 'u1', roles: ['x'], firstName: 'A', lastName: 'B' } });
            getChatUserMock.mockResolvedValue({ userId: 'u1', roles: ['x'], firstName: 'A', lastName: 'B' });

            await handle({ event: makeEvent(), resolve } as never);

            expect(createChatUserMock).toHaveBeenCalledTimes(1);
            expect(createChatUserMock.mock.calls[0][0].roles).toEqual(['x', 'tagged']);
        });

        it('writes the resolved customData back when the hook returns one on login update', async () => {
            const writeBack = { accountId: '000000001' };
            authenticateMock.mockResolvedValue({ authenticatedUser: { userId: 'u1', roles: ['x', 'tagged'], firstName: 'A', lastName: 'B' } });
            getChatUserMock.mockResolvedValue({ userId: 'u1', roles: ['x', 'tagged'], firstName: 'A', lastName: 'B', customData: { old: true } });
            writeBackMock.mockReturnValue(writeBack);

            await handle({ event: makeEvent(), resolve } as never);

            expect(createChatUserMock).toHaveBeenCalledTimes(1);
            expect(createChatUserMock.mock.calls[0][0].customData).toEqual(writeBack);
        });

        it('does not write when roles match and the hook returns nothing', async () => {
            authenticateMock.mockResolvedValue({ authenticatedUser: { userId: 'u1', roles: ['x'], firstName: 'A', lastName: 'B' } });
            getChatUserMock.mockResolvedValue({ userId: 'u1', roles: ['x', 'tagged'], firstName: 'A', lastName: 'B' });

            await handle({ event: makeEvent(), resolve } as never);

            expect(createChatUserMock).not.toHaveBeenCalled();
        });
    });

    describe('periodic refresh', () => {
        const cookieUser = () => ({ userId: 'u1', userType: 'external-user', firstName: 'A', lastName: 'B', roles: ['x'], customData: { fromCookie: true } });
        const storedUser = { userId: 'u1', userType: 'external-user', firstName: 'A', lastName: 'B', roles: ['stored'], customData: { fromStore: true } };

        beforeEach(() => {
            validateCookiesMock.mockReturnValue({ overallStatus: 'all_valid' });
            deserializeMock.mockImplementation(() => cookieUser());
            getChatUserMock.mockResolvedValue(storedUser);
        });

        it('builds the refreshed cookie user from mergeStoredRolesIntoSession and mergeChatUserCustomData', async () => {
            await handle({ event: makeEvent(), resolve } as never);

            expect(serializeMock).toHaveBeenCalledTimes(1);
            const serialized = serializeMock.mock.calls[0][1];
            expect(serialized.roles).toEqual(['stored', 'merged']);
            expect(serialized.customData).toEqual({ fromStore: true, mergedFor: 'u1' });
        });

        it('creates the chat user with the write-back customData when the hook returns one', async () => {
            const writeBack = { accountId: '000000001' };
            writeBackMock.mockReturnValue(writeBack);

            await handle({ event: makeEvent(), resolve } as never);

            expect(createChatUserMock).toHaveBeenCalledWith({ ...storedUser, customData: writeBack });
        });

        it('does not create a chat user when the hook returns nothing', async () => {
            await handle({ event: makeEvent(), resolve } as never);

            expect(createChatUserMock).not.toHaveBeenCalled();
        });

        it('still serves the request and refreshes the cookie when the write-back throws', async () => {
            writeBackMock.mockReturnValue({ accountId: '000000001' });
            createChatUserMock.mockRejectedValue(new Error('ddb down'));

            const response = (await handle({ event: makeEvent(), resolve } as never)) as Response;

            expect(response.status).toBe(200);
            expect(serializeMock).toHaveBeenCalledTimes(1);
            expect(serializeMock.mock.calls[0][1].roles).toEqual(['stored', 'merged']);
        });
    });
});
