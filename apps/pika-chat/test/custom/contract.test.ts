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
import type { AuthenticatedUser, ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

// ===== Type-contract assertions =====
// These lines cause a TypeScript compile error if any signature drifts.
// The unused-var suppression is intentional.

import { isUserAllowedAdminAccess } from '../../src/lib/custom/site-admin';
import { loadLegacyChatsIfNeeded, type LegacySessionsResult } from '../../src/lib/custom/legacy-session-loader';
import { getLegacyChatsSectionHeader } from '../../src/lib/custom/legacy-chats-section-header';
import { isCurrentSessionReadOnly } from '../../src/lib/custom/session-read-only';
import { validateLegacyUserIdIfNeeded, LEGACY_ACTION_USER_ID_COOKIE, type LegacyUserValidatorContext } from '../../src/lib/custom/legacy-user-validator';
import { getSessionEntityValue } from '../../src/lib/custom/session-entity-extraction';
import { transformSessionAccountContext } from '../../src/lib/custom/session-account-context';
import { transformCustomUserData, onAuthProviderCallback } from '../../src/lib/custom/server-hooks';

// Type signatures verified at compile time
type C1Sig = (user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>) => Promise<boolean>;
type C2aSig = (user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>, chatAppId: string) => Promise<LegacySessionsResult>;
type C2cSig = (session: ChatSession<RecordOrUndef> | undefined) => boolean;
type C3Sig = (effectiveUserId: string, sessionUserId: string, context: LegacyUserValidatorContext) => Promise<string | undefined>;
type C4Sig = (session: ChatSession<RecordOrUndef>) => string | undefined;
type C5Sig = (session: ChatSession<RecordOrUndef>, user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>) => ChatSession<RecordOrUndef>;

/* eslint-disable @typescript-eslint/no-unused-vars */
const _c1: C1Sig = isUserAllowedAdminAccess;
const _c2a: C2aSig = loadLegacyChatsIfNeeded;
const _c2c: C2cSig = isCurrentSessionReadOnly;
const _c3: C3Sig = validateLegacyUserIdIfNeeded;
const _c4: C4Sig = getSessionEntityValue;
const _c5: C5Sig = transformSessionAccountContext;
/* eslint-enable @typescript-eslint/no-unused-vars */

// ===== Shared mock data =====

const mockUser: AuthenticatedUser<RecordOrUndef, RecordOrUndef> = {
    userId: 'test-user-id',
    identityId: 'test-identity-id',
    userType: 'external-user',
    roles: [],
    customData: undefined
};

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
    sessionAttributes: {}
};

// ===== Default behavior smoke tests =====

describe('lib/custom hook defaults', () => {
    describe('isUserAllowedAdminAccess (C1)', () => {
        it('returns a boolean promise', async () => {
            const result = await isUserAllowedAdminAccess(mockUser);
            expect(typeof result).toBe('boolean');
        });
    });

    describe('loadLegacyChatsIfNeeded (C2a)', () => {
        it('returns loaded=false by default', async () => {
            const result = await loadLegacyChatsIfNeeded(mockUser, 'test-app');
            expect(result.loaded).toBe(false);
            expect(Array.isArray(result.sessions)).toBe(true);
            expect(result.sessions).toHaveLength(0);
        });
    });

    describe('getLegacyChatsSectionHeader (C2b)', () => {
        it('returns undefined by default', () => {
            const header = getLegacyChatsSectionHeader();
            expect(header).toBeUndefined();
        });
    });

    describe('isCurrentSessionReadOnly (C2c)', () => {
        it('returns false for a real session', () => {
            expect(isCurrentSessionReadOnly(mockSession)).toBe(false);
        });

        it('returns false for undefined session', () => {
            expect(isCurrentSessionReadOnly(undefined)).toBe(false);
        });
    });

    describe('validateLegacyUserIdIfNeeded (C3)', () => {
        it('returns undefined by default', async () => {
            const ctx: LegacyUserValidatorContext = {
                request: new Request('https://example.com'),
                cookies: {} as any,
                stage: 'test'
            };
            const result = await validateLegacyUserIdIfNeeded('user-a', 'user-b', ctx);
            expect(result).toBeUndefined();
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

    describe('LEGACY_ACTION_USER_ID_COOKIE', () => {
        it('is a non-empty string constant', () => {
            expect(typeof LEGACY_ACTION_USER_ID_COOKIE).toBe('string');
            expect(LEGACY_ACTION_USER_ID_COOKIE.length).toBeGreaterThan(0);
        });
    });
});
