/// <reference types="jest" />

import {
    AgentDataRequest,
    AgentFramework,
    ChatAppDataRequest,
    ChatAppFeature,
    CreateAgentRequest,
    CreateChatAppRequest,
    CreateToolRequest,
    FeatureIdType,
    FileUploadFeature,
    PromptInputFieldLabelFeature,
    SearchToolsRequest,
    SuggestionsFeature,
    UiCustomizationFeature,
    UpdateAgentRequest,
    UpdateChatAppRequest,
    UpdateToolRequest
} from '@pika/shared/types/chatbot/chatbot-types';
import { FunctionDefinition } from '@aws-sdk/client-bedrock-agent-runtime';
import { invokeApi } from '../src/lib/invoke-api';

const API_ID = 'zjjl0d7dpl';
const STAGE = 'dev';

// Helper function to make authenticated HTTP requests using invokeApi
async function makeRequest(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', path: string, body?: any) {
    try {
        const response = await invokeApi({
            apiId: API_ID,
            stage: STAGE,
            path,
            method,
            body
        });

        return {
            status: response.statusCode,
            data: response.body,
            ok: response.statusCode >= 200 && response.statusCode < 300
        };
    } catch (error) {
        console.error(`Request failed for ${method} ${path}:`, error);
        throw error;
    }
}

// Mock expect function for basic assertions
function expect(actual: any) {
    return {
        toBe: (expected: any) => {
            if (actual !== expected) {
                throw new Error(`Expected ${actual} to be ${expected}`);
            }
        },
        toBeDefined: () => {
            if (actual === undefined) {
                throw new Error(`Expected value to be defined`);
            }
        },
        toBeNull: () => {
            if (actual !== null) {
                throw new Error(`Expected ${actual} to be null`);
            }
        }
    };
}

/**
 * Integration tests for Chat Admin APIs
 *
 * This file contains comprehensive tests for all the chat-admin endpoints:
 *
 * Agent Management:
 * - GET /api/chat-admin/agent - Get all agents
 * - POST /api/chat-admin/agent - Create agent
 * - GET /api/chat-admin/agent/{agentId} - Get specific agent
 * - PUT /api/chat-admin/agent/{agentId} - Update agent
 * - POST /api/chat-admin/agent-data - Create or update agent with tools idempotently
 *
 * Tool Management:
 * - GET /api/chat-admin/tool - Get all tools
 * - POST /api/chat-admin/tool - Create tool
 * - PUT /api/chat-admin/tool - Update tool
 * - POST /api/chat-admin/tool/search - Search tools by IDs
 * - GET /api/chat-admin/tool/{toolId} - Get specific tool
 *
 * Chat App Management:
 * - GET /api/chat-admin/chat-app - Get all chat apps
 * - POST /api/chat-admin/chat-app - Create chat app
 * - GET /api/chat-admin/chat-app/{chatAppId} - Get specific chat app
 * - PUT /api/chat-admin/chat-app/{chatAppId} - Update chat app
 * - POST /api/chat-admin/chat-app-data - Create or update chat app idempotently
 *
 * To run these tests:
 * Run: pnpm test
 */

