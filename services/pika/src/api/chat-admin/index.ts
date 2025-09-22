import {
    AddChatSessionFeedbackRequest,
    AddChatSessionFeedbackResponse,
    AgentDataRequest,
    AgentDataResponse,
    AgentDefinition,
    BaseRequestData,
    ChatApp,
    ChatAppDataRequest,
    ChatAppDataResponse,
    CreateAgentRequest,
    CreateChatAppRequest,
    CreateOrUpdateChatAppOverrideRequest,
    CreateOrUpdateChatAppOverrideResponse,
    CreateOrUpdateMockAgentRequest,
    CreateOrUpdateMockAgentResponse,
    CreateOrUpdateMockChatAppRequest,
    CreateOrUpdateMockChatAppResponse,
    CreateOrUpdateMockSessionRequest,
    CreateOrUpdateMockSessionResponse,
    CreateOrUpdateMockToolRequest,
    CreateOrUpdateMockToolResponse,
    CreateOrUpdateMockUserRequest,
    CreateOrUpdateMockUserResponse,
    CreateToolRequest,
    DeleteAllMockAgentsRequest,
    DeleteAllMockAgentsResponse,
    DeleteAllMockChatAppsRequest,
    DeleteAllMockChatAppsResponse,
    DeleteAllMockDataRequest,
    DeleteAllMockDataResponse,
    DeleteAllMockPinnedSessionsRequest,
    DeleteAllMockPinnedSessionsResponse,
    DeleteAllMockSessionsRequest,
    DeleteAllMockSessionsResponse,
    DeleteAllMockSharedSessionVisitsRequest,
    DeleteAllMockSharedSessionVisitsResponse,
    DeleteAllMockToolsRequest,
    DeleteAllMockToolsResponse,
    DeleteAllMockUsersRequest,
    DeleteAllMockUsersResponse,
    DeleteChatAppOverrideRequest,
    DeleteChatAppOverrideResponse,
    DeleteMockAgentRequest,
    DeleteMockAgentResponse,
    DeleteMockChatAppRequest,
    DeleteMockChatAppResponse,
    DeleteMockDataRequest,
    DeleteMockDataResponse,
    DeleteMockSessionRequest,
    DeleteMockSessionResponse,
    DeleteMockToolRequest,
    DeleteMockToolResponse,
    DeleteMockUserRequest,
    DeleteMockUserResponse,
    GetAllMockAgentsResponse,
    GetAllMockChatAppsResponse,
    GetAllMockDataResponse,
    GetAllMockPinnedSessionsResponse,
    GetAllMockSessionsResponse,
    GetAllMockSharedSessionVisitsResponse,
    GetAllMockToolsResponse,
    GetAllMockUsersResponse,
    GetChatAppsByRulesRequest,
    GetChatAppsByRulesResponse,
    GetInstructionsAddedForUserMemoryRequest,
    GetInstructionsAddedForUserMemoryResponse,
    GetMockSessionByUserIdAndSessionIdResponse,
    RecordOrUndef,
    SearchAllMemoryRecordsRequest,
    SearchAllMemoryRecordsResponse,
    SearchSemanticDirectivesRequest,
    SearchSemanticDirectivesResponse,
    SearchToolsRequest,
    SemanticDirectiveCreateOrUpdateRequest,
    SemanticDirectiveCreateOrUpdateResponse,
    SemanticDirectiveDeleteRequest,
    SemanticDirectiveDeleteResponse,
    SessionSearchRequest,
    SessionSearchResponse,
    TagDefinitionCreateOrUpdateRequest,
    TagDefinitionCreateOrUpdateResponse,
    TagDefinitionDeleteRequest,
    TagDefinitionDeleteResponse,
    TagDefinitionSearchRequest,
    TagDefinitionSearchResponse,
    ToolDefinition,
    UpdateAgentRequest,
    UpdateChatAppRequest,
    UpdateChatSessionFeedbackRequest,
    UpdateChatSessionFeedbackResponse,
    UpdateToolRequest,
    UserChatAppRule,
    UserMemoryFeatureWithMemoryInfo,
    UserMemoryStrategies
} from 'pika-shared/types/chatbot/chatbot-types';
import { apiGatewayFunctionDecorator, APIGatewayProxyEventPika } from 'pika-shared/util/api-gateway-utils';
import { HttpStatusError } from 'pika-shared/util/http-status-error';
import { BadRequestError } from 'pika-shared/util/bad-request-error';
import { ForbiddenError } from 'pika-shared/util/forbidden-error';
import {
    addChatSessionFeedback,
    createAgentDefinition,
    createChatAppDefinition,
    createOrUpdateAgentIdempotently,
    createOrUpdateChatAppIdempotently,
    createOrUpdateChatAppOverride,
    createOrUpdateSemanticDirectiveApi,
    createOrUpdateTagDefApi,
    createToolDefinition,
    deleteChatAppOverride,
    deleteSemanticDirectiveApi,
    deleteTagDefApi,
    getAgent,
    getAgents,
    getChatApp,
    getChatApps,
    getTool,
    getTools,
    searchForSessions,
    searchSemanticDirectivesApi,
    searchTagDefsApi,
    searchToolsByIds,
    updateAgentDefinition,
    updateChatAppDefinition,
    updateChatSessionFeedback,
    updateToolDefinition,
    validateAgentDefinition,
    validateChatAppDefinition,
    validateToolDefinition
} from '../../lib/chat-admin-apis';
import {
    createAgent,
    createChatApp as createChatAppDdb,
    createTool,
    deleteAllMockTestAgents,
    deleteAllMockTestChatApps,
    deleteAllMockTestTools,
    deleteMockAgent,
    deleteMockChatApp,
    deleteMockTool,
    getAgentById,
    getMockTestAgents,
    getMockTestChatApps,
    getMockTestTools,
    getToolById
} from '../../lib/chat-admin-ddb';
import { createChatSession, deleteMockSession, getUser } from '../../lib/chat-apis';
import {
    addUser,
    deleteAllMockTestChatSessions,
    deleteAllMockTestChatUsers,
    deleteAllMockTestPinnedSessions,
    deleteAllMockTestSharedSessionVisits,
    deleteMockUser,
    getChatSessionByUserIdAndSessionId,
    getMockTestChatSessions,
    getMockTestChatUsers,
    getMockTestPinnedSessions,
    getMockTestSharedSessionVisits
} from '../../lib/chat-ddb';
import { getMatchingChatApps } from '../../lib/get-matching-chat-apps';
import { getAllMemoryRecords, getMemoryInstructions } from '../../lib/memory';
import { getMemoryId } from '../../lib/utils';

type userIdFnTypeHandler<T, U> = (event: APIGatewayProxyEventPika<T>) => Promise<U>;

// Route matching utilities for proxy integration
interface RouteMatch {
    handler: userIdFnTypeHandler<any, any>;
    pathParameters: Record<string, string>;
}

/**
 * Convert a route template (e.g., "/api/chat-admin/agent/{agentId}") to a regex pattern
 */
function routeTemplateToRegex(template: string): RegExp {
    // Escape special regex characters except for our parameter placeholders
    const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Replace {paramName} with named capture groups
    const withCaptures = escaped.replace(/\\{([^}]+)\\}/g, '(?<$1>[^/]+)');
    return new RegExp(`^${withCaptures}$`);
}

/**
 * Find a matching route handler for the given method and path
 */
function findMatchingRoute(method: string, path: string): RouteMatch | undefined {
    const routeKey = `${method}:${path}`;

    // First try exact match (for routes without parameters)
    const exactMatch = routes[routeKey];
    if (exactMatch) {
        return {
            handler: exactMatch.handler,
            pathParameters: {}
        };
    }

    // Try pattern matching for parameterized routes
    for (const [template, routeConfig] of Object.entries(routes)) {
        const [templateMethod, templatePath] = template.split(':');

        if (templateMethod !== method) continue;

        // Skip if this doesn't contain parameters
        if (!templatePath.includes('{')) continue;

        const regex = routeTemplateToRegex(templatePath);
        const match = path.match(regex);

        if (match && match.groups) {
            return {
                handler: routeConfig.handler,
                pathParameters: match.groups
            };
        }
    }

    return undefined;
}

