// Load environment variables first
import './env-setup';

import type { MockAuthData, MockCustomData } from '$lib/server/auth/default-provider';
import type { AuthProvider } from '$lib/server/auth/types';
import type { KeyManager } from '$lib/server/encryption/KeyManager';
import type { AppConfig } from '$lib/server/server-types';
import type { AgentDefinition, AuthenticatedUser, ChatApp, ChatSessionForCreate, ToolDefinition, UserType } from 'pika-shared/types/chatbot/chatbot-types';
import { v7 as uuidv7 } from 'uuid';

// ===== RE-EXPORTED TYPES FOR CONVENIENCE =====
// Re-export commonly used types so test files don't need to import from shared package directly

export type {
    AgentDefinition,
    AuthenticatedUser,
    ChatApp,
    ChatSessionForCreate,
    CreateSharedSessionRequest,
    GetPinnedSessionsRequest,
    GetRecentSharedRequest,
    PinSessionRequest,
    RecordOrUndef,
    RecordShareVisitRequest,
    ToolDefinition,
    UnpinSessionRequest,
    UnrevokeSharedSessionRequest,
    UserType,
    ValidateShareAccessRequest
} from 'pika-shared/types/chatbot/chatbot-types';

// ===== MOCK INTERFACES =====

/**
 * Mock locals object that matches what our SvelteKit app provides in locals
 */
export interface MockLocals {
    user: AuthenticatedUser<MockAuthData, MockCustomData>;
    appConfig: AppConfig;
    authProvider: AuthProvider<MockAuthData, MockCustomData>;
    keyManager: KeyManager;
}

/**
 * Simplified mock request for testing - only includes the methods we need
 */
export interface MockRequest {
    json(): Promise<any>;
}

/**
 * Simplified mock RequestEvent for testing - includes the minimal properties needed
 * This is intentionally a subset of SvelteKit's RequestEvent to avoid replicating the full interface
 */
export interface MockRequestEvent {
    request: MockRequest;
    locals: MockLocals;
    // Add minimal additional properties that the API handlers might expect
    cookies?: any;
    fetch?: any;
    getClientAddress?: () => string;
    params?: Record<string, string>;
    route?: any;
    setHeaders?: any;
    url?: URL;
}

// ===== MOCK IMPLEMENTATIONS =====

/**
 * Mock AppConfig for testing - uses environment variables loaded from .env.local
 */
export const mockAppConfig: AppConfig = {
    isLocal: true,
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    awsAccount: process.env.AWS_ACCOUNT || '123456789012',
    redirectCallbackUriPath: '/auth/callback',
    jwtSecret: 'test-jwt-secret',
    webappUrl: process.env.WEBAPP_URL || 'http://localhost:3000',
    pikaS3Bucket: process.env.PIKA_S3_BUCKET || 'test-pika-s3-bucket',
    stage: process.env.STAGE || 'test',
    chatApiId: process.env.CHAT_API_ID || 'test-chat-api-id',
    chatAdminApiId: process.env.CHAT_ADMIN_API_ID || 'test-chat-admin-api-id',
    converseFnUrl: process.env.CONVERSE_FUNCTION_URL || 'https://test-converse-function.amazonaws.com',
    pikaServiceProjNameKebabCase: process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE || 'pika-test',
    pikaChatProjNameKebabCase: process.env.PIKA_CHAT_PROJ_NAME_KEBAB_CASE || 'pika-chat-test',
    tagDefinitionsTableName: process.env.TAG_DEFINITIONS_TABLE || 'test-tag-definitions',
    kmsKeyAlias: 'alias/pika-chat-test-key',
    ssmParameterPrefix: '/stack/pika-chat-test/test/cookie-keys',
    keyRefreshIntervalHours: 1,
    maxKeyVersions: 3,
    cookieMaxAgeHours: 12,
    getArbitraryConfigValue: (key: string) => {
        return process.env[key] || `mock-${key}`;
    }
};

/**
 * Mock KeyManager for testing
 */
