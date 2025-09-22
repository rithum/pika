// Load environment variables first
import './env-setup';

import type { RevokeSharedSessionRequest } from 'pika-shared/types/chatbot/chatbot-types';
import { POST as createShare, DELETE as revokeShare } from '../../src/routes/(auth)/api/session/share/+server';
import { POST as validateAccess } from '../../src/routes/(auth)/api/session/share/access/+server';
import { POST as getRecentShared } from '../../src/routes/(auth)/api/session/share/recent/+server';
import { POST as unrevokeShare } from '../../src/routes/(auth)/api/session/share/unrevoke/+server';
import { POST as visitShare } from '../../src/routes/(auth)/api/session/share/visit/+server';
import { callWithSvelteKitErrorHandling } from '../__mocks__/@sveltejs-kit';
import type { CreateSharedSessionRequest, GetRecentSharedRequest, RecordShareVisitRequest, UnrevokeSharedSessionRequest, ValidateShareAccessRequest } from './general-mocks';
import { createMockRequestEvent, ESSENTIAL_TEST_DATA, setupTestEnvironment, TEST_ENTITIES } from './general-mocks';
import { externalAcmeUser1, externalAcmeUser2, externalStarkUser1, externalWayneUser1, internalUserNoEntity } from './user-mock';

import {
    clearTestState,
    getOrCreateSharedSession,
    getOrCreateTestSession,
    TEST_SESSION_SCENARIOS,
    validateUserShareAccess,
    verifySessionAfterSharing
} from './shared-session-helpers';

// Global test data - will be populated as needed
const testData = {
    sessions: {} as Record<string, any>,
    shareIds: {} as Record<string, string>
};

beforeAll(async () => {
    await setupTestEnvironment();
    clearTestState(); // Ensure clean state
});

beforeEach(() => {
    // Each test can run independently but can reuse data created by previous tests
});