const routes: Record<string, { handler: userIdFnTypeHandler<any, any> }> = {
    'GET:/api/chat-admin/agent': {
        handler: handleGetAgents
    },
    'POST:/api/chat-admin/agent': {
        handler: handleCreateAgent
    },
    'POST:/api/chat-admin/agent-data': {
        handler: handleCreateOrUpdateAgentIdempotently
    },
    'GET:/api/chat-admin/agent/{agentId}': {
        handler: handleGetAgent
    },
    'PUT:/api/chat-admin/agent/{agentId}': {
        handler: handleUpdateAgent
    },
    'GET:/api/chat-admin/tool': {
        handler: handleGetTools
    },
    'POST:/api/chat-admin/tool': {
        handler: handleCreateTool
    },
    'PUT:/api/chat-admin/tool': {
        handler: handleUpdateTool
    },
    'POST:/api/chat-admin/tool/search': {
        handler: handleSearchTools
    },
    'GET:/api/chat-admin/tool/{toolId}': {
        handler: handleGetTool
    },
    'GET:/api/chat-admin/chat-app': {
        handler: handleGetAllChatApps
    },
    'GET:/api/chat-admin/chat-app/{chatAppId}': {
        handler: handleGetChatApp
    },
    'POST:/api/chat-admin/chat-app': {
        handler: handleCreateChatApp
    },
    'POST:/api/chat-admin/chat-app-data': {
        handler: handleCreateOrUpdateChatAppIdempotently
    },
    'PUT:/api/chat-admin/chat-app/{chatAppId}': {
        handler: handleUpdateChatApp
    },
    'POST:/api/chat-admin/chat-app-by-rules': {
        handler: handleGetChatAppByRules
    },
    'POST:/api/chat-admin/chat-app/{chatAppId}/override': {
        handler: handleCreateOrUpdateChatAppOverride
    },
    'DELETE:/api/chat-admin/chat-app/{chatAppId}/override': {
        handler: handleDeleteChatAppOverride
    },
    'POST:/api/chat-admin/session/feedback': {
        handler: handleCreateSessionFeedback
    },
    'PUT:/api/chat-admin/session/feedback': {
        handler: handleUpdateSessionFeedback
    },
    'POST:/api/chat-admin/session/search': {
        handler: handleSearchSessions
    },
    'POST:/api/chat-admin/tagdef': {
        handler: handleCreateOrUpdateTagDef
    },
    'DELETE:/api/chat-admin/tagdef': {
        handler: handleDeleteTagDef
    },
    'POST:/api/chat-admin/tagdef/search': {
        handler: handleGetTagDefs
    },
    'POST:/api/chat-admin/semantic-directive': {
        handler: handleCreateOrUpdateSemanticDirective
    },
    'DELETE:/api/chat-admin/semantic-directive': {
        handler: handleDeleteSemanticDirective
    },
    'POST:/api/chat-admin/semantic-directive/search': {
        handler: handleSearchSemanticDirectives
    },
    'POST:/api/chat-admin/memory/record/search': {
        handler: handleSearchAllMemoryRecords
    },
    'POST:/api/chat-admin/memory/instructions': {
        handler: handleGetInstructionsAddedForUserMemory
    },
    // Mock data APIs for testing
    'POST:/api/chat-admin/session/mock': {
        handler: handleCreateOrUpdateMockSession
    },
    'DELETE:/api/chat-admin/session/mock': {
        handler: handleDeleteMockSession
    },
    'POST:/api/chat-admin/chat-app/mock': {
        handler: handleCreateOrUpdateMockChatApp
    },
    'DELETE:/api/chat-admin/chat-app/mock': {
        handler: handleDeleteMockChatApp
    },
    'POST:/api/chat-admin/agent/mock': {
        handler: handleCreateOrUpdateMockAgent
    },
    'DELETE:/api/chat-admin/agent/mock': {
        handler: handleDeleteMockAgent
    },
    'POST:/api/chat-admin/tool/mock': {
        handler: handleCreateOrUpdateMockTool
    },
    'DELETE:/api/chat-admin/tool/mock': {
        handler: handleDeleteMockTool
    },
    'POST:/api/chat-admin/user/mock': {
        handler: handleCreateOrUpdateMockUser
    },
    'DELETE:/api/chat-admin/user/mock': {
        handler: handleDeleteMockUser
    },
    'DELETE:/api/chat-admin/mock': {
        handler: handleDeleteMock
    },
    // Get all mock data endpoints
    'GET:/api/chat-admin/session/mock/all': {
        handler: handleGetAllMockSessions
    },
    'GET:/api/chat-admin/session/mock/{sessionId}/user/{userId}': {
        handler: handleGetMockSessionByUserIdAndSessionId
    },
    'GET:/api/chat-admin/user/mock/all': {
        handler: handleGetAllMockUsers
    },
    'GET:/api/chat-admin/agent/mock/all': {
        handler: handleGetAllMockAgents
    },
    'GET:/api/chat-admin/tool/mock/all': {
        handler: handleGetAllMockTools
    },
    'GET:/api/chat-admin/chat-app/mock/all': {
        handler: handleGetAllMockChatApps
    },
    'GET:/api/chat-admin/shared-session-visit/mock/all': {
        handler: handleGetAllMockSharedSessionVisits
    },
    'GET:/api/chat-admin/pinned-session/mock/all': {
        handler: handleGetAllMockPinnedSessions
    },
    // Delete all mock data endpoints
    'DELETE:/api/chat-admin/session/mock/all': {
        handler: handleDeleteAllMockSessions
    },
    'DELETE:/api/chat-admin/user/mock/all': {
        handler: handleDeleteAllMockUsers
    },
    'DELETE:/api/chat-admin/agent/mock/all': {
        handler: handleDeleteAllMockAgents
    },
    'DELETE:/api/chat-admin/tool/mock/all': {
        handler: handleDeleteAllMockTools
    },
    'DELETE:/api/chat-admin/chat-app/mock/all': {
        handler: handleDeleteAllMockChatApps
    },
    'DELETE:/api/chat-admin/shared-session-visit/mock/all': {
        handler: handleDeleteAllMockSharedSessionVisits
    },
    'DELETE:/api/chat-admin/pinned-session/mock/all': {
        handler: handleDeleteAllMockPinnedSessions
    },
    // Bulk operations
    'GET:/api/chat-admin/mock/bulk': {
        handler: handleGetAllMockData
    },
    'DELETE:/api/chat-admin/mock/bulk': {
        handler: handleDeleteAllMockData
    }
};

/**
 * This will be decorated by the apiGatewayFunctionDecorator which wraps the handler in a try/catch
 * and formats the response using the toResponse function.  So, you just need to return the response
 * from the handlerFn and it will be formatted for the API Gateway response.  You can just throw errors
 * and they will be caught and formatted as a 500 error.  If you want to return a specific HTTP status code,
 * throw a HttpStatusError.
 */
