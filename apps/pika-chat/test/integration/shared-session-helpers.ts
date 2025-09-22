/**
 * Shared Session Test Helpers
 *
 * This module provides helper functions for testing shared session functionality.
 * It includes API wrapper functions and test state management to avoid recreating
 * data between tests while ensuring each test can run independently.
 */

// Load environment variables first
import './env-setup';

import type { MockAuthData, MockCustomData } from '$lib/server/auth/default-provider';
import { createSharedSession, validateShareAccess } from '$lib/server/chat-apis';
import type { AuthenticatedUser, ChatSession, ChatSessionForCreate, CreateSharedSessionRequest, ValidateShareAccessResponse } from 'pika-shared/types/chatbot/chatbot-types';
import { ESSENTIAL_TEST_DATA, mockAppConfig, TEST_ENTITIES } from './general-mocks';

// ===== API WRAPPER FUNCTIONS =====

/**
 * Create a mock session via chat-admin API
 */
export async function createMockSession(session: ChatSessionForCreate & { testType: 'mock' }, adminUserId: string = 'test-admin'): Promise<ChatSession> {
    const chatAdminApiUrl = `https://${mockAppConfig.chatAdminApiId}.execute-api.${mockAppConfig.awsRegion}.amazonaws.com/${mockAppConfig.stage}`;

    const response = await fetch(`${chatAdminApiUrl}/api/chat-admin/session/mock`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            session,
            userId: adminUserId
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to create mock session: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
        throw new Error(`Failed to create mock session: ${result.error}`);
    }

    return result.session;
}

/**
 * Get a session by user ID and session ID via chat-admin API
 */
export async function getMockSession(userId: string, sessionId: string): Promise<ChatSession | null> {
    const chatAdminApiUrl = `https://${mockAppConfig.chatAdminApiId}.execute-api.${mockAppConfig.awsRegion}.amazonaws.com/${mockAppConfig.stage}`;

    const response = await fetch(`${chatAdminApiUrl}/api/chat-admin/session/mock/${sessionId}/user/${userId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        if (response.status === 404) {
            return null;
        }
        throw new Error(`Failed to get mock session: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
        throw new Error(`Failed to get mock session: ${result.error}`);
    }

    return result.chatSession;
}

// ===== TEST DATA CREATION HELPERS =====

/**
 * Create a test session with the proper entityId based on chat app configuration
 */
export function createTestSessionWithEntity(userId: string, chatAppId: string, agentId: string, userCustomData?: any, title?: string): ChatSessionForCreate & { testType: 'mock' } {
    let entityId: string;

    // Determine entityId based on chat app configuration
    if (chatAppId === ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_DISABLED || chatAppId === ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_OVERRIDE_DISABLED) {
        // Entity feature disabled - use global entity
        entityId = TEST_ENTITIES.GLOBAL;
    } else if (chatAppId.startsWith(ESSENTIAL_TEST_DATA.DIRECT_AGENT_PREFIX)) {
        // Direct agent invocation - use global entity
        entityId = TEST_ENTITIES.GLOBAL;
    } else if (userCustomData && userCustomData.accountId) {
        // Entity feature enabled and user has accountId - use user's entity
        entityId = userCustomData.accountId;
    } else {
        // Default fallback
        entityId = TEST_ENTITIES.GLOBAL;
    }

    // Determine invocationMode based on chatAppId
    const invocationMode = chatAppId.startsWith(ESSENTIAL_TEST_DATA.DIRECT_AGENT_PREFIX) ? ('direct-agent-invoke' as const) : ('chat-app' as const);

    const result: ChatSessionForCreate & { testType: 'mock' } = {
        userId,
        chatAppId,
        agentId,
        entityId,
        identityId: userId,
        invocationMode,
        title: title || `Test Session ${Date.now()}`,
        sessionAttributes: {
            userId,
            agentId,
            chatAppId,
            currentDate: new Date().toISOString()
        },
        testType: 'mock'
    };

    return result;
}

// ===== TEST STATE MANAGEMENT =====

interface TestSessionState {
    sessionId: string;
    sessionData: ChatSession;
    shareId?: string;
}

interface TestState {
    sessions: {
        [key: string]: TestSessionState;
    };
    chatAppsVerified: Set<string>;
}