export const mockKeyManager = {
    initialize: async () => {},
    refreshKeysIfNeeded: async () => {},
    getCurrentKey: () => Buffer.from('mock-key-32-bytes-long-for-aes256', 'utf8'),
    getKeyByVersion: (version: number) => Buffer.from(`mock-key-v${version}-32-bytes-long-aes`, 'utf8'),
    getCurrentVersion: () => 1,
    getAllVersions: () => [1],
    encryptData: (data: string) => Buffer.from(data).toString('base64'),
    decryptData: (encryptedData: string, version: number = 1) => Buffer.from(encryptedData, 'base64').toString('utf8')
} as any as KeyManager;

/**
 * Mock AuthProvider for testing
 */
export const mockAuthProvider = {
    authenticate: async () => ({ authenticatedUser: undefined }),
    validateUser: async () => undefined,
    logout: async () => '/login',
    addValueToLocalsForRoute: async () => undefined
} as any as AuthProvider<MockAuthData, MockCustomData>;

// ===== HELPER FUNCTIONS =====

/**
 * Helper to create mock request events
 * Returns a MockRequestEvent that can be cast to RequestEvent for testing
 */
export function createMockRequestEvent(user: AuthenticatedUser<MockAuthData, MockCustomData>, body: any): MockRequestEvent {
    return {
        request: {
            json: async () => body
        },
        locals: {
            user,
            appConfig: mockAppConfig,
            authProvider: mockAuthProvider,
            keyManager: mockKeyManager
        },
        cookies: {} as any,
        fetch: fetch,
        getClientAddress: () => '127.0.0.1',
        params: {},
        route: { id: '/test' },
        setHeaders: () => {},
        url: new URL('http://localhost:3000/test')
    };
}

/**
 * Create a mock request with just the body
 */
export function createMockRequest(body: any): MockRequest {
    return {
        json: async () => body
    };
}

// ===== TEST DATA HELPERS =====

/**
 * Create test session data
 */
export function createTestSession(userId: string, chatAppId: string, agentId: string, entityId: string = 'chat-app-global', title?: string): ChatSessionForCreate & { test: true } {
    // Determine invocationMode based on chatAppId
    const invocationMode = chatAppId.startsWith(ESSENTIAL_TEST_DATA.DIRECT_AGENT_PREFIX) ? ('direct-agent-invoke' as const) : ('chat-app' as const);

    return {
        sessionId: uuidv7(),
        userId,
        chatAppId,
        agentId,
        identityId: userId,
        invocationMode,
        title: title || `Test Session ${Date.now()}`,
        sessionAttributes: {
            userId,
            agentId,
            chatAppId,
            currentDate: new Date().toISOString()
        },
        entityId,
        test: true
    } as ChatSessionForCreate & { test: true };
}

/**
 * Create test chat app data with entity feature enabled by default (site config)
 */
export function createTestChatAppEntityEnabled(chatAppId: string, agentId: string, userTypes?: UserType[], userRoles?: string[]): ChatApp & { test: true } {
    return {
        chatAppId,
        title: `Test Chat App ${chatAppId} (Entity Enabled)`,
        description: `Test chat app with entity feature enabled via site config`,
        agentId,
        enabled: true,
        userTypes: userTypes || ['internal-user', 'external-user'],
        userRoles: userRoles || [],
        // No features defined - uses site default (entity enabled)
        createDate: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        test: true
    };
}

/**
 * Create test chat app data with entity feature explicitly disabled
 */
export function createTestChatAppEntityDisabled(chatAppId: string, agentId: string, userTypes?: UserType[], userRoles?: string[]): ChatApp & { test: true } {
    return {
        chatAppId,
        title: `Test Chat App ${chatAppId} (Entity Disabled)`,
        description: `Test chat app with entity feature explicitly disabled`,
        agentId,
        enabled: true,
        userTypes: userTypes || ['internal-user', 'external-user'],
        userRoles: userRoles || [],
        features: {
            entity: {
                featureId: 'entity',
                enabled: false
            }
        },
        createDate: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        test: true
    };
}

/**
 * Create test chat app data with entity feature disabled via override
 */