export async function handlerFn(
    event: APIGatewayProxyEventPika<
        | CreateAgentRequest
        | UpdateAgentRequest
        | AgentDataRequest
        | CreateToolRequest
        | UpdateToolRequest
        | SearchToolsRequest
        | CreateChatAppRequest
        | UpdateChatAppRequest
        | GetChatAppsByRulesRequest
        | CreateOrUpdateChatAppOverrideRequest
        | DeleteChatAppOverrideRequest
        | TagDefinitionCreateOrUpdateRequest
        | TagDefinitionDeleteRequest
        | TagDefinitionSearchRequest
        | SemanticDirectiveCreateOrUpdateRequest
        | SemanticDirectiveDeleteRequest
        | SearchSemanticDirectivesRequest
        | SearchAllMemoryRecordsRequest
        | CreateOrUpdateMockSessionRequest
        | DeleteMockSessionRequest
        | CreateOrUpdateMockChatAppRequest
        | DeleteMockChatAppRequest
        | CreateOrUpdateMockAgentRequest
        | DeleteMockAgentRequest
        | CreateOrUpdateMockToolRequest
        | DeleteMockToolRequest
        | CreateOrUpdateMockUserRequest
        | DeleteMockUserRequest
        | BaseRequestData
        | void
    >
) {
    console.log('Event:', JSON.stringify(event, null, 2));

    const { httpMethod, path } = event;

    console.log('path', path);

    // Use dynamic route matching for proxy integration
    const routeMatch = findMatchingRoute(httpMethod, path);
    if (!routeMatch) {
        throw new HttpStatusError(`Unsupported route: ${httpMethod} ${path}`, 404);
    }

    // Merge extracted path parameters with existing ones
    if (Object.keys(routeMatch.pathParameters).length > 0) {
        event.pathParameters = {
            ...event.pathParameters,
            ...routeMatch.pathParameters
        };
    }

    return routeMatch.handler(event);
}

/**
 * GET:/api/chat-admin/agent
 */
async function handleGetAgents(_event: APIGatewayProxyEventPika<void>): Promise<{ success: boolean; agents: AgentDefinition[] }> {
    const agents = await getAgents();
    return {
        success: true,
        agents
    };
}

/**
 * GET:/api/chat-admin/agent/{agentId}
 */
async function handleGetAgent(event: APIGatewayProxyEventPika<void>): Promise<{ success: boolean; agent: AgentDefinition | undefined }> {
    const agentId = event.pathParameters?.agentId;
    if (!agentId) {
        throw new BadRequestError('Agent ID is required');
    }

    const agent = await getAgent(agentId);
    return {
        success: true,
        agent: agent || undefined
    };
}

/**
 * POST:/api/chat-admin/agent
 */
async function handleCreateAgent(event: APIGatewayProxyEventPika<CreateAgentRequest>): Promise<{ success: boolean; agent: AgentDefinition }> {
    const createAgentRequest = event.body;
    if (!createAgentRequest) {
        throw new BadRequestError('Request body is required');
    }

    // Validate the agent definition
    const validationErrors = validateAgentDefinition(createAgentRequest.agent);
    if (validationErrors.length > 0) {
        throw new HttpStatusError(`Validation errors: ${validationErrors.join(', ')}`, 400);
    }

    const agent = await createAgentDefinition(createAgentRequest);
    return {
        success: true,
        agent
    };
}

/**
 * POST:/api/chat-admin/agent-data
 *
 * This allows you to do an idempotent create or update of an agent and its tools. You can create or modify an agent
 * and/or its tools.  If you specify tools then we will intelligently create or update the tools.  If you don't
 * specify tools then we will just create the agent.
 *
 * If you use this you must provide an agentId so we can match up what's there already with what is being provided.
 * If you provide tools then you must provide a toolId for each tool so we can match up what's there already with what is being provided.
 * You may either provide agent.toolIds or tools but not both.
 */
async function handleCreateOrUpdateAgentIdempotently(event: APIGatewayProxyEventPika<AgentDataRequest>): Promise<AgentDataResponse> {
    console.log('handleCreateOrUpdateAgentIdempotently - Request body received:', JSON.stringify(event.body, null, 2));

    if (!event.body) {
        throw new BadRequestError('Request body is required');
    }

    const { agent, tools } = await createOrUpdateAgentIdempotently(event.body);

    console.log('handleCreateOrUpdateAgentIdempotently - Successfully processed:', {
        agentId: agent.agentId,
        toolCount: tools?.length ?? 0,
        toolIds: tools?.map((t) => t.toolId) ?? []
    });

    return {
        success: true,
        agent,
        tools
    };
}

/**
 * POST:/api/chat-admin/chat-app-data
 *
 * This allows you to do an idempotent create or update of a chat app. You can create or modify a chat app.
 */
async function handleCreateOrUpdateChatAppIdempotently(event: APIGatewayProxyEventPika<ChatAppDataRequest>): Promise<ChatAppDataResponse> {
    console.log('handleCreateOrUpdateChatAppIdempotently - Request body received:', JSON.stringify(event.body, null, 2));

    if (!event.body) {
        throw new BadRequestError('Request body is required');
    }

    const chatApp = await createOrUpdateChatAppIdempotently(event.body);
    return {
        success: true,
        chatApp
    };
}

/**
 * PUT:/api/chat-admin/agent/{agentId}
 */
async function handleUpdateAgent(event: APIGatewayProxyEventPika<UpdateAgentRequest>): Promise<{ success: boolean; agent: AgentDefinition }> {
    const agentId = event.pathParameters?.agentId;
    if (!agentId) {
        throw new BadRequestError('Agent ID is required');
    }

    const updateAgentRequest = event.body;
    if (!updateAgentRequest) {
        throw new BadRequestError('Request body is required');
    }

    // Ensure the agentId in the path matches the one in the body
    if (updateAgentRequest.agent.agentId !== agentId) {
        throw new HttpStatusError('Agent ID in path must match Agent ID in body', 400);
    }

    // Check if user has permission to modify this agent
    const existingAgent = await getAgentById(agentId);
    if (!existingAgent) {
        throw new HttpStatusError(`Agent ${agentId} not found`, 404);
    }

    // Validate the agent definition
    const validationErrors = validateAgentDefinition(updateAgentRequest.agent);
    if (validationErrors.length > 0) {
        throw new HttpStatusError(`Validation errors: ${validationErrors.join(', ')}`, 400);
    }

    const agent = await updateAgentDefinition(updateAgentRequest);
    return {
        success: true,
        agent
    };
}

/**
 * GET:/api/chat-admin/tool
 */
async function handleGetTools(event: APIGatewayProxyEventPika<void>): Promise<{ success: boolean; tools: ToolDefinition[] }> {
    const tools = await getTools();
    return {
        success: true,
        tools
    };
}

/**
 * GET:/api/chat-admin/tool/{toolId}
 */
async function handleGetTool(event: APIGatewayProxyEventPika<void>): Promise<{ success: boolean; tool: ToolDefinition | null }> {
    const toolId = event.pathParameters?.toolId;
    if (!toolId) {
        throw new BadRequestError('Tool ID is required');
    }

    const tool = await getTool(toolId);
    return {
        success: true,
        tool: tool || null
    };
}

/**
 * POST:/api/chat-admin/tool/search
 */
async function handleSearchTools(event: APIGatewayProxyEventPika<SearchToolsRequest>): Promise<{ success: boolean; tools: ToolDefinition[] }> {
    const requestBody = event.body;
    if (!requestBody || !requestBody.toolIds || !Array.isArray(requestBody.toolIds)) {
        throw new BadRequestError('Request body must contain a toolIds array');
    }

    const tools = await searchToolsByIds(requestBody.toolIds);
    return {
        success: true,
        tools
    };
}

/**
 * POST:/api/chat-admin/tool
 */
async function handleCreateTool(event: APIGatewayProxyEventPika<CreateToolRequest>): Promise<{ success: boolean; tool: ToolDefinition }> {
    const createToolRequest = event.body;
    if (!createToolRequest) {
        throw new BadRequestError('Request body is required');
    }

    // Validate the tool definition
    const validationErrors = validateToolDefinition(createToolRequest.tool);
    if (validationErrors.length > 0) {
        throw new HttpStatusError(`Validation errors: ${validationErrors.join(', ')}`, 400);
    }

    const tool = await createToolDefinition(createToolRequest.tool, createToolRequest.userId);
    return {
        success: true,
        tool
    };
}

/**
 * PUT:/api/chat-admin/tool
 */
