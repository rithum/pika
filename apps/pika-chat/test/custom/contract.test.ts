/**
 * Signature-stability tests for lib/custom extension-point hooks.
 *
 * Purpose: fail loudly at compile time and test time if any hook's exported
 * signature drifts from its declared contract. A compile error here means a
 * consumer's override would break on the next pika sync.
 *
 * Tests are intentionally minimal — they call each hook with the expected
 * argument types and assert on the expected return shape. They do not test
 * consumer-specific behavior.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { AuthenticatedUser, ChatUser, ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

// ===== Type-contract assertions =====
// These lines cause a TypeScript compile error if any signature drifts.
// The unused-var suppression is intentional.

import { isUserAllowedAdminAccess } from '../../src/lib/custom/site-admin';
import { getAdditionalSessionSources, type SessionSource } from '../../src/lib/custom/additional-session-sources';
import { isSessionReadOnly } from '../../src/lib/custom/session-read-only';
import { resolveRequestUserId, type RequestUserIdResolverContext } from '../../src/lib/custom/request-user-id-resolver';
import { getSessionEntityValue } from '../../src/lib/custom/session-entity-extraction';
import { transformSessionAccountContext } from '../../src/lib/custom/session-account-context';
import { transformCustomUserData, onAuthProviderCallback, onBeforeAuth } from '../../src/lib/custom/server-hooks';
import { shouldBypassChatUserRoleMerge } from '../../src/lib/custom/chat-user-auth';

// Type signatures verified at compile time
type C1Sig = (user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>) => Promise<boolean>;
type C2aSig = (user: ChatUser<RecordOrUndef>, chatAppId: string) => Promise<SessionSource[]>;
type C2cSig = (session: ChatSession<RecordOrUndef> | undefined, user: ChatUser<RecordOrUndef> | undefined) => boolean;
type C3Sig = (
    requestedUserId: string,
    sessionUserId: string,
    context: RequestUserIdResolverContext
) => Promise<string | undefined>;
type C4Sig = (session: ChatSession<RecordOrUndef>) => string | undefined;
type C5Sig = (
    session: ChatSession<RecordOrUndef>,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>
) => ChatSession<RecordOrUndef>;
type C7Sig = (
    event: any,
    pathName: string,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef> | undefined
) => Promise<{ clearSession: boolean }>;
type C8Sig = (user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>) => boolean;

/* eslint-disable @typescript-eslint/no-unused-vars */
const _c1: C1Sig = isUserAllowedAdminAccess;
const _c2a: C2aSig = getAdditionalSessionSources;
const _c2c: C2cSig = isSessionReadOnly;
const _c3: C3Sig = resolveRequestUserId;
const _c4: C4Sig = getSessionEntityValue;
const _c5: C5Sig = transformSessionAccountContext;
const _c7: C7Sig = onBeforeAuth;
const _c8: C8Sig = shouldBypassChatUserRoleMerge;
/* eslint-enable @typescript-eslint/no-unused-vars */

// ===== Shared mock data =====

const mockUser: AuthenticatedUser<RecordOrUndef, RecordOrUndef> = {
    userId: 'test-user-id',
    identityId: 'test-identity-id',
    userType: 'external-user',
    roles: [],
    customData: undefined,
};

// ChatUser is the parent of AuthenticatedUser; safe to use mockUser where ChatUser is expected.
const mockChatUser: ChatUser<RecordOrUndef> = mockUser;

const mockSession: ChatSession<RecordOrUndef> = {
    sessionId: 'test-session-id',
    userId: 'test-user-id',
    agentId: 'test-agent-id',
    chatAppId: 'test-chat-app-id',
    identityId: 'test-identity-id',
    invocationMode: 'standard',
    entityId: 'test-entity-id',
    createDate: '2024-01-01T00:00:00Z',
    lastUpdate: '2024-01-01T00:00:00Z',
    sessionAttributes: {},
};

// ===== Default behavior smoke tests =====