export function createTestChatAppEntityOverrideDisabled(chatAppId: string, agentId: string, userTypes?: UserType[], userRoles?: string[]): ChatApp & { test: true } {
    const chatApp: ChatApp & { test: true } = {
        chatAppId,
        title: `Test Chat App ${chatAppId} (Entity Override Disabled)`,
        description: `Test chat app with entity feature disabled via override`,
        agentId,
        enabled: true,
        userTypes: userTypes || ['internal-user', 'external-user'],
        userRoles: userRoles || [],
        // Base chat app has no features configured
        createDate: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        test: true
    };

    // Add override that disables entity feature
    chatApp.override = {
        enabled: true,
        userTypes: ['internal-user', 'external-user'], // Explicitly allow both user types
        userRoles: [], // No role restrictions
        features: {
            entity: {
                featureId: 'entity',
                enabled: false
            }
        },
        createDate: new Date().toISOString(),
        lastUpdate: new Date().toISOString()
    };

    return chatApp;
}

/**
 * Legacy function - kept for backward compatibility
 */
export function createTestChatApp(chatAppId: string, agentId: string, entityEnabled: boolean = false, userTypes?: UserType[], userRoles?: string[]): ChatApp & { test: true } {
    return entityEnabled ? createTestChatAppEntityEnabled(chatAppId, agentId, userTypes, userRoles) : createTestChatAppEntityDisabled(chatAppId, agentId, userTypes, userRoles);
}

/**
 * Create test agent data
 */
export function createTestAgent(agentId: string, name: string, toolIds?: string[]): AgentDefinition & { test: true } {
    return {
        agentId,
        basePrompt: `You are ${name}, a helpful test assistant.`,
        toolIds: toolIds || [],
        version: 1,
        createdBy: 'test-admin',
        lastModifiedBy: 'test-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        test: true
    };
}

/**
 * Create test tool data
 */
export function createTestTool(toolId: string, name: string): ToolDefinition & { test: true } {
    return {
        toolId,
        executionType: 'inline' as const,
        displayName: name,
        name: toolId,
        description: `Test tool ${name} for integration testing`,
        supportedAgentFrameworks: ['bedrock' as const],
        code: `function handler(event, params) { return { result: 'test' }; }`,
        version: 1,
        createdBy: 'test-admin',
        lastModifiedBy: 'test-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        test: true
    };
}

// ===== TEST DATA CLEANUP HELPERS =====

/**
 * Generate unique test identifiers
 */
export function generateTestId(prefix: string): string {
    return `${prefix}-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create test entity configurations
 */
export const TEST_ENTITIES = {
    ACME: 'acme-account',
    STARK: 'stark-account',
    WAYNE: 'wayne-account',
    GLOBAL: 'chat-app-global'
} as const;

/**
 * Common test scenarios
 */
export const TEST_SCENARIOS = {
    // Entity-based access scenarios
    ENTITY_ENABLED_SAME_ENTITY: 'entity-enabled-same-entity',
    ENTITY_ENABLED_DIFFERENT_ENTITY: 'entity-enabled-different-entity',
    ENTITY_DISABLED_ALL_ACCESS: 'entity-disabled-all-access',

    // User type scenarios
    INTERNAL_USER_ACCESS: 'internal-user-access',
    EXTERNAL_USER_ACCESS: 'external-user-access',

    // Session ownership scenarios
    OWN_SESSION: 'own-session',
    OTHER_USER_SESSION: 'other-user-session'
} as const;

export type TestScenario = (typeof TEST_SCENARIOS)[keyof typeof TEST_SCENARIOS];

// ===== CHAT ADMIN API CLIENT FUNCTIONS =====

/**
 * Call the chat-admin bulk delete API to clear all mock data
 */
export async function deleteAllMockData(): Promise<void> {
    const chatAdminApiUrl = `https://${mockAppConfig.chatAdminApiId}.execute-api.${mockAppConfig.awsRegion}.amazonaws.com/${mockAppConfig.stage}`;

    try {
        const response = await fetch(`${chatAdminApiUrl}/api/chat-admin/mock/bulk`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: 'test-admin',
                confirm: true
            })
        });

        if (!response.ok) {
            console.warn(`Failed to delete mock data: ${response.status} ${response.statusText}`);
        } else {
            console.log('Successfully cleared all mock data');
        }
    } catch (error) {
        console.warn('Failed to delete mock data:', error);
    }
}