async function handleUpdateTool(event: APIGatewayProxyEventPika<UpdateToolRequest>): Promise<{ success: boolean; tool: ToolDefinition }> {
    const updateToolRequest = event.body;
    if (!updateToolRequest) {
        throw new BadRequestError('Request body is required');
    }

    const toolId = updateToolRequest.tool.toolId;
    if (!toolId) {
        throw new BadRequestError('Tool ID is required in request body');
    }

    // Check if user has permission to modify this tool
    const existingTool = await getToolById(toolId);
    if (!existingTool) {
        throw new HttpStatusError(`Tool ${toolId} not found`, 404);
    }

    // Validate the tool definition
    const validationErrors = validateToolDefinition(updateToolRequest.tool);
    if (validationErrors.length > 0) {
        throw new HttpStatusError(`Validation errors: ${validationErrors.join(', ')}`, 400);
    }

    const tool = await updateToolDefinition(updateToolRequest);
    return {
        success: true,
        tool
    };
}

/**
 * GET:/api/chat-admin/chat-app
 */
async function handleGetAllChatApps(_event: APIGatewayProxyEventPika<void>): Promise<{ success: boolean; chatApps: ChatApp[] }> {
    const chatApps = await getChatApps();
    return {
        success: true,
        chatApps
    };
}

/**
 * POST:/api/chat-admin/chat-app-by-rules
 *
 * This API returns getting chat apps that a user is allowed to access.  Further, there is an optional
 * homePageFilterRules whichi if present meansfilter in the request that may be applied as the final filter specifically to designate what is and isn't to show
 * on the home page.  Note this filter may be overridden by the chat app overrides.
 */
async function handleGetChatAppByRules(event: APIGatewayProxyEventPika<GetChatAppsByRulesRequest>): Promise<GetChatAppsByRulesResponse> {
    const requestBody = event.body;
    if (!requestBody) {
        throw new BadRequestError('Request body is required');
    }

    if (!requestBody.userId) {
        throw new BadRequestError('userId is required');
    }

    // console.log('🔍 handleGetChatAppByRules called with request:', {
    //     userId: requestBody.userId,
    //     chatAppId: requestBody.chatAppId,
    //     chatAppsForHomePage: requestBody.chatAppsForHomePage,
    //     homePageFilterRules: requestBody.homePageFilterRules,
    //     customDataFieldPathToMatchUsersEntity: requestBody.customDataFieldPathToMatchUsersEntity
    // });

    let response: GetChatAppsByRulesResponse = {
        success: true,
        chatApps: []
    };

    const homePageFilterRules: UserChatAppRule[] = requestBody.homePageFilterRules ?? [];
    const chatAppsForHomePage = requestBody.chatAppsForHomePage ?? false;
    const customDataFieldPathToMatchUsersEntity = requestBody.customDataFieldPathToMatchUsersEntity;

    console.log('Looking up user:', requestBody.userId);
    const user = await getUser(requestBody.userId);
    if (!user) {
        console.error('User not found:', requestBody.userId);
        throw new HttpStatusError(`User ${requestBody.userId} not found`, 404);
    }

    console.log('User found:', {
        userId: user.userId,
        userType: user.userType,
        roles: user.roles,
        customData: user.customData,
        firstName: user.firstName,
        lastName: user.lastName
    });

    let chatApps: ChatApp[] = [];
    if (requestBody.chatAppId) {
        console.log('Looking for specific chat app:', requestBody.chatAppId);
        const chatApp = await getChatApp(requestBody.chatAppId);
        if (!chatApp) {
            console.log(`Chat App ${requestBody.chatAppId} not found, returning empty list`);
            return response;
        }
        console.log('Chat app found:', {
            chatAppId: chatApp.chatAppId,
            title: chatApp.title,
            enabled: chatApp.enabled,
            userTypes: chatApp.userTypes,
            userRoles: chatApp.userRoles,
            agentId: chatApp.agentId,
            hasOverride: !!chatApp.override
        });
        chatApps.push(chatApp);
    } else {
        console.log('Getting all chat apps');
        chatApps = await getChatApps();
        console.log(
            `Found ${chatApps.length} total chat apps:`,
            chatApps.map((app) => ({
                chatAppId: app.chatAppId,
                title: app.title,
                enabled: app.enabled,
                userTypes: app.userTypes,
                userRoles: app.userRoles,
                agentId: app.agentId,
                hasOverride: !!app.override
            }))
        );
    }

    console.log('Calling getMatchingChatApps with parameters:', {
        userInfo: {
            userId: user.userId,
            userType: user.userType,
            roles: user.roles
        },
        chatAppsForHomePage,
        homePageFilterRules,
        chatAppsCount: chatApps.length,
        customDataFieldPathToMatchUsersEntity
    });

    response.chatApps = getMatchingChatApps(user, chatAppsForHomePage, homePageFilterRules, chatApps, customDataFieldPathToMatchUsersEntity);

    console.log('Final filtered result:', {
        originalCount: chatApps.length,
        filteredCount: response.chatApps.length,
        filteredApps: response.chatApps.map((app) => ({
            chatAppId: app.chatAppId,
            title: app.title,
            enabled: app.enabled
        }))
    });

    return response;
}

/**
 * GET:/api/chat-admin/chat-app/{chatAppId}
 */
async function handleGetChatApp(event: APIGatewayProxyEventPika<void>): Promise<{ success: boolean; chatApp: ChatApp | null }> {
    const chatAppId = event.pathParameters?.chatAppId;
    if (!chatAppId) {
        throw new BadRequestError('Chat App ID is required');
    }

    const chatApp = await getChatApp(chatAppId);
    return {
        success: true,
        chatApp: chatApp || null
    };
}

/**
 * POST:/api/chat-admin/chat-app
 */
async function handleCreateChatApp(event: APIGatewayProxyEventPika<CreateChatAppRequest>): Promise<{ success: boolean; chatApp: ChatApp }> {
    const createChatAppRequest = event.body;
    if (!createChatAppRequest) {
        throw new BadRequestError('Request body is required');
    }

    // Validate the chat app definition
    const validationErrors = validateChatAppDefinition(createChatAppRequest.chatApp);
    if (validationErrors.length > 0) {
        throw new HttpStatusError(`Validation errors: ${validationErrors.join(', ')}`, 400);
    }

    const chatApp = await createChatAppDefinition(createChatAppRequest);
    return {
        success: true,
        chatApp
    };
}

/**
 * PUT:/api/chat-admin/chat-app/{chatAppId}
 */
async function handleUpdateChatApp(event: APIGatewayProxyEventPika<UpdateChatAppRequest>): Promise<{ success: boolean; chatApp: ChatApp }> {
    const chatAppId = event.pathParameters?.chatAppId;
    if (!chatAppId) {
        throw new BadRequestError('Chat App ID is required');
    }

    const updateChatAppRequest = event.body;
    if (!updateChatAppRequest) {
        throw new BadRequestError('Request body is required');
    }

    // Ensure the chatAppId in the path matches the one in the body if provided
    if (updateChatAppRequest.chatApp.chatAppId && updateChatAppRequest.chatApp.chatAppId !== chatAppId) {
        throw new HttpStatusError('Chat App ID in path must match Chat App ID in body', 400);
    }

    // Set the chatAppId from the path if not provided in body
    if (!updateChatAppRequest.chatApp.chatAppId) {
        updateChatAppRequest.chatApp.chatAppId = chatAppId;
    }

    // Validate the chat app definition
    const validationErrors = validateChatAppDefinition(updateChatAppRequest.chatApp);
    if (validationErrors.length > 0) {
        throw new HttpStatusError(`Validation errors: ${validationErrors.join(', ')}`, 400);
    }

    const chatApp = await updateChatAppDefinition(updateChatAppRequest);
    return {
        success: true,
        chatApp
    };
}

/*
 * POST:/api/chat-admin/chat-app/{chatAppId}/override
 */