const testState: TestState = {
    sessions: {},
    chatAppsVerified: new Set()
};

/**
 * Get or create a test session for the given scenario
 */
export async function getOrCreateTestSession(
    scenarioKey: string,
    userId: string,
    chatAppId: string,
    agentId: string,
    userCustomData?: any,
    title?: string
): Promise<TestSessionState> {
    // Check if session already exists
    if (testState.sessions[scenarioKey]) {
        return testState.sessions[scenarioKey];
    }

    // Create new session
    const sessionTemplate = createTestSessionWithEntity(userId, chatAppId, agentId, userCustomData, title);
    const createdSession = await createMockSession(sessionTemplate);

    const sessionState: TestSessionState = {
        sessionId: createdSession.sessionId,
        sessionData: createdSession
    };

    // Store for future use
    testState.sessions[scenarioKey] = sessionState;
    return sessionState;
}

/**
 * Create or get a shared session
 */
export async function getOrCreateSharedSession(
    sessionKey: string,
    user: AuthenticatedUser<MockAuthData, MockCustomData>,
    sessionId: string,
    sessionUserId: string,
    chatAppId: string
): Promise<string> {
    const sessionState = testState.sessions[sessionKey];
    if (sessionState && sessionState.shareId) {
        return sessionState.shareId;
    }

    // Create the share
    const request: CreateSharedSessionRequest = {
        sessionId,
        sessionUserId,
        chatAppId
    };

    const shareResponse = await createSharedSession(user, request);
    if (!shareResponse.success) {
        throw new Error(`Failed to create share: ${shareResponse.error}`);
    }

    // Store the share ID
    if (sessionState) {
        sessionState.shareId = shareResponse.shareId;
    }

    return shareResponse.shareId;
}

// ===== VERIFICATION HELPERS =====

/**
 * Verify session properties after sharing
 */
export async function verifySessionAfterSharing(
    userId: string,
    sessionId: string,
    expectedProps: {
        shareId?: string;
        shareCreatedByUserId?: string;
        shareDate?: boolean; // true to check if exists
        entityId?: string;
    }
): Promise<void> {
    const session = await getMockSession(userId, sessionId);
    if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
    }

    if (expectedProps.shareId !== undefined) {
        expect(session.shareId).toBe(expectedProps.shareId);
    }

    if (expectedProps.shareCreatedByUserId !== undefined) {
        expect(session.shareCreatedByUserId).toBe(expectedProps.shareCreatedByUserId);
    }

    if (expectedProps.shareDate) {
        expect(session.shareDate).toBeDefined();
        expect(new Date(session.shareDate!).getTime()).toBeGreaterThan(0);
    }

    if (expectedProps.entityId !== undefined) {
        expect(session.entityId).toBe(expectedProps.entityId);
    }
}

/**
 * Validate share access for a user
 */
export async function validateUserShareAccess(
    user: AuthenticatedUser<MockAuthData, MockCustomData>,
    shareId: string,
    chatAppId: string,
    expectedHasAccess: boolean,
    entityId?: string
): Promise<ValidateShareAccessResponse> {
    const response = await validateShareAccess(user, shareId, chatAppId, entityId);

    expect(response.success).toBe(true);
    expect(response.hasAccess).toBe(expectedHasAccess);

    return response;
}

// ===== CLEANUP HELPERS =====

/**
 * Clear test state (useful for isolated test runs)
 */
export function clearTestState(): void {
    testState.sessions = {};
    testState.chatAppsVerified.clear();
}

/**
 * Get test scenario keys for easy reference
 */
export const TEST_SESSION_SCENARIOS = {
    ACME_ENTITY_SESSION: 'acme-entity-session',
    ACME_GLOBAL_SESSION: 'acme-global-session',
    ACME_OVERRIDE_GLOBAL_SESSION: 'acme-override-global-session',
    DIRECT_AGENT_SESSION: 'direct-agent-session',
    STARK_ENTITY_SESSION: 'stark-entity-session',
    INTERNAL_USER_SESSION: 'internal-user-session'
} as const;

export type TestSessionScenario = (typeof TEST_SESSION_SCENARIOS)[keyof typeof TEST_SESSION_SCENARIOS];