/**
 * Create a mock user via chat-admin API
 */
export async function createMockUser(user: AuthenticatedUser<any, any> & { test: true }, adminUserId: string = 'test-admin'): Promise<void> {
    const chatAdminApiUrl = `https://${mockAppConfig.chatAdminApiId}.execute-api.${mockAppConfig.awsRegion}.amazonaws.com/${mockAppConfig.stage}`;

    try {
        const response = await fetch(`${chatAdminApiUrl}/api/chat-admin/user/mock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user,
                userId: adminUserId
            })
        });

        if (!response.ok) {
            console.warn(`Failed to create mock user ${user.userId}: ${response.status} ${response.statusText}`);
        } else {
            console.log(`Created mock user: ${user.userId}`);
        }
    } catch (error) {
        console.warn(`Failed to create mock user ${user.userId}:`, error);
    }
}

/**
 * Create a mock chat app via chat-admin API
 */
export async function createMockChatApp(chatApp: ChatApp & { test: true }, adminUserId: string = 'test-admin'): Promise<void> {
    const chatAdminApiUrl = `https://${mockAppConfig.chatAdminApiId}.execute-api.${mockAppConfig.awsRegion}.amazonaws.com/${mockAppConfig.stage}`;

    try {
        const response = await fetch(`${chatAdminApiUrl}/api/chat-admin/chat-app/mock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chatApp,
                userId: adminUserId
            })
        });

        if (!response.ok) {
            console.warn(`Failed to create mock chat app ${chatApp.chatAppId}: ${response.status} ${response.statusText}`);
        } else {
            console.log(`Created mock chat app: ${chatApp.chatAppId}`);
        }
    } catch (error) {
        console.warn(`Failed to create mock chat app ${chatApp.chatAppId}:`, error);
    }
}

/**
 * Create a mock agent via chat-admin API
 */
export async function createMockAgent(agent: AgentDefinition & { test: true }, adminUserId: string = 'test-admin'): Promise<void> {
    const chatAdminApiUrl = `https://${mockAppConfig.chatAdminApiId}.execute-api.${mockAppConfig.awsRegion}.amazonaws.com/${mockAppConfig.stage}`;

    try {
        const response = await fetch(`${chatAdminApiUrl}/api/chat-admin/agent/mock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                agent,
                userId: adminUserId
            })
        });

        if (!response.ok) {
            console.warn(`Failed to create mock agent ${agent.agentId}: ${response.status} ${response.statusText}`);
        } else {
            console.log(`Created mock agent: ${agent.agentId}`);
        }
    } catch (error) {
        console.warn(`Failed to create mock agent ${agent.agentId}:`, error);
    }
}

/**
 * Create a mock tool via chat-admin API
 */
export async function createMockTool(tool: ToolDefinition & { test: true }, adminUserId: string = 'test-admin'): Promise<void> {
    const chatAdminApiUrl = `https://${mockAppConfig.chatAdminApiId}.execute-api.${mockAppConfig.awsRegion}.amazonaws.com/${mockAppConfig.stage}`;

    try {
        const response = await fetch(`${chatAdminApiUrl}/api/chat-admin/tool/mock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tool,
                userId: adminUserId
            })
        });

        if (!response.ok) {
            console.warn(`Failed to create mock tool ${tool.toolId}: ${response.status} ${response.statusText}`);
        } else {
            console.log(`Created mock tool: ${tool.toolId}`);
        }
    } catch (error) {
        console.warn(`Failed to create mock tool ${tool.toolId}:`, error);
    }
}

// ===== TEST SETUP FUNCTIONS =====

/**
 * Essential test data that gets created for every test suite run
 */
export const ESSENTIAL_TEST_DATA = {
    CHAT_APP_ID: 'test-chat-app-main',
    AGENT_ID: 'test-agent-main',
    TOOL_ID: 'test-tool-main',

    // Different chat app variants for entity feature testing
    CHAT_APP_ENTITY_ENABLED: 'test-chat-app-entity-enabled', // Default: entity enabled via site config
    CHAT_APP_ENTITY_DISABLED: 'test-chat-app-entity-disabled', // Explicit: features.entity.enabled = false
    CHAT_APP_ENTITY_OVERRIDE_DISABLED: 'test-chat-app-entity-override', // Override: entity disabled via override

    // Direct agent invocation identifier pattern
    DIRECT_AGENT_PREFIX: 'direct-agent-'
} as const;

/**
 * Setup the test environment by clearing all mock data and recreating essentials
 */
export async function setupTestEnvironment(): Promise<void> {
    console.log('Setting up test environment...');

    // Environment variables are now loaded automatically by env-setup.ts

    // Initialize app configuration
    const { appConfig } = await import('../../src/lib/server/config');
    await appConfig.init();
    console.log('App config initialized');

    // Clear all existing mock data
    await deleteAllMockData();

    // Wait a moment for deletion to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create essential users
    console.log('Creating essential users...');
    await createEssentialUsers();

    // Create essential test infrastructure (agents, tools, chat apps)
    console.log('Creating essential test infrastructure...');
    await createEssentialTestInfrastructure();

    console.log('Test environment setup complete!');
}

/**
 * Create the essential users needed for testing
 */
async function createEssentialUsers(): Promise<void> {
    const { internalUserNoEntity, internalOverrideUserNoEntity, externalAcmeUser1, externalAcmeUser2, externalStarkUser1, externalWayneUser1 } = await import('./user-mock');

    // Create users with test flag
    const usersToCreate = [
        { ...internalUserNoEntity, test: true },
        { ...internalOverrideUserNoEntity, test: true },
        { ...externalAcmeUser1, test: true },
        { ...externalAcmeUser2, test: true },
        { ...externalStarkUser1, test: true },
        { ...externalWayneUser1, test: true }
    ];

    for (const user of usersToCreate) {
        await createMockUser(user as any, 'test-admin');
    }
}

/**
 * Create essential test infrastructure (agents, tools, chat apps)
 */
async function createEssentialTestInfrastructure(): Promise<void> {
    // Create a basic test tool
    const testTool = createTestTool(ESSENTIAL_TEST_DATA.TOOL_ID, 'Test Tool');
    await createMockTool(testTool);

    // Create a basic test agent
    const testAgent = createTestAgent(ESSENTIAL_TEST_DATA.AGENT_ID, 'Test Agent', [ESSENTIAL_TEST_DATA.TOOL_ID]);
    await createMockAgent(testAgent);

    // Create all chat app variants for comprehensive testing

    // 1. Entity enabled via site default (no features configured)
    const entityEnabledChatApp = createTestChatAppEntityEnabled(ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_ENABLED, ESSENTIAL_TEST_DATA.AGENT_ID);
    await createMockChatApp(entityEnabledChatApp);

    // 2. Entity explicitly disabled via features
    const entityDisabledChatApp = createTestChatAppEntityDisabled(ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_DISABLED, ESSENTIAL_TEST_DATA.AGENT_ID);
    await createMockChatApp(entityDisabledChatApp);

    // 3. Entity disabled via override
    const entityOverrideDisabledChatApp = createTestChatAppEntityOverrideDisabled(ESSENTIAL_TEST_DATA.CHAT_APP_ENTITY_OVERRIDE_DISABLED, ESSENTIAL_TEST_DATA.AGENT_ID);
    await createMockChatApp(entityOverrideDisabledChatApp);

    // 4. Legacy main chat app for backward compatibility
    const mainChatApp = createTestChatApp(ESSENTIAL_TEST_DATA.CHAT_APP_ID, ESSENTIAL_TEST_DATA.AGENT_ID, true);
    await createMockChatApp(mainChatApp);
}

/**
 * Teardown test environment (optional cleanup)
 */
export async function teardownTestEnvironment(): Promise<void> {
    console.log('Tearing down test environment...');
    await deleteAllMockData();
    console.log('Test environment teardown complete!');
}