async function handleCreateOrUpdateChatAppOverride(event: APIGatewayProxyEventPika<CreateOrUpdateChatAppOverrideRequest>): Promise<CreateOrUpdateChatAppOverrideResponse> {
    const chatAppId = event.pathParameters?.chatAppId;
    if (!chatAppId) {
        throw new BadRequestError('Chat App ID is required');
    }

    const updateChatAppOverrideRequest = event.body;
    if (!updateChatAppOverrideRequest) {
        throw new BadRequestError('Request body is required');
    }

    const chatAppOverride = await createOrUpdateChatAppOverride(updateChatAppOverrideRequest, chatAppId);
    return {
        success: true,
        chatAppOverride
    };
}

/*
 * DELETE:/api/chat-admin/chat-app/{chatAppId}/override
 */
async function handleDeleteChatAppOverride(event: APIGatewayProxyEventPika<DeleteChatAppOverrideRequest>): Promise<DeleteChatAppOverrideResponse> {
    const chatAppId = event.pathParameters?.chatAppId;
    if (!chatAppId) {
        throw new BadRequestError('Chat App ID is required');
    }

    await deleteChatAppOverride(chatAppId);
    return {
        success: true
    };
}

/**
 * POST:/api/chat-admin/session/feedback
 */
async function handleCreateSessionFeedback(event: APIGatewayProxyEventPika<AddChatSessionFeedbackRequest>): Promise<AddChatSessionFeedbackResponse> {
    const createSessionFeedbackRequest = event.body;
    if (!createSessionFeedbackRequest) {
        throw new BadRequestError('Request body is required');
    }

    return {
        success: true,
        feedback: await addChatSessionFeedback(createSessionFeedbackRequest.feedback)
    };
}

/**
 * PUT:/api/chat-admin/session/feedback
 */
async function handleUpdateSessionFeedback(event: APIGatewayProxyEventPika<UpdateChatSessionFeedbackRequest>): Promise<UpdateChatSessionFeedbackResponse> {
    const updateSessionFeedbackRequest = event.body;
    if (!updateSessionFeedbackRequest) {
        throw new BadRequestError('Request body is required');
    }

    return {
        success: true,
        feedback: await updateChatSessionFeedback(updateSessionFeedbackRequest.feedback)
    };
}

/**
 * POST:/api/chat-admin/session/search
 */
async function handleSearchSessions(event: APIGatewayProxyEventPika<SessionSearchRequest>): Promise<SessionSearchResponse<RecordOrUndef | undefined>> {
    const searchSessionsRequest = event.body;
    if (!searchSessionsRequest) {
        throw new BadRequestError('Request body is required');
    }

    // Log a concise summary of the incoming search request for diagnostics
    try {
        console.log(
            'sessionSearch: request summary',
            JSON.stringify(
                {
                    size: searchSessionsRequest.size ?? 'default',
                    sortBy: searchSessionsRequest.sortBy,
                    hasScrollId: !!searchSessionsRequest.scrollId,
                    hasDateFilter: !!searchSessionsRequest.dateFilter,
                    dateFilter: searchSessionsRequest.dateFilter,
                    flagged: (searchSessionsRequest as any).flagged,
                    insightsPresent: !!(searchSessionsRequest as any).insights,
                    insightsKeys: (searchSessionsRequest as any).insights ? Object.keys((searchSessionsRequest as any).insights) : undefined,
                    feedbackSelectedKeys: [
                        'feedbackReportedByHuman',
                        'feedbackCreatedByCustomer',
                        'feedbackUserId',
                        'feedbackInStatus',
                        'feedbackSeverity',
                        'feedbackType',
                        'feedbackInternalCommentUserId',
                        'feedbackInternalCommentType',
                        'feedbackInternalCommentStatus'
                    ].filter((k) => (searchSessionsRequest as any)[k] !== undefined)
                },
                null,
                2
            )
        );
    } catch (e) {
        console.warn('sessionSearch: failed to log request summary', e);
    }

    return await searchForSessions(searchSessionsRequest);
}

/**
 * POST:/api/chat-admin/tagdef
 */
async function handleCreateOrUpdateTagDef(event: APIGatewayProxyEventPika<TagDefinitionCreateOrUpdateRequest>): Promise<TagDefinitionCreateOrUpdateResponse> {
    const request = event.body;
    if (!request) {
        throw new BadRequestError('Request body is required');
    }

    if (!request.tagDefinition) {
        throw new BadRequestError('Tag definition is required');
    }

    if (!request.userId) {
        throw new BadRequestError('User ID is required');
    }

    return await createOrUpdateTagDefApi(request);
}

/**
 * DELETE:/api/chat-admin/tagdef
 */
async function handleDeleteTagDef(event: APIGatewayProxyEventPika<TagDefinitionDeleteRequest>): Promise<TagDefinitionDeleteResponse> {
    const request = event.body;
    if (!request) {
        throw new BadRequestError('Request body is required');
    }

    if (!request.tagDefinition) {
        throw new BadRequestError('Tag definition identifier is required');
    }

    if (!request.tagDefinition.scope) {
        throw new BadRequestError('Tag definition scope is required');
    }

    if (!request.tagDefinition.tag) {
        throw new BadRequestError('Tag definition tag is required');
    }

    return await deleteTagDefApi(request);
}

/**
 * POST:/api/chat-admin/tagdef/search
 */
async function handleGetTagDefs(event: APIGatewayProxyEventPika<TagDefinitionSearchRequest>): Promise<TagDefinitionSearchResponse> {
    const request = event.body || {};
    return await searchTagDefsApi(request);
}

/**
 * POST:/api/chat-admin/semantic-directive
 */
async function handleCreateOrUpdateSemanticDirective(event: APIGatewayProxyEventPika<SemanticDirectiveCreateOrUpdateRequest>): Promise<SemanticDirectiveCreateOrUpdateResponse> {
    const request = event.body;
    if (!request) {
        throw new BadRequestError('Request body is required');
    }

    if (!request.semanticDirective) {
        throw new BadRequestError('Semantic directive is required');
    }

    if (!request.userId) {
        throw new BadRequestError('User ID is required');
    }

    return await createOrUpdateSemanticDirectiveApi(request);
}

/**
 * DELETE:/api/chat-admin/semantic-directive
 */
async function handleDeleteSemanticDirective(event: APIGatewayProxyEventPika<SemanticDirectiveDeleteRequest>): Promise<SemanticDirectiveDeleteResponse> {
    const request = event.body;
    if (!request) {
        throw new BadRequestError('Request body is required');
    }

    if (!request.semanticDirective) {
        throw new BadRequestError('Semantic directive identifier is required');
    }

    if (!request.semanticDirective.scope) {
        throw new BadRequestError('Semantic directive scope is required');
    }

    if (!request.semanticDirective.id) {
        throw new BadRequestError('Semantic directive id is required');
    }

    return await deleteSemanticDirectiveApi(request);
}

/**
 * POST:/api/chat-admin/semantic-directive/search
 */
async function handleSearchSemanticDirectives(event: APIGatewayProxyEventPika<SearchSemanticDirectivesRequest>): Promise<SearchSemanticDirectivesResponse> {
    const request = event.body || {};
    return await searchSemanticDirectivesApi(request);
}

/**
 * POST:/api/chat-admin/memory/record/search
 *
 * Returns all memory records for a user for a given strategy, paged.
 */
