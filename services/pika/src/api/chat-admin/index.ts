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
    CreateToolRequest,
    DeleteChatAppOverrideRequest,
    DeleteChatAppOverrideResponse,
    GetChatAppsByRulesRequest,
    GetChatAppsByRulesResponse,
    RecordOrUndef,
    SearchToolsRequest,
    SessionSearchRequest,
    SessionSearchResponse,
    TagDefinitionCreateOrUpdateRequest,
    TagDefinitionCreateOrUpdateResponse,
    TagDefinitionDeleteRequest,
    TagDefinitionDeleteResponse,
    TagDefinitionSearchRequest,
    TagDefinitionSearchResponse,
    SemanticDirectiveCreateOrUpdateRequest,
    SemanticDirectiveCreateOrUpdateResponse,
    SemanticDirectiveDeleteRequest,
    SemanticDirectiveDeleteResponse,
    SearchSemanticDirectivesRequest,
    SearchSemanticDirectivesResponse,
    ToolDefinition,
    UpdateAgentRequest,
    UpdateChatAppRequest,
    UpdateChatSessionFeedbackRequest,
    UpdateChatSessionFeedbackResponse,
    UpdateToolRequest,
    UserChatAppRule
} from 'pika-shared/types/chatbot/chatbot-types';
import { apiGatewayFunctionDecorator, APIGatewayProxyEventPika } from 'pika-shared/util/api-gateway-utils';

import { HttpStatusError } from 'pika-shared/util/http-status-error';
import {
    addChatSessionFeedback,
    createAgentDefinition,
    createChatAppDefinition,
    createOrUpdateAgentIdempotently,
    createOrUpdateChatAppIdempotently,
    createOrUpdateChatAppOverride,
    createOrUpdateTagDefApi,
    createOrUpdateSemanticDirectiveApi,
    createToolDefinition,
    deleteChatAppOverride,
    deleteTagDefApi,
    deleteSemanticDirectiveApi,
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
import { getAgentById, getToolById } from '../../lib/chat-admin-ddb';
import { getUser } from '../../lib/chat-apis';
import { getMatchingChatApps } from '../../lib/get-matching-chat-apps';

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
        throw new Error('Agent ID is required');
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
        throw new Error('Request body is required');
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
    try {
        console.log('handleCreateOrUpdateAgentIdempotently - Request body received:', JSON.stringify(event.body, null, 2));

        if (!event.body) {
            throw new HttpStatusError('Request body is required', 400);
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
    } catch (error) {
        console.error('handleCreateOrUpdateAgentIdempotently - Error occurred:', error);
        console.error('Error details:', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined,
            statusCode: error instanceof HttpStatusError ? error.statusCode : undefined
        });

        // Re-throw the error so the decorator can handle it properly
        throw error;
    }
}

/**
 * POST:/api/chat-admin/chat-app-data
 *
 * This allows you to do an idempotent create or update of a chat app. You can create or modify a chat app.
 */
async function handleCreateOrUpdateChatAppIdempotently(event: APIGatewayProxyEventPika<ChatAppDataRequest>): Promise<ChatAppDataResponse> {
    try {
        console.log('handleCreateOrUpdateChatAppIdempotently - Request body received:', JSON.stringify(event.body, null, 2));

        if (!event.body) {
            throw new HttpStatusError('Request body is required', 400);
        }

        const chatApp = await createOrUpdateChatAppIdempotently(event.body);
        return {
            success: true,
            chatApp
        };
    } catch (error) {
        console.error('handleCreateOrUpdateChatAppIdempotently - Error occurred:', error);
        console.error('Error details:', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined,
            statusCode: error instanceof HttpStatusError ? error.statusCode : undefined
        });

        // Re-throw the error so the decorator can handle it properly
        throw error;
    }
}

/**
 * PUT:/api/chat-admin/agent/{agentId}
 */