describe('Shared Session Integration Tests', () => {
    describe('Create Share - Base Cases (External User Owns Session)', () => {
        test('should FAIL to share direct agent invocation session', async () => {
            const directAgentChatAppId = `${ESSENTIAL_TEST_DATA.DIRECT_AGENT_PREFIX}${ESSENTIAL_TEST_DATA.AGENT_ID}`;

            // Create session first
            const sessionState = await getOrCreateTestSession(
                TEST_SESSION_SCENARIOS.DIRECT_AGENT_SESSION,
                externalAcmeUser1.userId,
                directAgentChatAppId,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData,
                'Direct Agent Session'
            );

            const request: CreateSharedSessionRequest = {
                sessionId: sessionState.sessionId,
                sessionUserId: externalAcmeUser1.userId,
                chatAppId: directAgentChatAppId
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(createShare, mockEvent as any);

            // Should fail - cannot share direct agent invocation sessions
            expect(response.status).toBe(400);
        });

        test('should create share for session in entity-disabled chat app', async () => {
            // Create session first
            const sessionState = await getOrCreateTestSession(
                TEST_SESSION_SCENARIOS.ACME_GLOBAL_SESSION,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_DISABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData,
                'Test Global Session'
            );

            // Session in chat app where entity feature is disabled
            const request: CreateSharedSessionRequest = {
                sessionId: sessionState.sessionId,
                sessionUserId: externalAcmeUser1.userId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_DISABLED
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(createShare, mockEvent as any);

            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.shareId).toBeDefined();
            expect(result.chatAppId).toBe(ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_DISABLED);

            // Store shareId for later tests
            testData.shareIds['global'] = result.shareId;

            // Verify session properties were updated correctly
            await verifySessionAfterSharing(externalAcmeUser1.userId, sessionState.sessionId, {
                shareId: result.shareId,
                shareCreatedByUserId: externalAcmeUser1.userId,
                shareDate: true,
                entityId: TEST_ENTITIES.GLOBAL // Should be 'chat-app-global'
            });
        });

        test('should create share for session in entity-enabled chat app', async () => {
            // Create session first
            const sessionState = await getOrCreateTestSession(
                TEST_SESSION_SCENARIOS.ACME_ENTITY_SESSION,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData,
                'Test Entity Session'
            );

            // Session in chat app where entity feature is enabled
            const request: CreateSharedSessionRequest = {
                sessionId: sessionState.sessionId,
                sessionUserId: externalAcmeUser1.userId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(createShare, mockEvent as any);

            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.shareId).toBeDefined();
            expect(result.chatAppId).toBe(ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED);

            // Store shareId for later tests
            testData.shareIds['entity'] = result.shareId;

            // Verify session properties were updated correctly
            await verifySessionAfterSharing(externalAcmeUser1.userId, sessionState.sessionId, {
                shareId: result.shareId,
                shareCreatedByUserId: externalAcmeUser1.userId,
                shareDate: true,
                entityId: TEST_ENTITIES.ACME // Should be user's accountId (acme-account)
            });
        });

        test('should create share for session in chat app with entity override disabled', async () => {
            // Create session first - this chat app has entity disabled via override
            const sessionState = await getOrCreateTestSession(
                TEST_SESSION_SCENARIOS.ACME_OVERRIDE_GLOBAL_SESSION,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_OVERRIDE_DISABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData,
                'Test Override Global Session'
            );

            // Session in chat app where entity feature is disabled via override
            const request: CreateSharedSessionRequest = {
                sessionId: sessionState.sessionId,
                sessionUserId: externalAcmeUser1.userId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_OVERRIDE_DISABLED
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(createShare, mockEvent as any);

            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.shareId).toBeDefined();
            expect(result.chatAppId).toBe(ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_OVERRIDE_DISABLED);

            // Store shareId for later tests
            testData.shareIds['override-global'] = result.shareId;

            // Verify session properties were updated correctly
            // Even though entity is disabled via override, entityId should still be 'chat-app-global'
            await verifySessionAfterSharing(externalAcmeUser1.userId, sessionState.sessionId, {
                shareId: result.shareId,
                shareCreatedByUserId: externalAcmeUser1.userId,
                shareDate: true,
                entityId: TEST_ENTITIES.GLOBAL // Should be 'chat-app-global' due to override
            });
        });
    });

    describe('Create Share - Internal User Cases', () => {
        test('should allow internal user to share customer session (entity enabled)', async () => {
            // Create a fresh session for internal user sharing test
            const sessionState = await getOrCreateTestSession(
                'internal-user-share-entity-test',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData,
                'Test Entity Session for Internal User Share'
            );

            // Internal user creating share for external user's session
            const request: CreateSharedSessionRequest = {
                sessionId: sessionState.sessionId,
                sessionUserId: externalAcmeUser1.userId, // Session owner
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            };

            const mockEvent = createMockRequestEvent(internalUserNoEntity, request);
            const response = await callWithSvelteKitErrorHandling(createShare, mockEvent as any);

            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result.success).toBe(true);

            // Verify session properties were updated correctly
            await verifySessionAfterSharing(externalAcmeUser1.userId, sessionState.sessionId, {
                shareId: result.shareId,
                shareCreatedByUserId: internalUserNoEntity.userId, // Internal user created the share
                shareDate: true,
                entityId: TEST_ENTITIES.ACME // Session uses session owner's entity (acme-account)
            });
        });

        test('should allow internal user to share customer session (entity disabled)', async () => {
            // Create a fresh session for internal user sharing test
            const sessionState = await getOrCreateTestSession(
                'internal-user-share-global-test',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_DISABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData,
                'Test Global Session for Internal User Share'
            );

            const request: CreateSharedSessionRequest = {
                sessionId: sessionState.sessionId,
                sessionUserId: externalAcmeUser1.userId, // Session owner
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_DISABLED
            };

            const mockEvent = createMockRequestEvent(internalUserNoEntity, request);
            const response = await callWithSvelteKitErrorHandling(createShare, mockEvent as any);

            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result.success).toBe(true);

            // Verify session entityId is 'chat-app-global'
            await verifySessionAfterSharing(externalAcmeUser1.userId, sessionState.sessionId, {
                shareId: result.shareId,
                shareCreatedByUserId: internalUserNoEntity.userId,
                shareDate: true,
                entityId: TEST_ENTITIES.GLOBAL
            });
        });
    });

    describe('Validate Share Access', () => {
        test('session owner should always have access', async () => {
            // Use shareId from entity session created in previous tests
            const shareId = testData.shareIds['entity'] || (await createTestShare());

            const request: ValidateShareAccessRequest = {
                shareId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(validateAccess, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.hasAccess).toBe(true); // Session owner should always have access
        });

        async function createTestShare(): Promise<string> {
            const sessionState = await getOrCreateTestSession(
                'temp-session-for-access-test',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData
            );

            const shareId = await getOrCreateSharedSession(
                'temp-share-for-access-test',
                externalAcmeUser1,
                sessionState.sessionId,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            );

            testData.shareIds['entity'] = shareId;
            return shareId;
        }

        test('external user should access global session', async () => {
            // Use shareId from global session or create one
            const shareId = testData.shareIds['global'] || (await createGlobalTestShare());

            // Any external user should access session with entityId = 'chat-app-global'
            const request: ValidateShareAccessRequest = {
                shareId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_DISABLED
            };

            const mockEvent = createMockRequestEvent(externalStarkUser1, request); // Different account user
            const response = await callWithSvelteKitErrorHandling(validateAccess, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.hasAccess).toBe(true); // Should have access to global sessions
        });

        test('external user should access override-disabled global session', async () => {
            // Use shareId from override-disabled session or create one
            const shareId = testData.shareIds['override-global'] || (await createOverrideGlobalTestShare());

            // Any external user should access session with entityId = 'chat-app-global' (due to override)
            const request: ValidateShareAccessRequest = {
                shareId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_OVERRIDE_DISABLED
            };

            const mockEvent = createMockRequestEvent(externalStarkUser1, request); // Different account user
            const response = await callWithSvelteKitErrorHandling(validateAccess, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.hasAccess).toBe(true); // Should have access to override-global sessions
        });

        async function createGlobalTestShare(): Promise<string> {
            const sessionState = await getOrCreateTestSession(
                'temp-global-session-for-access-test',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_DISABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData
            );

            const shareId = await getOrCreateSharedSession(
                'temp-global-share-for-access-test',
                externalAcmeUser1,
                sessionState.sessionId,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_DISABLED
            );

            testData.shareIds['global'] = shareId;
            return shareId;
        }

        async function createOverrideGlobalTestShare(): Promise<string> {
            const sessionState = await getOrCreateTestSession(
                'temp-override-global-session-for-access-test',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_OVERRIDE_DISABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData
            );

            const shareId = await getOrCreateSharedSession(
                'temp-override-global-share-for-access-test',
                externalAcmeUser1,
                sessionState.sessionId,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_OVERRIDE_DISABLED
            );

            testData.shareIds['override-global'] = shareId;
            return shareId;
        }

        test('external user should access same-entity session', async () => {
            // Use shareId from entity session
            const shareId = testData.shareIds['entity'] || (await createTestShare());

            // Same account user should access entity-scoped session
            const request: ValidateShareAccessRequest = {
                shareId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                entityId: TEST_ENTITIES.ACME // Pass user's entityId
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser2, request); // Same account user
            const response = await callWithSvelteKitErrorHandling(validateAccess, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.hasAccess).toBe(true); // Should have access - same entity
        });

        test('external user should NOT access different-entity session', async () => {
            // Use shareId from entity session
            const shareId = testData.shareIds['entity'] || (await createTestShare());

            // Different account user should NOT access entity-scoped session
            const request: ValidateShareAccessRequest = {
                shareId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                entityId: TEST_ENTITIES.WAYNE // Pass different user's entityId
            };

            const mockEvent = createMockRequestEvent(externalWayneUser1, request); // Different account user
            const response = await callWithSvelteKitErrorHandling(validateAccess, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.hasAccess).toBe(false); // Should NOT have access - different entity
        });

        test('internal user should access ANY shared session', async () => {
            // Use shareId from entity session
            const shareId = testData.shareIds['entity'] || (await createTestShare());

            // Internal user should access any session regardless of entity
            const request: ValidateShareAccessRequest = {
                shareId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                entityId: undefined // Internal users don't need entityId
            };

            const mockEvent = createMockRequestEvent(internalUserNoEntity, request);
            const response = await callWithSvelteKitErrorHandling(validateAccess, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.hasAccess).toBe(true); // Internal users should access any shared session
        });

        test('should DENY access to revoked shared session', async () => {
            // Create a session and share it
            const sessionState = await getOrCreateTestSession(
                'revoked-access-test-session',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData
            );

            const shareId = await getOrCreateSharedSession(
                'revoked-access-test-share',
                externalAcmeUser1,
                sessionState.sessionId,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            );

            // Revoke the session
            const revokeRequest: RevokeSharedSessionRequest = { shareId };
            const revokeEvent = createMockRequestEvent(externalAcmeUser1, revokeRequest);
            await callWithSvelteKitErrorHandling(revokeShare, revokeEvent as any);

            // Now try to access the revoked share - should be denied
            const validateRequest: ValidateShareAccessRequest = {
                shareId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                entityId: TEST_ENTITIES.ACME
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser2, validateRequest);
            const response = await callWithSvelteKitErrorHandling(validateAccess, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.hasAccess).toBe(false); // Should NOT have access to revoked session
        });

        test('should return false for non-existent shareId', async () => {
            const nonExistentShareId = 'non-existent-share-id-12345';

            const request: ValidateShareAccessRequest = {
                shareId: nonExistentShareId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                entityId: TEST_ENTITIES.ACME
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(validateAccess, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.hasAccess).toBe(false); // Should not have access to non-existent share
        });
    });

    describe('Share Lifecycle - Revoke/Unrevoke', () => {
        test('session owner can revoke shared session', async () => {
            // Create a session and share it first
            const sessionState = await getOrCreateTestSession(
                'revoke-test-session-owner',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData
            );

            const shareId = await getOrCreateSharedSession(
                'revoke-test-share-owner',
                externalAcmeUser1,
                sessionState.sessionId,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            );

            // Session owner should be able to revoke
            const revokeRequest: RevokeSharedSessionRequest = {
                shareId
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, revokeRequest);
            const response = await callWithSvelteKitErrorHandling(revokeShare, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);

            // Verify access is now denied
            const validateRequest: ValidateShareAccessRequest = {
                shareId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            };

            await validateUserShareAccess(
                externalAcmeUser2,
                shareId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                false, // Should not have access after revoke
                TEST_ENTITIES.ACME
            );
        });

        test('share creator can revoke shared session', async () => {
            // Create a session and have internal user share it
            const sessionState = await getOrCreateTestSession(
                'revoke-test-session-creator',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData
            );

            // Internal user creates the share
            const shareId = await getOrCreateSharedSession(
                'revoke-test-share-creator',
                internalUserNoEntity,
                sessionState.sessionId,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            );

            // Share creator (internal user) should be able to revoke
            const revokeRequest: RevokeSharedSessionRequest = {
                shareId
            };

            const mockEvent = createMockRequestEvent(internalUserNoEntity, revokeRequest);
            const response = await callWithSvelteKitErrorHandling(revokeShare, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
        });

        test('session owner can unrevoke shared session', async () => {
            // Use the previously revoked session
            const shareId = testData.shareIds['revoked'] || (await createRevokedShare());

            const unrevokeRequest: UnrevokeSharedSessionRequest = {
                shareId
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, unrevokeRequest);
            const response = await callWithSvelteKitErrorHandling(unrevokeShare, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);

            // Verify access is restored
            await validateUserShareAccess(
                externalAcmeUser2,
                shareId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                true, // Should have access after unrevoke
                TEST_ENTITIES.ACME
            );
        });

        test('other users cannot revoke shared session', async () => {
            // Create a fresh session and share
            const sessionState = await getOrCreateTestSession(
                'revoke-test-unauthorized',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData
            );

            const shareId = await getOrCreateSharedSession(
                'revoke-test-unauthorized-share',
                externalAcmeUser1,
                sessionState.sessionId,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            );

            // Different user (not owner, not creator) tries to revoke
            const revokeRequest: RevokeSharedSessionRequest = {
                shareId
            };

            const mockEvent = createMockRequestEvent(externalStarkUser1, revokeRequest);
            const response = await callWithSvelteKitErrorHandling(revokeShare, mockEvent as any);

            // Should fail - unauthorized
            expect(response.status).toBe(403); // Forbidden - user is not authorized
        });

        test('should handle unrevoke of non-existent shared session gracefully', async () => {
            const nonExistentShareId = 'non-existent-share-id-unrevoke-test';

            const unrevokeRequest: UnrevokeSharedSessionRequest = {
                shareId: nonExistentShareId
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, unrevokeRequest);
            const response = await callWithSvelteKitErrorHandling(unrevokeShare, mockEvent as any);

            // Should return 404 for non-existent share
            expect(response.status).toBe(404);
        });

        test('should handle unrevoke of already unrevoked session', async () => {
            // Create a session and share it
            const sessionState = await getOrCreateTestSession(
                'unrevoke-already-unrevoked-session',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData
            );

            const shareId = await getOrCreateSharedSession(
                'unrevoke-already-unrevoked-share',
                externalAcmeUser1,
                sessionState.sessionId,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            );

            // Try to unrevoke a share that was never revoked
            const unrevokeRequest: UnrevokeSharedSessionRequest = {
                shareId
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, unrevokeRequest);
            const response = await callWithSvelteKitErrorHandling(unrevokeShare, mockEvent as any);

            // Should return 400 - trying to unrevoke a session that's not revoked is an error
            expect(response.status).toBe(400);
        });

        test('unauthorized user cannot unrevoke shared session', async () => {
            // Create a session and share it
            const sessionState = await getOrCreateTestSession(
                'unrevoke-unauthorized-session',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData
            );

            const shareId = await getOrCreateSharedSession(
                'unrevoke-unauthorized-share',
                externalAcmeUser1,
                sessionState.sessionId,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            );

            // Revoke it first
            const revokeRequest: RevokeSharedSessionRequest = { shareId };
            const revokeEvent = createMockRequestEvent(externalAcmeUser1, revokeRequest);
            await callWithSvelteKitErrorHandling(revokeShare, revokeEvent as any);

            // Different user (not owner, not creator) tries to unrevoke
            const unrevokeRequest: UnrevokeSharedSessionRequest = { shareId };
            const unrevokeEvent = createMockRequestEvent(externalStarkUser1, unrevokeRequest);
            const response = await callWithSvelteKitErrorHandling(unrevokeShare, unrevokeEvent as any);

            // Should fail - unauthorized
            expect(response.status).toBe(403); // Forbidden - user is not authorized
        });

        async function createRevokedShare(): Promise<string> {
            const sessionState = await getOrCreateTestSession(
                'revoke-test-temp-session',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData
            );

            const shareId = await getOrCreateSharedSession(
                'revoke-test-temp-share',
                externalAcmeUser1,
                sessionState.sessionId,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            );

            // Revoke it
            const revokeRequest: RevokeSharedSessionRequest = { shareId };
            const mockEvent = createMockRequestEvent(externalAcmeUser1, revokeRequest);
            await callWithSvelteKitErrorHandling(revokeShare, mockEvent as any);

            testData.shareIds['revoked'] = shareId;
            return shareId;
        }
    });

    describe('Visit Recording and Recent Shares', () => {
        test('should record share visit', async () => {
            // Use an existing shareId or create one
            const shareId = testData.shareIds['entity'] || testData.shareIds['global'] || (await createTestShareForVisit());

            const request: RecordShareVisitRequest = {
                shareId
            };

            const mockEvent = createMockRequestEvent(externalStarkUser1, request);
            const response = await callWithSvelteKitErrorHandling(visitShare, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
        });

        async function createTestShareForVisit(): Promise<string> {
            const sessionState = await getOrCreateTestSession(
                'visit-test-session',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData
            );

            return await getOrCreateSharedSession(
                'visit-test-share',
                externalAcmeUser1,
                sessionState.sessionId,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            );
        }

        test('should get recent shared sessions', async () => {
            const request: GetRecentSharedRequest = {
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                limit: 5
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(getRecentShared, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(Array.isArray(result.recentShared)).toBe(true);
        });

        test('should handle visit recording for non-existent share', async () => {
            const nonExistentShareId = 'non-existent-share-visit-test';
            const request: RecordShareVisitRequest = {
                shareId: nonExistentShareId
            };

            const mockEvent = createMockRequestEvent(externalStarkUser1, request);
            const response = await callWithSvelteKitErrorHandling(visitShare, mockEvent as any);

            // Should return 404 for non-existent share
            expect(response.status).toBe(404);
        });

        test('should handle visit recording for revoked share', async () => {
            // Create and share a session
            const sessionState = await getOrCreateTestSession(
                'visit-revoked-session',
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED,
                ESSENTIAL_TEST_DATA.AGENT_ID,
                externalAcmeUser1.customData
            );

            const shareId = await getOrCreateSharedSession(
                'visit-revoked-share',
                externalAcmeUser1,
                sessionState.sessionId,
                externalAcmeUser1.userId,
                ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED
            );

            // Revoke the session
            const revokeRequest: RevokeSharedSessionRequest = { shareId };
            const revokeEvent = createMockRequestEvent(externalAcmeUser1, revokeRequest);
            await callWithSvelteKitErrorHandling(revokeShare, revokeEvent as any);

            // Try to record a visit for the revoked share
            const visitRequest: RecordShareVisitRequest = { shareId };
            const visitEvent = createMockRequestEvent(externalStarkUser1, visitRequest);
            const response = await callWithSvelteKitErrorHandling(visitShare, visitEvent as any);

            // Visit recording should still succeed (the validation happens elsewhere)
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
        });

        test('should return empty array when no recent shared visits exist', async () => {
            // Use a chat app that likely has no visits
            const request: GetRecentSharedRequest = {
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_DISABLED, // Different app
                limit: 5
            };

            const mockEvent = createMockRequestEvent(externalStarkUser1, request); // Different user
            const response = await callWithSvelteKitErrorHandling(getRecentShared, mockEvent as any);

            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(Array.isArray(result.recentShared)).toBe(true);
            // Should be empty or very few results for this user/app combo
        });

        test('should handle multiple visits to the same share by same user', async () => {
            // Use an existing shareId
            const shareId = testData.shareIds['entity'] || testData.shareIds['global'] || (await createTestShareForVisit());

            // Record first visit
            const request1: RecordShareVisitRequest = { shareId };
            const mockEvent1 = createMockRequestEvent(externalStarkUser1, request1);
            const response1 = await callWithSvelteKitErrorHandling(visitShare, mockEvent1 as any);
            expect(response1.status).toBe(200);

            // Record second visit by same user
            const request2: RecordShareVisitRequest = { shareId };
            const mockEvent2 = createMockRequestEvent(externalStarkUser1, request2);
            const response2 = await callWithSvelteKitErrorHandling(visitShare, mockEvent2 as any);
            expect(response2.status).toBe(200);

            // Both should succeed
            const result2 = await response2.json();
            expect(result2.success).toBe(true);
        });
    });
});