async function handleSearchAllMemoryRecords(event: APIGatewayProxyEventPika<SearchAllMemoryRecordsRequest>): Promise<SearchAllMemoryRecordsResponse> {
    const requestBody = event.body;
    if (!requestBody) {
        throw new BadRequestError('Request body is required');
    }

    if (!requestBody.userId) {
        throw new BadRequestError('userId is required');
    }

    if (!requestBody.strategy) {
        throw new BadRequestError('strategy is required');
    }

    if (!UserMemoryStrategies.includes(requestBody.strategy)) {
        throw new BadRequestError(`Invalid strategy: ${requestBody.strategy}`);
    }

    let response: SearchAllMemoryRecordsResponse = {
        success: true,
        results: {
            records: [],
            nextToken: undefined
        }
    };

    console.log('Looking up user:', requestBody.userId);
    const user = await getUser(requestBody.userId);
    if (!user) {
        console.error('User not found:', requestBody.userId);
        throw new HttpStatusError(`User ${requestBody.userId} not found`, 404);
    }

    response.results = await getAllMemoryRecords(requestBody.userId, getMemoryId(), requestBody.strategy, requestBody.nextToken);

    return response;
}

/**
 * POST:/api/chat-admin/memory/instructions
 *
 * Returns all memory records for a user for a given strategy, paged.
 */
async function handleGetInstructionsAddedForUserMemory(
    event: APIGatewayProxyEventPika<GetInstructionsAddedForUserMemoryRequest>
): Promise<GetInstructionsAddedForUserMemoryResponse> {
    const requestBody = event.body;
    if (!requestBody) {
        throw new BadRequestError('Request body is required');
    }

    if (!requestBody.userId) {
        throw new BadRequestError('userId is required');
    }

    if (!requestBody.prompt) {
        throw new BadRequestError('prompt is required');
    }

    if (!requestBody.strategies) {
        throw new BadRequestError('strategies is required');
    }

    if (!requestBody.strategies.every((strategy) => UserMemoryStrategies.includes(strategy))) {
        throw new BadRequestError(`Invalid strategy found in strategies: ${requestBody.strategies}`);
    }

    if (!requestBody.maxMemoryRecordsPerPrompt) {
        throw new BadRequestError('maxMemoryRecordsPerPrompt is required');
    }

    if (!requestBody.maxKMatchesPerStrategy) {
        throw new BadRequestError('maxKMatchesPerStrategy is required');
    }

    const userMemoryFeature: UserMemoryFeatureWithMemoryInfo = {
        enabled: true,
        strategies: requestBody.strategies,
        maxMemoryRecordsPerPrompt: requestBody.maxMemoryRecordsPerPrompt,
        maxKMatchesPerStrategy: requestBody.maxKMatchesPerStrategy,
        memoryId: getMemoryId()
    };

    let response: GetInstructionsAddedForUserMemoryResponse = {
        success: true,
        instructions: ''
    };

    console.log('Looking up user:', requestBody.userId);
    const user = await getUser(requestBody.userId);
    if (!user) {
        console.error('User not found:', requestBody.userId);
        throw new HttpStatusError(`User ${requestBody.userId} not found`, 404);
    }

    response.instructions = await getMemoryInstructions(user, userMemoryFeature, requestBody.prompt, requestBody.maxKMatchesPerStrategy);

    return response;
}

// ===== MOCK DATA APIS FOR TESTING =====

/**
 * POST:/api/chat-admin/session/mock
 */
async function handleCreateOrUpdateMockSession(event: APIGatewayProxyEventPika<CreateOrUpdateMockSessionRequest>): Promise<CreateOrUpdateMockSessionResponse> {
    const request = event.body;
    if (!request) {
        throw new HttpStatusError('Request body is required', 400);
    }

    if (!request.session) {
        throw new HttpStatusError('Session data is required', 400);
    }

    if (!request.userId) {
        throw new HttpStatusError('User ID is required', 400);
    }

    // Ensure test is set to true
    request.session.testType = 'mock';

    console.log('Creating mock session:', {
        userId: request.session.userId,
        chatAppId: request.session.chatAppId,
        agentId: request.session.agentId,
        adminUserId: request.userId
    });

    const session = await createChatSession(request.session);

    return {
        success: true,
        session
    };
}

/**
 * DELETE:/api/chat-admin/session/mock
 */
async function handleDeleteMockSession(event: APIGatewayProxyEventPika<DeleteMockSessionRequest>): Promise<DeleteMockSessionResponse> {
    const request = event.body;
    if (!request) {
        throw new HttpStatusError('Request body is required', 400);
    }

    if (!request.sessionId) {
        throw new HttpStatusError('Session ID is required', 400);
    }

    if (!request.sessionUserId) {
        throw new HttpStatusError('Session user ID is required', 400);
    }

    if (!request.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting mock session:', {
        sessionId: request.sessionId,
        sessionUserId: request.sessionUserId,
        adminUserId: request.userId
    });

    // Verify the session exists and is a test session
    const session = await getChatSessionByUserIdAndSessionId(request.sessionUserId, request.sessionId);
    if (!session) {
        throw new HttpStatusError('Session not found', 404);
    }

    if (session.testType !== 'mock') {
        throw new HttpStatusError('Can only delete test sessions', 400);
    }

    // TODO: Implement delete session functionality
    throw new HttpStatusError('Delete session not yet implemented', 501);

    return {
        success: true
    };
}

/**
 * POST:/api/chat-admin/agent/mock
 */
async function handleCreateOrUpdateMockAgent(event: APIGatewayProxyEventPika<CreateOrUpdateMockAgentRequest>): Promise<CreateOrUpdateMockAgentResponse> {
    const request = event.body;
    if (!request) {
        throw new HttpStatusError('Request body is required', 400);
    }

    if (!request.agent) {
        throw new HttpStatusError('Agent data is required', 400);
    }

    if (!request.userId) {
        throw new HttpStatusError('User ID is required', 400);
    }

    // Ensure test flag is set
    request.agent.testType = 'mock';
    request.agent.createdAt = new Date().toISOString();
    request.agent.updatedAt = new Date().toISOString();
    request.agent.createdBy = request.userId;
    request.agent.lastModifiedBy = request.userId;
    request.agent.version = 1;

    console.log('Creating mock agent:', {
        agentId: request.agent.agentId,
        basePrompt: request.agent.basePrompt?.substring(0, 50) + '...',
        adminUserId: request.userId
    });

    const agent = await createAgent(request.agent);

    return {
        success: true,
        agent
    };
}

/**
 * DELETE:/api/chat-admin/agent/mock
 */
async function handleDeleteMockAgent(event: APIGatewayProxyEventPika<DeleteMockAgentRequest>): Promise<DeleteMockAgentResponse> {
    const request = event.body;
    if (!request) {
        throw new HttpStatusError('Request body is required', 400);
    }

    if (!request.agentId) {
        throw new HttpStatusError('Agent ID is required', 400);
    }

    if (!request.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting mock agent:', {
        agentId: request.agentId,
        adminUserId: request.userId
    });

    await deleteMockAgent(request.agentId);

    return {
        success: true
    };
}

/**
 * POST:/api/chat-admin/tool/mock
 */
async function handleCreateOrUpdateMockTool(event: APIGatewayProxyEventPika<CreateOrUpdateMockToolRequest>): Promise<CreateOrUpdateMockToolResponse> {
    const request = event.body;
    if (!request) {
        throw new HttpStatusError('Request body is required', 400);
    }

    if (!request.tool) {
        throw new HttpStatusError('Tool data is required', 400);
    }

    if (!request.userId) {
        throw new HttpStatusError('User ID is required', 400);
    }

    // Ensure test flag is set
    request.tool.testType = 'mock';
    request.tool.createdAt = new Date().toISOString();
    request.tool.updatedAt = new Date().toISOString();
    request.tool.createdBy = request.userId;
    request.tool.lastModifiedBy = request.userId;
    request.tool.version = 1;

    console.log('Creating mock tool:', {
        toolId: request.tool.toolId,
        name: request.tool.name,
        adminUserId: request.userId
    });

    const tool = await createTool(request.tool);

    return {
        success: true,
        tool
    };
}

/**
 * DELETE:/api/chat-admin/tool/mock
 */