async function handleUpdateAgent(event: APIGatewayProxyEventPika<UpdateAgentRequest>): Promise<{ success: boolean; agent: AgentDefinition }> {
    const agentId = event.pathParameters?.agentId;
    if (!agentId) {
        throw new Error('Agent ID is required');
    }

    const updateAgentRequest = event.body;
    if (!updateAgentRequest) {
        throw new Error('Request body is required');
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
        throw new Error('Tool ID is required');
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
        throw new Error('Request body must contain a toolIds array');
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
        throw new Error('Request body is required');
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
        throw new Error('Request body is required');
    }

    const toolId = updateToolRequest.tool.toolId;
    if (!toolId) {
        throw new Error('Tool ID is required in request body');
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
        throw new Error('Request body is required');
    }

    if (!requestBody.userId) {
        throw new Error('userId is required');
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

    console.log('👤 Looking up user:', requestBody.userId);
    const user = await getUser(requestBody.userId);
    if (!user) {
        console.error('❌ User not found:', requestBody.userId);
        throw new HttpStatusError(`User ${requestBody.userId} not found`, 404);
    }

    console.log('✅ User found:', {
        userId: user.userId,
        userType: user.userType,
        roles: user.roles,
        customData: user.customData,
        firstName: user.firstName,
        lastName: user.lastName
    });

    let chatApps: ChatApp[] = [];
    if (requestBody.chatAppId) {
        console.log('🎯 Looking for specific chat app:', requestBody.chatAppId);
        const chatApp = await getChatApp(requestBody.chatAppId);
        if (!chatApp) {
            console.log(`❌ Chat App ${requestBody.chatAppId} not found, returning empty list`);
            return response;
        }
        console.log('✅ Chat app found:', {
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
        console.log('📋 Getting all chat apps');
        chatApps = await getChatApps();
        console.log(
            `✅ Found ${chatApps.length} total chat apps:`,
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

    console.log('✅ Final filtered result:', {
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
        throw new Error('Chat App ID is required');
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
        throw new Error('Request body is required');
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
        throw new Error('Chat App ID is required');
    }

    const updateChatAppRequest = event.body;
    if (!updateChatAppRequest) {
        throw new Error('Request body is required');
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
        throw new Error('Chat App ID is required');
    }

    const updateChatAppOverrideRequest = event.body;
    if (!updateChatAppOverrideRequest) {
        throw new Error('Request body is required');
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
        throw new Error('Chat App ID is required');
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
        throw new Error('Request body is required');
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
        throw new Error('Request body is required');
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
        throw new Error('Request body is required');
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
        throw new Error('Request body is required');
    }

    if (!request.tagDefinition) {
        throw new Error('Tag definition is required');
    }

    if (!request.userId) {
        throw new Error('User ID is required');
    }

    return await createOrUpdateTagDefApi(request);
}

/**
 * DELETE:/api/chat-admin/tagdef
 */
async function handleDeleteTagDef(event: APIGatewayProxyEventPika<TagDefinitionDeleteRequest>): Promise<TagDefinitionDeleteResponse> {
    const request = event.body;
    if (!request) {
        throw new Error('Request body is required');
    }

    if (!request.tagDefinition) {
        throw new Error('Tag definition identifier is required');
    }

    if (!request.tagDefinition.scope) {
        throw new Error('Tag definition scope is required');
    }

    if (!request.tagDefinition.tag) {
        throw new Error('Tag definition tag is required');
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
        throw new Error('Request body is required');
    }

    if (!request.semanticDirective) {
        throw new Error('Semantic directive is required');
    }

    if (!request.userId) {
        throw new Error('User ID is required');
    }

    return await createOrUpdateSemanticDirectiveApi(request);
}

/**
 * DELETE:/api/chat-admin/semantic-directive
 */
async function handleDeleteSemanticDirective(event: APIGatewayProxyEventPika<SemanticDirectiveDeleteRequest>): Promise<SemanticDirectiveDeleteResponse> {
    const request = event.body;
    if (!request) {
        throw new Error('Request body is required');
    }

    if (!request.semanticDirective) {
        throw new Error('Semantic directive identifier is required');
    }

    if (!request.semanticDirective.scope) {
        throw new Error('Semantic directive scope is required');
    }

    if (!request.semanticDirective.id) {
        throw new Error('Semantic directive id is required');
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

export const handler = apiGatewayFunctionDecorator(handlerFn);
