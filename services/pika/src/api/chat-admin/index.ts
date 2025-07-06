import {
    AgentDataRequest,
    AgentDataResponse,
    AgentDefinition,
    BaseRequestData,
    ChatApp,
    ChatAppDataRequest,
    ChatAppDataResponse,
    CreateAgentRequest,
    CreateChatAppRequest,
    CreateToolRequest,
    GetChatAppsByRulesRequest,
    GetChatAppsByRulesResponse,
    SearchToolsRequest,
    ToolDefinition,
    UpdateAgentRequest,
    UpdateChatAppRequest,
    UpdateToolRequest,
    UserChatAppRule,
    UserType
} from '@pika/shared/types/chatbot/chatbot-types';
import { apiGatewayFunctionDecorator, APIGatewayProxyEventPika } from '@pika/shared/util/api-gateway-utils';

import { HttpStatusError } from '@pika/shared/util/http-status-error';
import { getUser } from '../../lib/chat-apis';
import {
    createAgentDefinition,
    createChatAppDefinition,
    createOrUpdateAgentIdempotently,
    createOrUpdateChatAppIdempotently,
    createToolDefinition,
    getAgent,
    getAgents,
    getChatApp,
    getChatApps,
    getTool,
    getTools,
    searchToolsByIds,
    updateAgentDefinition,
    updateChatAppDefinition,
    updateToolDefinition,
    validateAgentDefinition,
    validateChatAppDefinition,
    validateToolDefinition
} from '../../lib/chat-admin-apis';
import { getAgentById, getToolById } from '../../lib/chat-admin-ddb';
import { getMatchingChatApps } from '../../lib/get-matching-chat-apps';

type userIdFnTypeHandler<T, U> = (event: APIGatewayProxyEventPika<T>) => Promise<U>;

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
        | BaseRequestData
        | void
    >
) {
    console.log('Event:', JSON.stringify(event, null, 2));

    const { httpMethod, resource } = event;

    console.log('resource', resource);

    const route = `${httpMethod}:${resource}`;
    const routeHandler = routes[route];
    if (!routeHandler) {
        throw new HttpStatusError(`Unsupported route: ${httpMethod} ${resource}`, 404);
    }

    return routeHandler.handler(event);
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
async function handleGetAgent(event: APIGatewayProxyEventPika<void>): Promise<{ success: boolean; agent: AgentDefinition | null }> {
    const agentId = event.pathParameters?.agentId;
    if (!agentId) {
        throw new Error('Agent ID is required');
    }

    const agent = await getAgent(agentId);
    return {
        success: true,
        agent: agent || null
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
    // Check for query parameters to filter tools
    const queryParams = event.queryStringParameters || {};

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
 */
async function handleGetChatAppByRules(event: APIGatewayProxyEventPika<GetChatAppsByRulesRequest>): Promise<GetChatAppsByRulesResponse> {
    const requestBody = event.body;
    if (!requestBody) {
        throw new Error('Request body is required');
    }

    if (!requestBody.userId) {
        throw new Error('userId is required');
    }

    let response: GetChatAppsByRulesResponse = {
        success: true,
        chatApps: []
    };

    const userChatAppRules: UserChatAppRule[] = requestBody.userChatAppRules || [];

    if (userChatAppRules.length > 0) {
        const user = await getUser(requestBody.userId);
        if (!user) {
            throw new HttpStatusError(`User ${requestBody.userId} not found`, 404);
        }

        let chatApps: ChatApp[] = [];
        if (requestBody.chatAppId) {
            const chatApp = await getChatApp(requestBody.chatAppId);
            if (!chatApp) {
                console.log(`Chat App ${requestBody.chatAppId} not found, returning empty list`);
                return response;
            }
            chatApps.push(chatApp);
        } else {
            chatApps = await getChatApps();
        }
        response.chatApps = getMatchingChatApps(user.userType ?? 'external-user', user.roles, userChatAppRules, chatApps);
    }

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

export const handler = apiGatewayFunctionDecorator(handlerFn);