async function handleDeleteMockTool(event: APIGatewayProxyEventPika<DeleteMockToolRequest>): Promise<DeleteMockToolResponse> {
    const request = event.body;
    if (!request) {
        throw new HttpStatusError('Request body is required', 400);
    }

    if (!request.toolId) {
        throw new HttpStatusError('Tool ID is required', 400);
    }

    if (!request.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting mock tool:', {
        toolId: request.toolId,
        adminUserId: request.userId
    });

    await deleteMockTool(request.toolId);

    return {
        success: true
    };
}

/**
 * POST:/api/chat-admin/chat-app/mock
 */
async function handleCreateOrUpdateMockChatApp(event: APIGatewayProxyEventPika<CreateOrUpdateMockChatAppRequest>): Promise<CreateOrUpdateMockChatAppResponse> {
    const request = event.body;
    if (!request) {
        throw new HttpStatusError('Request body is required', 400);
    }

    if (!request.chatApp) {
        throw new HttpStatusError('Chat app data is required', 400);
    }

    if (!request.userId) {
        throw new HttpStatusError('User ID is required', 400);
    }

    // Ensure test flag is set
    request.chatApp.testType = 'mock';
    request.chatApp.createDate = new Date().toISOString();
    request.chatApp.lastUpdate = new Date().toISOString();

    console.log('Creating mock chat app:', {
        chatAppId: request.chatApp.chatAppId,
        title: request.chatApp.title,
        adminUserId: request.userId
    });

    const chatApp = await createChatAppDdb(request.chatApp);

    return {
        success: true,
        chatApp
    };
}

/**
 * DELETE:/api/chat-admin/chat-app/mock
 */
async function handleDeleteMockChatApp(event: APIGatewayProxyEventPika<DeleteMockChatAppRequest>): Promise<DeleteMockChatAppResponse> {
    const request = event.body;
    if (!request) {
        throw new HttpStatusError('Request body is required', 400);
    }

    if (!request.chatAppId) {
        throw new HttpStatusError('Chat app ID is required', 400);
    }

    if (!request.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting mock chat app:', {
        chatAppId: request.chatAppId,
        adminUserId: request.userId
    });

    // Verify the chat app exists and is a test chat app
    const chatApp = await getChatApp(request.chatAppId);
    if (!chatApp) {
        throw new HttpStatusError('Chat app not found', 404);
    }

    if (chatApp.testType !== 'mock') {
        throw new HttpStatusError('Can only delete test chat apps', 400);
    }

    await deleteMockChatApp(request.chatAppId);

    return {
        success: true
    };
}

/**
 * POST:/api/chat-admin/user/mock
 */
async function handleCreateOrUpdateMockUser(event: APIGatewayProxyEventPika<CreateOrUpdateMockUserRequest>): Promise<CreateOrUpdateMockUserResponse> {
    const request = event.body;
    if (!request) {
        throw new HttpStatusError('Request body is required', 400);
    }

    if (!request.user) {
        throw new HttpStatusError('User data is required', 400);
    }

    if (!request.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    // Ensure test flag is set
    request.user.testType = 'mock';

    console.log('Creating mock user:', {
        userId: request.user.userId,
        firstName: request.user.firstName,
        lastName: request.user.lastName,
        adminUserId: request.userId
    });

    const user = await addUser(request.user);

    return {
        success: true,
        user
    };
}

/**
 * DELETE:/api/chat-admin/user/mock
 */
async function handleDeleteMockUser(event: APIGatewayProxyEventPika<DeleteMockUserRequest>): Promise<DeleteMockUserResponse> {
    const request = event.body;
    if (!request) {
        throw new HttpStatusError('Request body is required', 400);
    }

    if (!request.mockUserId) {
        throw new HttpStatusError('Mock user ID is required', 400);
    }

    if (!request.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting mock user:', {
        mockUserId: request.mockUserId,
        adminUserId: request.userId
    });

    await deleteMockUser(request.mockUserId);

    return {
        success: true
    };
}

/**
 * DELETE:/api/chat-admin/mock
 */
async function handleDeleteMock(event: APIGatewayProxyEventPika<DeleteMockDataRequest>): Promise<DeleteMockDataResponse> {
    const request = event.body;
    if (!request) {
        throw new HttpStatusError('Request body is required', 400);
    }

    if (!request.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting mock data:', {
        userId: request.userId
    });

    if (request.sessions) {
        for (const session of request.sessions) {
            await deleteMockSession(session.sessionId, session.sessionUserId);
        }
    }

    if (request.chatApps) {
        for (const chatApp of request.chatApps) {
            await deleteMockChatApp(chatApp.chatAppId);
        }
    }

    if (request.agents) {
        for (const agent of request.agents) {
            await deleteMockAgent(agent.agentId);
        }
    }

    if (request.tools) {
        for (const tool of request.tools) {
            await deleteMockTool(tool.toolId);
        }
    }

    if (request.users) {
        for (const user of request.users) {
            await deleteMockUser(user.userId);
        }
    }

    return {
        success: true
    };
}

// ===== GET ALL MOCK DATA HANDLERS =====

/**
 * GET:/api/chat-admin/session/mock/all
 */
async function handleGetAllMockSessions(event: APIGatewayProxyEventPika<void>): Promise<GetAllMockSessionsResponse> {
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 20;
    const nextToken = event.queryStringParameters?.nextToken;

    const result = await getMockTestChatSessions(limit, nextToken);

    return {
        success: true,
        chatSessions: result.chatSessions,
        nextToken: result.nextToken
    };
}

/**
 * GET:/api/chat-admin/session/mock/{sessionId}/user/{userId}
 */
async function handleGetMockSessionByUserIdAndSessionId(event: APIGatewayProxyEventPika<void>): Promise<GetMockSessionByUserIdAndSessionIdResponse> {
    const sessionId = event.pathParameters?.sessionId;
    const userId = event.pathParameters?.userId;

    if (!sessionId) {
        throw new HttpStatusError('Session ID is required', 400);
    }

    if (!userId) {
        throw new HttpStatusError('User ID is required', 400);
    }

    const chatSession = await getChatSessionByUserIdAndSessionId(userId, sessionId);

    if (chatSession && chatSession.testType !== 'mock') {
        throw new HttpStatusError('Session is not a mock session', 400);
    }

    return {
        success: true,
        chatSession
    };
}

/**
 * GET:/api/chat-admin/user/mock/all
 */
async function handleGetAllMockUsers(event: APIGatewayProxyEventPika<void>): Promise<GetAllMockUsersResponse> {
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 20;
    const nextToken = event.queryStringParameters?.nextToken;

    const result = await getMockTestChatUsers(limit, nextToken);

    return {
        success: true,
        chatUsers: result.chatUsers,
        nextToken: result.nextToken
    };
}

/**
 * GET:/api/chat-admin/agent/mock/all
 */
async function handleGetAllMockAgents(event: APIGatewayProxyEventPika<void>): Promise<GetAllMockAgentsResponse> {
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 20;
    const nextToken = event.queryStringParameters?.nextToken;

    const result = await getMockTestAgents(limit, nextToken);

    return {
        success: true,
        agents: result.agents,
        nextToken: result.nextToken
    };
}

/**
 * GET:/api/chat-admin/tool/mock/all
 */
async function handleGetAllMockTools(event: APIGatewayProxyEventPika<void>): Promise<GetAllMockToolsResponse> {
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 20;
    const nextToken = event.queryStringParameters?.nextToken;

    const result = await getMockTestTools(limit, nextToken);

    return {
        success: true,
        tools: result.tools,
        nextToken: result.nextToken
    };
}

/**
 * GET:/api/chat-admin/chat-app/mock/all
 */
async function handleGetAllMockChatApps(event: APIGatewayProxyEventPika<void>): Promise<GetAllMockChatAppsResponse> {
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 20;
    const nextToken = event.queryStringParameters?.nextToken;

    const result = await getMockTestChatApps(limit, nextToken);

    return {
        success: true,
        chatApps: result.chatApps,
        nextToken: result.nextToken
    };
}