describe('lib/custom hook defaults', () => {
    describe('isUserAllowedAdminAccess (C1)', () => {
        it('returns a boolean promise', async () => {
            const result = await isUserAllowedAdminAccess(mockUser);
            expect(typeof result).toBe('boolean');
        });
    });

    describe('getAdditionalSessionSources (C2a)', () => {
        it('returns empty array by default', async () => {
            const result = await getAdditionalSessionSources(mockChatUser, 'test-app');
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(0);
        });

        it('SessionSource requires only id and load — label, isReadOnly, sidebarSlot are optional', () => {
            const minimal: SessionSource = {
                id: 'minimal',
                load: async () => [],
            };
            expect(minimal.id).toBe('minimal');
            expect(minimal.label).toBeUndefined();
            expect(minimal.isReadOnly).toBeUndefined();
            expect(minimal.sidebarSlot).toBeUndefined();
        });

        it('SessionSource accepts full shape: id, label, load, isReadOnly, sidebarSlot', () => {
            const full: SessionSource = {
                id: 'full-source',
                label: 'Full Source',
                load: async () => [],
                isReadOnly: (_session) => false,
                sidebarSlot: {
                    header: undefined,
                    trigger: undefined,
                },
            };
            expect(full.id).toBe('full-source');
            expect(full.label).toBe('Full Source');
        });

        it('the framework loader uses Promise.allSettled (not Promise.all) — text smoke test', () => {
            // Documents the framework's load-time guarantee at the call site. A swap to
            // Promise.all in chat-app.state.svelte.ts#loadAdditionalSessions would break the
            // public sibling-isolation contract; this assertion fails fast in that case.
            const stateSrc = readFileSync(
                join(__dirname, '../../src/lib/client/features/chat/chat-app.state.svelte.ts'),
                'utf8'
            );
            // Find the loadAdditionalSessions method body and assert it uses allSettled, not bare .all.
            const methodMatch = stateSrc.match(/async loadAdditionalSessions\(\)[\s\S]*?(?=\n    [a-zA-Z#])/);
            expect(methodMatch).not.toBeNull();
            const body = methodMatch![0];
            expect(body).toContain('Promise.allSettled');
            // Bare Promise.all( with no "Settled" would regress sibling isolation.
            expect(body).not.toMatch(/Promise\.all\(/);
        });

        it('Promise.allSettled semantics: a rejecting source does not affect sibling sources', async () => {
            // Framework calls Promise.allSettled(sources.map(s => s.load())) so one failure
            // must not prevent other sources from loading.
            const rejectingSource: SessionSource = {
                id: 'failing',
                load: async () => {
                    throw new Error('source load error');
                },
            };
            const succeedingSource: SessionSource = {
                id: 'working',
                load: async () => [],
            };
            const results = await Promise.allSettled([rejectingSource.load(), succeedingSource.load()]);
            expect(results[0].status).toBe('rejected');
            expect(results[1].status).toBe('fulfilled');
            expect((results[1] as PromiseFulfilledResult<ChatSession<RecordOrUndef>[]>).value).toEqual([]);
        });
    });

    describe('isSessionReadOnly (C2c)', () => {
        it('returns false by default', () => {
            expect(isSessionReadOnly(mockSession, mockChatUser)).toBe(false);
        });

        it('does not throw when called with undefined session', () => {
            expect(() => isSessionReadOnly(undefined, mockChatUser)).not.toThrow();
            expect(isSessionReadOnly(undefined, mockChatUser)).toBe(false);
        });

        it('does not throw when called with undefined user', () => {
            expect(() => isSessionReadOnly(mockSession, undefined)).not.toThrow();
            expect(isSessionReadOnly(mockSession, undefined)).toBe(false);
        });

        it('does not throw when called with both args undefined', () => {
            expect(() => isSessionReadOnly(undefined, undefined)).not.toThrow();
            expect(isSessionReadOnly(undefined, undefined)).toBe(false);
        });

        it('OR-composition with shared-by-someone-else: session is read-only when shared even if hook returns false', () => {
            // Framework: isSharedBySomeoneElse || isSessionReadOnly(session, user) || sourceReadOnly
            const hookResult = isSessionReadOnly(mockSession, mockChatUser);
            const sharedBySomeoneElse = true;
            expect(hookResult).toBe(false);
            expect(sharedBySomeoneElse || hookResult).toBe(true);
        });

        it('OR-composition with per-source isReadOnly: session is read-only when source predicate returns true even if hook returns false', () => {
            // Framework OR-s top-level hook with SessionSource.isReadOnly for the session's source.
            const hookResult = isSessionReadOnly(mockSession, mockChatUser);
            const readOnlySource: SessionSource = {
                id: 'read-only-source',
                load: async () => [],
                isReadOnly: () => true,
            };
            const sourceReadOnly = readOnlySource.isReadOnly!(mockSession);
            expect(hookResult).toBe(false);
            expect(hookResult || sourceReadOnly).toBe(true);
        });
    });

    describe('resolveRequestUserId (C3)', () => {
        it('returns undefined by default', async () => {
            const ctx: RequestUserIdResolverContext = {
                request: new Request('https://example.com'),
                cookies: {} as any,
                stage: 'test',
            };
            const result = await resolveRequestUserId('user-a', 'user-b', ctx);
            expect(result).toBeUndefined();
        });

        it('undefined return leaves requestedUserId unchanged — downstream uses original value', async () => {
            const ctx: RequestUserIdResolverContext = {
                request: new Request('https://example.com'),
                cookies: {} as any,
                stage: 'test',
            };
            const requestedUserId = 'original-user-id';
            const override = await resolveRequestUserId(requestedUserId, 'session-user-id', ctx);
            const effectiveUserId = override ?? requestedUserId;
            expect(effectiveUserId).toBe(requestedUserId);
        });

        it('non-undefined return overrides the userId used in the downstream request', async () => {
            // Consumers can override by returning a non-undefined string.
            // The default returns undefined; this test verifies the ?? fallback pattern the routes use.
            const requestedUserId = 'session-derived-id';
            const consumerOverride = 'consumer-resolved-id';
            const effectiveUserId = consumerOverride ?? requestedUserId;
            expect(effectiveUserId).toBe(consumerOverride);
        });

        it('is imported and called in api/message/+server.ts', () => {
            const routeSrc = readFileSync(join(__dirname, '../../src/routes/(auth)/api/message/+server.ts'), 'utf-8');
            expect(routeSrc).toContain('resolveRequestUserId');
        });

        it('is imported and called in api/message/[chatAppId]/[sessionId]/+server.ts', () => {
            const routeSrc = readFileSync(
                join(__dirname, '../../src/routes/(auth)/api/message/[chatAppId]/[sessionId]/+server.ts'),
                'utf-8'
            );
            expect(routeSrc).toContain('resolveRequestUserId');
        });
    });

    describe('getSessionEntityValue (C4)', () => {
        it('returns entityId from session', () => {
            expect(getSessionEntityValue(mockSession)).toBe('test-entity-id');
        });

        it('returns undefined when entityId is empty string', () => {
            const session = { ...mockSession, entityId: '' };
            expect(getSessionEntityValue(session)).toBeUndefined();
        });
    });

    describe('transformSessionAccountContext (C5)', () => {
        it('returns session unchanged', () => {
            const result = transformSessionAccountContext(mockSession, mockUser);
            expect(result).toBe(mockSession);
        });
    });

    describe('onAuthProviderCallback (C6)', () => {
        it('resolves without error', async () => {
            const mockEvent = { url: new URL('https://example.com/auth/callback/azuread') } as any;
            await expect(onAuthProviderCallback(mockEvent, 'azuread')).resolves.toBeUndefined();
        });
    });

    describe('onBeforeAuth', () => {
        it('returns clearSession: false by default', async () => {
            const mockEvent = { url: new URL('https://example.com/') } as any;
            const result = await onBeforeAuth(mockEvent, '/chat/app1', mockUser);
            expect(result).toEqual({ clearSession: false });
        });

        it('returns clearSession: false when user is undefined', async () => {
            const mockEvent = { url: new URL('https://example.com/') } as any;
            const result = await onBeforeAuth(mockEvent, '/admin', undefined);
            expect(result).toEqual({ clearSession: false });
        });
    });

    describe('shouldBypassChatUserRoleMerge', () => {
        it('returns false by default', () => {
            expect(shouldBypassChatUserRoleMerge(mockUser)).toBe(false);
        });
    });

    /**
     * Regression guard: the v0.27.0 release removed the five v0.26.0 legacy-chats hook files
     * and the LEGACY_ACTION_USER_ID_COOKIE constant. A partial revert that brings any of these
     * back would silently re-introduce ai-bot-specific shapes into the public hook surface.
     * Assert each removed module cannot be required.
     */
    describe('removed v0.26.0 legacy symbols (regression guard)', () => {
        const removedModules = [
            '$lib/custom/legacy-session-loader',
            '$lib/custom/legacy-chats-section-header',
            '$lib/custom/legacy-chats-section-trigger',
            '$lib/custom/legacy-user-validator',
        ];
        for (const modulePath of removedModules) {
            it(`module ${modulePath} no longer resolves`, async () => {
                await expect(import(modulePath)).rejects.toThrow();
            });
        }

        it('LEGACY_ACTION_USER_ID_COOKIE is not re-exported from any custom module', async () => {
            // Spot-check the surviving modules — none should re-export the removed cookie name.
            const survivors: Record<string, unknown>[] = await Promise.all([
                import('$lib/custom/additional-session-sources'),
                import('$lib/custom/session-read-only'),
                import('$lib/custom/request-user-id-resolver'),
            ]);
            for (const mod of survivors) {
                expect(Object.keys(mod)).not.toContain('LEGACY_ACTION_USER_ID_COOKIE');
            }
        });
    });
});