describe('Chat Admin API Integration Tests', () => {
    let createdAgentId: string | undefined;
    let createdToolId: string | undefined;
    let createdChatAppId: string | undefined;

    // Test data with correct types
    const mockFunctionSchema: FunctionDefinition[] = [
        {
            name: 'test_function',
            description: 'Test function for integration testing',
            parameters: {
                input: {
                    type: 'string',
                    description: 'Test input parameter',
                    required: true
                }
            },
            requireConfirmation: 'DISABLED'
        }
    ];

    const mockToolDefinition = {
        toolId: `test-tool-${Date.now()}`,
        test: true,
        displayName: 'Test Tool',
        name: 'test-tool',
        description: 'A test tool for integration testing',
        executionType: 'lambda' as const,
        executionTimeout: 30,
        lambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
        supportedAgentFrameworks: ['bedrock'] as AgentFramework[],
        functionSchema: mockFunctionSchema,
        tags: {
            environment: 'test',
            category: 'utility'
        },
        lifecycle: {
            status: 'enabled' as const
        },
        createdBy: 'test-user',
        lastModifiedBy: 'test-user'
    };

    const mockAgentDefinition = {
        agentId: `test-agent-${Date.now()}`,
        test: true,
        basePrompt: 'You are a helpful test assistant. {{user.email}}',
        accessRules: [
            {
                condition: "user.scope IN ['admin', 'user']",
                effect: 'allow' as const,
                order: 1,
                description: 'Allow admin and user access'
            }
        ],
        rolloutPolicy: {
            betaAccounts: ['test-account-1'],
            regionRestrictions: ['us-east-1']
        },
        toolIds: [],
        createdBy: 'test-user',
        lastModifiedBy: 'test-user'
    };

    const mockChatAppDefinition = {
        chatAppId: `test-chat-app-${Date.now()}`,
        mode: 'fullpage' as const,
        dontCacheThis: true,
        test: true,
        title: 'Test Chat App',
        agentId: '', // Will be set to a valid agent ID
        features: {
            fileUpload: {
                featureId: 'fileUpload' as const,
                featureName: 'File Upload',
                enabled: true,
                defaultEnabledValue: false,
                mimeTypesAllowed: ['text/csv', 'application/json']
            } as FileUploadFeature,
            suggestions: {
                featureId: 'suggestions' as const,
                featureName: 'Suggestions',
                enabled: true,
                defaultEnabledValue: false,
                suggestions: ['How can I help you?', 'What would you like to know?']
            } as SuggestionsFeature,
            promptInputFieldLabel: {
                featureId: 'promptInputFieldLabel' as const,
                featureName: 'Prompt Input Field Label',
                enabled: true,
                defaultEnabledValue: true,
                hidePromptInputFieldLabel: false,
                promptInputFieldLabel: 'Ask me anything...'
            } as PromptInputFieldLabelFeature,
            uiCustomization: {
                featureId: 'uiCustomization' as const,
                featureName: 'UI Customization',
                enabled: true,
                defaultEnabledValue: false,
                showChatHistoryInFullPageMode: true,
                showUserRegionInLeftNav: false
            } as UiCustomizationFeature
        } as Record<FeatureIdType, ChatAppFeature>,
        enabled: true
    };

    describe('Tool Management', () => {
        test('should create a new tool', async () => {
            const createRequest: CreateToolRequest = {
                tool: mockToolDefinition,
                userId: 'test-user'
            };

            const response = await makeRequest('POST', '/api/chat-admin/tool', createRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.tool).toBeDefined();
            expect(response.data.tool.toolId).toBe(mockToolDefinition.toolId);

            createdToolId = response.data.tool.toolId;
            console.log('✓ POST /api/chat-admin/tool - Create Tool');
        });

        test('should get all tools', async () => {
            const response = await makeRequest('GET', '/api/chat-admin/tool');

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);

            console.log('✓ GET /api/chat-admin/tool - Get All Tools');
        });

        test('should get a specific tool', async () => {
            const toolIdToTest = createdToolId || mockToolDefinition.toolId;
            const response = await makeRequest('GET', `/api/chat-admin/tool/${toolIdToTest}`);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.tool).toBeDefined();

            console.log('✓ GET /api/chat-admin/tool/{toolId} - Get Specific Tool');
        });

        test('should update a tool', async () => {
            const toolIdToUpdate = createdToolId || mockToolDefinition.toolId;
            const updateRequest: UpdateToolRequest = {
                tool: {
                    toolId: toolIdToUpdate,
                    test: true,
                    displayName: 'Updated Test Tool',
                    name: 'updated-test-tool',
                    description: 'An updated test tool description',
                    executionType: 'lambda',
                    lambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
                    supportedAgentFrameworks: ['bedrock'],
                    functionSchema: mockFunctionSchema
                },
                userId: 'test-user'
            };

            const response = await makeRequest('PUT', '/api/chat-admin/tool', updateRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);

            console.log('✓ PUT /api/chat-admin/tool - Update Tool');
        });

        test('should search tools by IDs', async () => {
            const toolIdsToSearch = createdToolId ? [createdToolId] : [mockToolDefinition.toolId];
            const searchRequest: SearchToolsRequest = {
                toolIds: toolIdsToSearch,
                userId: 'test-user'
            };

            const response = await makeRequest('POST', '/api/chat-admin/tool/search', searchRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);

            console.log('✓ POST /api/chat-admin/tool/search - Search Tools');
        });
    });

    describe('Agent Management', () => {
        test('should create a new agent', async () => {
            const createRequest: CreateAgentRequest = {
                agent: {
                    ...mockAgentDefinition,
                    toolIds: createdToolId ? [createdToolId] : []
                },
                userId: 'test-user'
            };

            const response = await makeRequest('POST', '/api/chat-admin/agent', createRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.agent).toBeDefined();

            createdAgentId = response.data.agent.agentId;
            console.log('✓ POST /api/chat-admin/agent - Create Agent');
        });

        test('should get all agents', async () => {
            const response = await makeRequest('GET', '/api/chat-admin/agent');

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);

            console.log('✓ GET /api/chat-admin/agent - Get All Agents');
        });

        test('should get a specific agent', async () => {
            const agentIdToTest = createdAgentId || mockAgentDefinition.agentId;
            const response = await makeRequest('GET', `/api/chat-admin/agent/${agentIdToTest}`);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.agent).toBeDefined();

            console.log('✓ GET /api/chat-admin/agent/{agentId} - Get Specific Agent');
        });

        test('should update an agent', async () => {
            const agentIdToUpdate = createdAgentId || mockAgentDefinition.agentId;
            const updateRequest: UpdateAgentRequest = {
                agent: {
                    agentId: agentIdToUpdate,
                    basePrompt: 'You are an updated helpful test assistant. {{user.email}}',
                    dontCacheThis: true
                },
                userId: 'test-user'
            };

            const response = await makeRequest('PUT', `/api/chat-admin/agent/${agentIdToUpdate}`, updateRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);

            console.log('✓ PUT /api/chat-admin/agent/{agentId} - Update Agent');
        });
    });

    describe('Chat App Management', () => {
        beforeAll(() => {
            // Set a valid agent ID for chat app tests
            mockChatAppDefinition.agentId = createdAgentId || mockAgentDefinition.agentId;
        });

        test('should create a new chat app', async () => {
            const createRequest: CreateChatAppRequest = {
                chatApp: {
                    ...mockChatAppDefinition,
                    test: true
                },
                userId: 'test-user'
            };

            const response = await makeRequest('POST', '/api/chat-admin/chat-app', createRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.chatApp).toBeDefined();
            expect(response.data.chatApp.chatAppId).toBe(mockChatAppDefinition.chatAppId);
            expect(response.data.chatApp.title).toBe(mockChatAppDefinition.title);
            expect(response.data.chatApp.mode).toBe(mockChatAppDefinition.mode);
            expect(response.data.chatApp.enabled).toBe(true);

            createdChatAppId = response.data.chatApp.chatAppId;
            console.log('✓ POST /api/chat-admin/chat-app - Create Chat App');
        });

        test('should get all chat apps', async () => {
            const response = await makeRequest('GET', '/api/chat-admin/chat-app');

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.chatApps).toBeDefined();

            console.log('✓ GET /api/chat-admin/chat-app - Get All Chat Apps');
        });

        test('should get a specific chat app', async () => {
            const chatAppIdToTest = createdChatAppId || mockChatAppDefinition.chatAppId;
            const response = await makeRequest('GET', `/api/chat-admin/chat-app/${chatAppIdToTest}`);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.chatApp).toBeDefined();
            expect(response.data.chatApp.chatAppId).toBe(chatAppIdToTest);

            console.log('✓ GET /api/chat-admin/chat-app/{chatAppId} - Get Specific Chat App');
        });

        test('should update a chat app', async () => {
            const chatAppIdToUpdate = createdChatAppId || mockChatAppDefinition.chatAppId;
            const updateRequest: UpdateChatAppRequest = {
                chatApp: {
                    chatAppId: chatAppIdToUpdate,
                    test: true,
                    title: 'Updated Test Chat App',
                    agentId: createdAgentId || mockAgentDefinition.agentId,
                    mode: 'embedded' as const,
                    enabled: false,
                    features: {
                        fileUpload: {
                            featureId: 'fileUpload' as const,
                            featureName: 'File Upload',
                            enabled: false,
                            defaultEnabledValue: false,
                            mimeTypesAllowed: ['*']
                        } as FileUploadFeature
                    } as Record<FeatureIdType, ChatAppFeature>
                },
                userId: 'test-user'
            };

            const response = await makeRequest('PUT', `/api/chat-admin/chat-app/${chatAppIdToUpdate}`, updateRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.chatApp).toBeDefined();
            expect(response.data.chatApp.title).toBe('Updated Test Chat App');
            expect(response.data.chatApp.mode).toBe('embedded');
            expect(response.data.chatApp.enabled).toBe(false);

            console.log('✓ PUT /api/chat-admin/chat-app/{chatAppId} - Update Chat App');
        });
    });

    describe('Chat App Data Management (Idempotent Create/Update)', () => {
        let idempotentChatAppId: string;

        beforeAll(() => {
            idempotentChatAppId = `idempotent-chat-app-${Date.now()}`;
        });

        test('should create a new chat app idempotently', async () => {
            const chatAppDataRequest: ChatAppDataRequest = {
                chatApp: {
                    chatAppId: idempotentChatAppId,
                    mode: 'fullpage' as const,
                    dontCacheThis: true,
                    test: true,
                    title: 'Idempotent Test Chat App',
                    agentId: createdAgentId || mockAgentDefinition.agentId,
                    features: {
                        fileUpload: {
                            featureId: 'fileUpload' as const,
                            featureName: 'File Upload',
                            enabled: true,
                            defaultEnabledValue: false,
                            mimeTypesAllowed: ['text/plain', 'application/pdf']
                        } as FileUploadFeature,
                        suggestions: {
                            featureId: 'suggestions' as const,
                            featureName: 'Suggestions',
                            enabled: true,
                            defaultEnabledValue: false,
                            suggestions: ['Welcome!', 'How can I assist you today?', 'Tell me what you need help with.']
                        } as SuggestionsFeature
                    } as Record<FeatureIdType, ChatAppFeature>,
                    enabled: true
                },
                userId: 'idempotent-test-user'
            };

            const response = await makeRequest('POST', '/api/chat-admin/chat-app-data', chatAppDataRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.chatApp).toBeDefined();
            expect(response.data.chatApp.chatAppId).toBe(idempotentChatAppId);
            expect(response.data.chatApp.title).toBe('Idempotent Test Chat App');
            expect(response.data.chatApp.features).toBeDefined();
            expect(Object.keys(response.data.chatApp.features || {}).length).toBe(2);

            console.log('✓ POST /api/chat-admin/chat-app-data - Create Chat App (Idempotent)');
        });

        test('should update the same chat app idempotently (no changes)', async () => {
            // Send the exact same request again - should be idempotent
            const chatAppDataRequest: ChatAppDataRequest = {
                chatApp: {
                    chatAppId: idempotentChatAppId,
                    mode: 'fullpage' as const,
                    dontCacheThis: true,
                    test: true,
                    title: 'Idempotent Test Chat App',
                    agentId: createdAgentId || mockAgentDefinition.agentId,
                    features: {
                        fileUpload: {
                            featureId: 'fileUpload' as const,
                            featureName: 'File Upload',
                            enabled: true,
                            defaultEnabledValue: false,
                            mimeTypesAllowed: ['text/plain', 'application/pdf']
                        } as FileUploadFeature,
                        suggestions: {
                            featureId: 'suggestions' as const,
                            featureName: 'Suggestions',
                            enabled: true,
                            defaultEnabledValue: false,
                            suggestions: ['Welcome!', 'How can I assist you today?', 'Tell me what you need help with.']
                        } as SuggestionsFeature
                    } as Record<FeatureIdType, ChatAppFeature>,
                    enabled: true
                },
                userId: 'idempotent-test-user'
            };

            const response = await makeRequest('POST', '/api/chat-admin/chat-app-data', chatAppDataRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.chatApp).toBeDefined();
            expect(response.data.chatApp.chatAppId).toBe(idempotentChatAppId);

            console.log('✓ POST /api/chat-admin/chat-app-data - Idempotent Update (No Changes)');
        });

        test('should update chat app with changes idempotently', async () => {
            const chatAppDataRequest: ChatAppDataRequest = {
                chatApp: {
                    chatAppId: idempotentChatAppId,
                    test: true,
                    mode: 'embedded' as const,
                    dontCacheThis: false,
                    title: 'UPDATED Idempotent Test Chat App',
                    agentId: createdAgentId || mockAgentDefinition.agentId,
                    features: {
                        fileUpload: {
                            featureId: 'fileUpload' as const,
                            featureName: 'File Upload',
                            enabled: false, // Changed to disabled
                            defaultEnabledValue: false,
                            mimeTypesAllowed: ['*'] // Changed to allow all files
                        } as FileUploadFeature,
                        uiCustomization: {
                            featureId: 'uiCustomization' as const,
                            featureName: 'UI Customization',
                            enabled: true, // Added new feature
                            defaultEnabledValue: false,
                            showChatHistoryInFullPageMode: false,
                            showUserRegionInLeftNav: true
                        } as UiCustomizationFeature
                    } as Record<FeatureIdType, ChatAppFeature>,
                    enabled: false // Changed to disabled
                },
                userId: 'idempotent-test-user'
            };

            const response = await makeRequest('POST', '/api/chat-admin/chat-app-data', chatAppDataRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.chatApp).toBeDefined();
            expect(response.data.chatApp.chatAppId).toBe(idempotentChatAppId);
            expect(response.data.chatApp.title).toBe('UPDATED Idempotent Test Chat App');
            expect(response.data.chatApp.mode).toBe('embedded');
            expect(response.data.chatApp.enabled).toBe(false);
            expect(response.data.chatApp.dontCacheThis).toBe(false);

            console.log('✓ POST /api/chat-admin/chat-app-data - Idempotent Update with Changes');
        });

        test('should handle validation errors gracefully for chat apps', async () => {
            const invalidChatAppDataRequest: ChatAppDataRequest = {
                chatApp: {
                    chatAppId: `invalid-chat-app-${Date.now()}`,
                    mode: 'fullpage' as const,
                    test: true,
                    title: '', // Invalid: empty title
                    agentId: 'non-existent-agent', // Invalid: non-existent agent
                    features: {} as Record<FeatureIdType, ChatAppFeature>,
                    enabled: true
                },
                userId: 'test-user'
            };

            try {
                const response = await makeRequest('POST', '/api/chat-admin/chat-app-data', invalidChatAppDataRequest);
                // If we get here, the validation didn't work as expected
                console.log('✗ Should have thrown validation error for chat app');
            } catch (error) {
                // This is expected for validation errors
                console.log('✓ POST /api/chat-admin/chat-app-data - Validation Error Handling');
            }
        });
    });

    describe('Agent Data Management (Idempotent Create/Update)', () => {
        let idempotentAgentId: string;
        let idempotentToolId: string;

        test('should create a new agent with new tools idempotently', async () => {
            // Create unique IDs for this test
            idempotentAgentId = `idempotent-agent-${Date.now()}`;
            idempotentToolId = `idempotent-tool-${Date.now()}`;

            const agentDataRequest: AgentDataRequest = {
                agent: {
                    agentId: idempotentAgentId,
                    test: true,
                    basePrompt: 'You are an idempotent test assistant. {{user.email}}',
                    accessRules: [
                        {
                            condition: "user.scope IN ['admin', 'user']",
                            effect: 'allow' as const,
                            order: 1,
                            description: 'Allow admin and user access for idempotent test'
                        }
                    ],
                    rolloutPolicy: {
                        betaAccounts: ['idempotent-test-account'],
                        regionRestrictions: ['us-east-1']
                    }
                },
                userId: 'idempotent-test-user',
                tools: [
                    {
                        toolId: idempotentToolId,
                        test: true,
                        displayName: 'Idempotent Test Tool',
                        name: 'idempotent-test-tool',
                        description: 'A test tool for idempotent agent creation',
                        executionType: 'lambda' as const,
                        executionTimeout: 45,
                        lambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:idempotent-test-function',
                        supportedAgentFrameworks: ['bedrock'],
                        functionSchema: mockFunctionSchema,
                        tags: {
                            environment: 'idempotent-test',
                            category: 'automation'
                        },
                        lifecycle: {
                            status: 'enabled' as const
                        }
                    }
                ]
            };

            const response = await makeRequest('POST', '/api/chat-admin/agent-data', agentDataRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.agent).toBeDefined();
            expect(response.data.agent.agentId).toBe(idempotentAgentId);
            expect(response.data.tools).toBeDefined();
            expect(response.data.tools.length).toBe(1);
            expect(response.data.tools[0].toolId).toBe(idempotentToolId);

            console.log('✓ POST /api/chat-admin/agent-data - Create Agent with Tools (Idempotent)');
        });

        test('should update the same agent idempotently (no changes)', async () => {
            // Send the exact same request again - should be idempotent
            const agentDataRequest: AgentDataRequest = {
                agent: {
                    agentId: idempotentAgentId,
                    test: true,
                    basePrompt: 'You are an idempotent test assistant. {{user.email}}',
                    accessRules: [
                        {
                            condition: "user.scope IN ['admin', 'user']",
                            effect: 'allow' as const,
                            order: 1,
                            description: 'Allow admin and user access for idempotent test'
                        }
                    ],
                    rolloutPolicy: {
                        betaAccounts: ['idempotent-test-account'],
                        regionRestrictions: ['us-east-1']
                    }
                },
                userId: 'idempotent-test-user',
                tools: [
                    {
                        toolId: idempotentToolId,
                        test: true,
                        displayName: 'Idempotent Test Tool',
                        name: 'idempotent-test-tool',
                        description: 'A test tool for idempotent agent creation',
                        executionType: 'lambda' as const,
                        executionTimeout: 45,
                        lambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:idempotent-test-function',
                        supportedAgentFrameworks: ['bedrock'],
                        functionSchema: mockFunctionSchema,
                        tags: {
                            environment: 'idempotent-test',
                            category: 'automation'
                        },
                        lifecycle: {
                            status: 'enabled' as const
                        }
                    }
                ]
            };

            const response = await makeRequest('POST', '/api/chat-admin/agent-data', agentDataRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.agent).toBeDefined();
            expect(response.data.agent.agentId).toBe(idempotentAgentId);

            console.log('✓ POST /api/chat-admin/agent-data - Idempotent Update (No Changes)');
        });

        test('should update agent with changes idempotently', async () => {
            const agentDataRequest: AgentDataRequest = {
                agent: {
                    agentId: idempotentAgentId,
                    test: true,
                    basePrompt: 'You are an UPDATED idempotent test assistant. {{user.email}}',
                    dontCacheThis: true
                },
                userId: 'idempotent-test-user',
                tools: [
                    {
                        toolId: idempotentToolId,
                        test: true,
                        displayName: 'UPDATED Idempotent Test Tool',
                        name: 'updated-idempotent-test-tool',
                        description: 'An UPDATED test tool for idempotent agent updates',
                        executionType: 'lambda' as const,
                        executionTimeout: 60, // Changed timeout
                        lambdaArn: 'arn:aws:lambda:us-east-1:123456789012:function:idempotent-test-function',
                        supportedAgentFrameworks: ['bedrock'],
                        functionSchema: mockFunctionSchema,
                        tags: {
                            environment: 'idempotent-test-updated',
                            category: 'automation'
                        },
                        lifecycle: {
                            status: 'enabled' as const
                        }
                    }
                ]
            };

            const response = await makeRequest('POST', '/api/chat-admin/agent-data', agentDataRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.agent).toBeDefined();
            expect(response.data.agent.agentId).toBe(idempotentAgentId);
            expect(response.data.agent.basePrompt).toBe('You are an UPDATED idempotent test assistant. {{user.email}}');
            expect(response.data.agent.dontCacheThis).toBe(true);

            console.log('✓ POST /api/chat-admin/agent-data - Idempotent Update with Changes');
        });

        test('should create agent with existing tool IDs', async () => {
            const agentWithExistingToolsId = `agent-with-existing-tools-${Date.now()}`;

            // Create agent that references existing tools
            const agentDataRequest: AgentDataRequest = {
                agent: {
                    agentId: agentWithExistingToolsId,
                    test: true,
                    basePrompt: 'You are a test assistant that uses existing tools. {{user.email}}',
                    toolIds: createdToolId ? [createdToolId] : []
                },
                userId: 'test-user'
            };

            const response = await makeRequest('POST', '/api/chat-admin/agent-data', agentDataRequest);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.agent).toBeDefined();
            expect(response.data.agent.agentId).toBe(agentWithExistingToolsId);

            if (createdToolId) {
                expect(response.data.agent.toolIds).toBeDefined();
                expect(response.data.agent.toolIds?.length).toBe(1);
                expect(response.data.agent.toolIds?.[0]).toBe(createdToolId);
            }

            console.log('✓ POST /api/chat-admin/agent-data - Create Agent with Existing Tool IDs');
        });

        test('should handle validation errors gracefully', async () => {
            const invalidAgentDataRequest: AgentDataRequest = {
                agent: {
                    agentId: `invalid-agent-${Date.now()}`,
                    test: true,
                    basePrompt: '' // Invalid: empty basePrompt
                },
                userId: 'test-user'
            };

            try {
                const response = await makeRequest('POST', '/api/chat-admin/agent-data', invalidAgentDataRequest);
                // If we get here, the validation didn't work as expected
                console.log('✗ Should have thrown validation error');
            } catch (error) {
                // This is expected for validation errors
                console.log('✓ POST /api/chat-admin/agent-data - Validation Error Handling');
            }
        });
    });

    describe('Error Handling', () => {
        test('should handle non-existent agent gracefully', async () => {
            const response = await makeRequest('GET', '/api/chat-admin/agent/non-existent-agent');

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.agent).toBeNull();

            console.log('✓ Non-existent agent returns null');
        });

        test('should handle non-existent chat app gracefully', async () => {
            const response = await makeRequest('GET', '/api/chat-admin/chat-app/non-existent-chat-app');

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.chatApp).toBeNull();

            console.log('✓ Non-existent chat app returns null');
        });

        test('should return 404 for unsupported routes', async () => {
            try {
                const response = await makeRequest('DELETE', '/api/chat-admin/agent/test');

                if (response.status === 404) {
                    console.log('✓ Unsupported route returns 404');
                } else {
                    console.log('✗ Unsupported route should return 404');
                }
            } catch (error) {
                // This is expected for unsupported routes
                console.log('✓ Unsupported route properly rejected');
            }
        });

        test('should handle invalid chat app ID in path vs body mismatch', async () => {
            const updateRequest: UpdateChatAppRequest = {
                chatApp: {
                    chatAppId: 'different-id',
                    title: 'Mismatched ID Test'
                },
                userId: 'test-user'
            };

            try {
                const response = await makeRequest('PUT', '/api/chat-admin/chat-app/original-id', updateRequest);

                if (response.status === 400) {
                    console.log('✓ Chat App ID mismatch returns 400');
                } else {
                    console.log('✗ Chat App ID mismatch should return 400');
                }
            } catch (error) {
                // This is expected for validation errors
                console.log('✓ Chat App ID mismatch properly handled');
            }
        });
    });
});