/**
 * GET:/api/chat-admin/shared-session-visit/mock/all
 */
async function handleGetAllMockSharedSessionVisits(event: APIGatewayProxyEventPika<void>): Promise<GetAllMockSharedSessionVisitsResponse> {
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 20;
    const nextToken = event.queryStringParameters?.nextToken;

    const result = await getMockTestSharedSessionVisits(limit, nextToken);

    return {
        success: true,
        sharedSessionVisits: result.sharedSessionVisits,
        nextToken: result.nextToken
    };
}

/**
 * GET:/api/chat-admin/pinned-session/mock/all
 */
async function handleGetAllMockPinnedSessions(event: APIGatewayProxyEventPika<void>): Promise<GetAllMockPinnedSessionsResponse> {
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 20;
    const nextToken = event.queryStringParameters?.nextToken;

    const result = await getMockTestPinnedSessions(limit, nextToken);

    return {
        success: true,
        pinnedSessions: result.pinnedSessions,
        nextToken: result.nextToken
    };
}

// ===== DELETE ALL MOCK DATA HANDLERS =====

/**
 * DELETE:/api/chat-admin/session/mock/all
 */
async function handleDeleteAllMockSessions(event: APIGatewayProxyEventPika<DeleteAllMockSessionsRequest>): Promise<DeleteAllMockSessionsResponse> {
    const request = event.body;
    if (!request?.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting all mock sessions:', {
        adminUserId: request.userId
    });

    const deletedCount = await deleteAllMockTestChatSessions();

    return {
        success: true,
        deletedCount
    };
}

/**
 * DELETE:/api/chat-admin/user/mock/all
 */
async function handleDeleteAllMockUsers(event: APIGatewayProxyEventPika<DeleteAllMockUsersRequest>): Promise<DeleteAllMockUsersResponse> {
    const request = event.body;
    if (!request?.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting all mock users:', {
        adminUserId: request.userId
    });

    const deletedCount = await deleteAllMockTestChatUsers();

    return {
        success: true,
        deletedCount
    };
}

/**
 * DELETE:/api/chat-admin/agent/mock/all
 */
async function handleDeleteAllMockAgents(event: APIGatewayProxyEventPika<DeleteAllMockAgentsRequest>): Promise<DeleteAllMockAgentsResponse> {
    const request = event.body;
    if (!request?.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting all mock agents:', {
        adminUserId: request.userId
    });

    const deletedCount = await deleteAllMockTestAgents();

    return {
        success: true,
        deletedCount
    };
}

/**
 * DELETE:/api/chat-admin/tool/mock/all
 */
async function handleDeleteAllMockTools(event: APIGatewayProxyEventPika<DeleteAllMockToolsRequest>): Promise<DeleteAllMockToolsResponse> {
    const request = event.body;
    if (!request?.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting all mock tools:', {
        adminUserId: request.userId
    });

    const deletedCount = await deleteAllMockTestTools();

    return {
        success: true,
        deletedCount
    };
}

/**
 * DELETE:/api/chat-admin/chat-app/mock/all
 */
async function handleDeleteAllMockChatApps(event: APIGatewayProxyEventPika<DeleteAllMockChatAppsRequest>): Promise<DeleteAllMockChatAppsResponse> {
    const request = event.body;
    if (!request?.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting all mock chat apps:', {
        adminUserId: request.userId
    });

    const deletedCount = await deleteAllMockTestChatApps();

    return {
        success: true,
        deletedCount
    };
}

/**
 * DELETE:/api/chat-admin/shared-session-visit/mock/all
 */
async function handleDeleteAllMockSharedSessionVisits(event: APIGatewayProxyEventPika<DeleteAllMockSharedSessionVisitsRequest>): Promise<DeleteAllMockSharedSessionVisitsResponse> {
    const request = event.body;
    if (!request?.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting all mock shared session visits:', {
        adminUserId: request.userId
    });

    const deletedCount = await deleteAllMockTestSharedSessionVisits();

    return {
        success: true,
        deletedCount
    };
}

/**
 * DELETE:/api/chat-admin/pinned-session/mock/all
 */
async function handleDeleteAllMockPinnedSessions(event: APIGatewayProxyEventPika<DeleteAllMockPinnedSessionsRequest>): Promise<DeleteAllMockPinnedSessionsResponse> {
    const request = event.body;
    if (!request?.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    console.log('Deleting all mock pinned sessions:', {
        adminUserId: request.userId
    });

    const deletedCount = await deleteAllMockTestPinnedSessions();

    return {
        success: true,
        deletedCount
    };
}

// ===== BULK OPERATIONS =====

/**
 * GET:/api/chat-admin/mock/bulk
 */
async function handleGetAllMockData(event: APIGatewayProxyEventPika<void>): Promise<GetAllMockDataResponse> {
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 10;

    console.log('Getting all mock data with limit:', limit);

    // Get all mock data in parallel
    const [sessionsResult, usersResult, agentsResult, toolsResult, chatAppsResult, sharedSessionVisitsResult, pinnedSessionsResult] = await Promise.all([
        getMockTestChatSessions(limit),
        getMockTestChatUsers(limit),
        getMockTestAgents(limit),
        getMockTestTools(limit),
        getMockTestChatApps(limit),
        getMockTestSharedSessionVisits(limit),
        getMockTestPinnedSessions(limit)
    ]);

    return {
        success: true,
        data: {
            sessions: sessionsResult.chatSessions,
            users: usersResult.chatUsers,
            agents: agentsResult.agents,
            tools: toolsResult.tools,
            chatApps: chatAppsResult.chatApps,
            sharedSessionVisits: sharedSessionVisitsResult.sharedSessionVisits,
            pinnedSessions: pinnedSessionsResult.pinnedSessions
        }
    };
}

/**
 * DELETE:/api/chat-admin/mock/bulk
 */
async function handleDeleteAllMockData(event: APIGatewayProxyEventPika<DeleteAllMockDataRequest>): Promise<DeleteAllMockDataResponse> {
    const request = event.body;
    if (!request?.userId) {
        throw new HttpStatusError('Admin user ID is required', 400);
    }

    if (!request.confirm) {
        throw new HttpStatusError('Confirmation required: set confirm=true to proceed', 400);
    }

    console.log('Deleting ALL mock data:', {
        adminUserId: request.userId
    });

    // Delete all mock data in parallel
    const [sessionsDeleted, usersDeleted, agentsDeleted, toolsDeleted, chatAppsDeleted, sharedSessionVisitsDeleted, pinnedSessionsDeleted] = await Promise.all([
        deleteAllMockTestChatSessions(),
        deleteAllMockTestChatUsers(),
        deleteAllMockTestAgents(),
        deleteAllMockTestTools(),
        deleteAllMockTestChatApps(),
        deleteAllMockTestSharedSessionVisits(),
        deleteAllMockTestPinnedSessions()
    ]);

    const totalDeleted = sessionsDeleted + usersDeleted + agentsDeleted + toolsDeleted + chatAppsDeleted + sharedSessionVisitsDeleted + pinnedSessionsDeleted;

    console.log('Bulk delete completed:', {
        sessions: sessionsDeleted,
        users: usersDeleted,
        agents: agentsDeleted,
        tools: toolsDeleted,
        chatApps: chatAppsDeleted,
        sharedSessionVisits: sharedSessionVisitsDeleted,
        pinnedSessions: pinnedSessionsDeleted,
        total: totalDeleted
    });

    return {
        success: true,
        deletedCounts: {
            sessions: sessionsDeleted,
            users: usersDeleted,
            agents: agentsDeleted,
            tools: toolsDeleted,
            chatApps: chatAppsDeleted,
            sharedSessionVisits: sharedSessionVisitsDeleted,
            pinnedSessions: pinnedSessionsDeleted,
            total: totalDeleted
        }
    };
}

export const handler = apiGatewayFunctionDecorator(handlerFn);
