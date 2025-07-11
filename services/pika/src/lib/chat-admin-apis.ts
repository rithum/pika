/**
 * These are server-side APIs that are called by the browser client.
 *
 * They each assume that the user is already authenticated and the user object
 * was extracted from the request object, probably using a JSON Web Token (JWT)
 * or something to validate they are legit and allowed to access this functionality.
 */

const MAX_NUM_FUNCTIONS_PER_TOOL = 11;
const MAX_NUM_PARAMS_PER_FUNCTION = 5;

//TODO: how do we create a first session with first message?

import type {
    AgentAndTools,
    AgentDataRequest,
    AgentDefinition,
    CreateAgentRequest,
    ToolDefinition,
    ToolDefinitionForCreate,
    UpdateableAgentDefinitionFields,
    UpdateableToolDefinitionFields,
    UpdateAgentRequest,
    UpdateToolRequest,
    ChatApp,
    CreateChatAppRequest,
    UpdateChatAppRequest,
    ChatAppForCreate,
    ChatAppDataRequest,
    ChatAppForIdempotentCreateOrUpdate,
    UpdateableChatAppFields,
    ChatAppOverride,
    CreateOrUpdateChatAppOverrideRequest,
    DeleteChatAppOverrideRequest,
    ChatAppOverrideForCreateOrUpdate,
    ChatAppOverrideDdb,
    UpdateableChatAppOverrideFields
} from '@pika/shared/types/chatbot/chatbot-types';
import { PikaUserRoles, UserTypes } from '@pika/shared/types/chatbot/chatbot-types';
import { v7 as uuidv7 } from 'uuid';
import {
    createAgent,
    createTool,
    getAgentById,
    getAgentsByCreator,
    getAllAgents,
    getAllTools,
    getToolById,
    getToolsByCreator,
    getToolsByExecutionType,
    getToolsByIds,
    getToolsByLifecycleStatus,
    updateAgent,
    updateTool,
    getAllChatApps,
    getChatAppById,
    createChatApp,
    updateChatApp,
    deleteChatApp,
    createChatAppOverrideDdb,
    updateChatAppOverrideToDdb,
    deleteChatAppOverrideDdb
} from './chat-admin-ddb';
import {
    agentsAreSame,
    toolsAreSame,
    handleOptionalFieldUpdate,
    handleRequiredFieldUpdate,
    handleArrayFieldUpdate,
    handleRequiredArrayFieldUpdate,
    handleObjectFieldUpdate,
    validateEntitiesExist,
    arraysHaveSameElements,
    arraysAreSame,
    recordsHaveSameElements,
    createEntityWithMetadata,
    calculateTTL
} from './chat-admin-utils';
import { HttpStatusError } from '@pika/shared/util/http-status-error';

/**
 * Get all defined agents
 * GET /api/chat-admin/agent
 */
export async function getAgents(): Promise<AgentDefinition[]> {
    const agents = await getAllAgents();
    return agents.map((agent) => {
        if ('ttl' in agent) {
            delete agent.ttl;
        }
        return agent;
    });
}

/**
 * Get a single agent by its ID
 * GET /api/chat-admin/agent/{agentId}
 */
export async function getAgent(agentId: string): Promise<AgentDefinition | undefined> {
    const agent = await getAgentById(agentId);
    if (agent && 'ttl' in agent) {
        delete agent.ttl;
    }
    return agent;
}

export async function getAgentAndTools(agentId: string): Promise<AgentAndTools | undefined> {
    const agentDefinition = await getAgent(agentId);
    if (!agentDefinition) {
        return undefined;
    }
    const tools = await getToolsByIds(agentDefinition.toolIds ?? []);
    return {
        agent: agentDefinition,
        tools: tools.map((tool) => {
            if ('ttl' in tool) {
                delete tool.ttl;
            }
            return tool;
        })
    };
}

/**
 * Create or update an agent idempotently.  This is used to create or update an agent and its tools in a single operation.
 * POST /api/chat-admin/agent/agent-data
 *
 * @param agentData The agent data to create or update
 * @returns The agent and its tools
 */
export async function createOrUpdateAgentIdempotently(agentData: AgentDataRequest): Promise<AgentAndTools> {
    console.log('createOrUpdateAgentIdempotently - Starting with agentId:', agentData.agent.agentId);

    try {
        const errors = validateAgentDataRequest(agentData);
        if (errors.length > 0) {
            console.error('createOrUpdateAgentIdempotently - Validation errors:', errors);
            throw new HttpStatusError(errors.join(', '), 400);
        }
        console.log('createOrUpdateAgentIdempotently - Validation passed');

        const now = new Date().toISOString();

        console.log('createOrUpdateAgentIdempotently - Checking if agent exists:', agentData.agent.agentId);
        const existingAgent = await getAgent(agentData.agent.agentId);

        if (existingAgent) {
            console.log('createOrUpdateAgentIdempotently - Agent exists, updating. Version:', existingAgent.version);
            return await updateAgentData(agentData, existingAgent, now);
        } else {
            console.log('createOrUpdateAgentIdempotently - Agent does not exist, creating new agent');

            // Handle agent creation
            console.log('createOrUpdateAgentIdempotently - Processing tools for new agent. Tools provided:', agentData.tools?.length ?? 0);
            const [finalTools, _toolsChanged] = await handleToolsIdempotent(agentData.userId, agentData.agent.toolIds ?? [], [], agentData.tools ?? [], now);
            console.log('createOrUpdateAgentIdempotently - Tools processed successfully. Final tool count:', finalTools.length);

            const agent: AgentDefinition = {
                ...agentData.agent,
                version: 1,
                toolIds: finalTools.map((tool) => tool.toolId),
                createdBy: agentData.userId,
                lastModifiedBy: agentData.userId,
                createdAt: now,
                updatedAt: now
            };

            console.log('createOrUpdateAgentIdempotently - Creating agent in database. AgentId:', agent.agentId);
            await createAgent(agent);
            console.log('createOrUpdateAgentIdempotently - Agent created successfully');

            return { agent, tools: finalTools };
        }
    } catch (error) {
        console.error('createOrUpdateAgentIdempotently - Error occurred:', error);
        console.error('createOrUpdateAgentIdempotently - Error details:', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined,
            agentId: agentData?.agent?.agentId,
            userId: agentData?.userId
        });
        throw error;
    }
}

async function updateAgentData(agentData: AgentDataRequest, existingAgent: AgentDefinition, now: string): Promise<AgentAndTools> {
    let agentNeedsUpdate = false;

    // Check if agent fields have changed
    if (!agentsAreSame(agentData.agent, existingAgent)) {
        agentNeedsUpdate = true;
    }

    // Handle tools - determine final tool list and if it changed
    const [finalTools, toolsChanged] = await handleToolsIdempotent(agentData.userId, agentData.agent.toolIds ?? [], existingAgent.toolIds ?? [], agentData.tools ?? [], now);

    // Update agent if needed
    if (agentNeedsUpdate || toolsChanged) {
        const fieldsToUpdate = {} as Record<UpdateableAgentDefinitionFields, any>;
        const fieldsToRemove: UpdateableAgentDefinitionFields[] = [];

        // Copy updatable fields from request if they differ
        handleRequiredFieldUpdate(agentData.agent.basePrompt, existingAgent.basePrompt, 'basePrompt', fieldsToUpdate);

        if (toolsChanged) {
            fieldsToUpdate.toolIds = finalTools.map((tool) => tool.toolId);
        }

        // Handle optional fields that can be updated or removed
        handleArrayFieldUpdate(agentData.agent.accessRules, existingAgent.accessRules, 'accessRules', fieldsToUpdate, fieldsToRemove, true);
        handleArrayFieldUpdate(agentData.agent.knowledgeBases, existingAgent.knowledgeBases, 'knowledgeBases', fieldsToUpdate, fieldsToRemove, true);
        handleObjectFieldUpdate(agentData.agent.rolloutPolicy, existingAgent.rolloutPolicy, 'rolloutPolicy', fieldsToUpdate, fieldsToRemove, true);
        handleOptionalFieldUpdate(agentData.agent.dontCacheThis, existingAgent.dontCacheThis, 'dontCacheThis', fieldsToUpdate, fieldsToRemove);
        handleOptionalFieldUpdate(agentData.agent.runtimeAdapter, existingAgent.runtimeAdapter, 'runtimeAdapter', fieldsToUpdate, fieldsToRemove);

        const updatedAgent = await updateAgent(existingAgent, fieldsToUpdate, fieldsToRemove, agentData.userId, now);
        return { agent: updatedAgent, tools: finalTools };
    }

    return { agent: existingAgent, tools: finalTools };
}

/**
 * Handles tool management for idempotent agent create/update operations.
 *
 * This function reconciles the desired tool state with the existing state:
 * 1. If toolIds are provided: validates they exist and compares with current agent tools
 * 2. If tool definitions are provided: creates missing tools, updates changed tools
 * 3. Returns the final tool list and whether the agent's tool associations changed
 *
 * @param userId User performing the operation
 * @param toolIdsFromAgentRequest Tool IDs specified in the request (if using existing tools)
 * @param toolIdsOnExistingAgent Current tool IDs on the existing agent (empty for new agents)
 * @param requestToolDefs Tool definitions to create/update (if providing tool definitions)
 * @returns Tuple of [final tool definitions, whether tool list changed]
 */
async function handleToolsIdempotent(
    userId: string,
    toolIdsFromAgentRequest: string[],
    toolIdsOnExistingAgent: string[],
    requestToolDefs: any[],
    now: string
): Promise<[ToolDefinition[], boolean]> {
    // Validate input: cannot provide both tool IDs and tool definitions
    if (toolIdsFromAgentRequest.length > 0 && requestToolDefs.length > 0) {
        throw new Error('Both toolIdsFromAgentRequest and newTools cannot be provided');
    }

    // Early return if no tools specified
    if (toolIdsFromAgentRequest.length === 0 && requestToolDefs.length === 0) {
        return [[], toolIdsOnExistingAgent.length > 0];
    }

    // Scenario 1: Tool IDs provided - validate existence and check for changes
    if (toolIdsFromAgentRequest.length > 0) {
        // Verify all requested tools exist in database
        const requestedTools = await getToolsByIds(toolIdsFromAgentRequest);
        validateEntitiesExist(toolIdsFromAgentRequest, requestedTools, 'tools', 'toolId');

        // Check if tool list changed from existing agent
        const toolListChanged = !arraysHaveSameElements(toolIdsFromAgentRequest, toolIdsOnExistingAgent);

        return [requestedTools, toolListChanged];
    }

    // Scenario 2: Tool definitions provided - create/update as needed
    if (requestToolDefs.length > 0) {
        const finalTools: ToolDefinition[] = [];

        // Check which tools exist in database
        const existingToolsInDb = await getToolsByIds(requestToolDefs.map((tool) => tool.toolId));
        const existingToolMap = new Map(existingToolsInDb.map((tool) => [tool.toolId, tool]));

        // Process each requested tool definition
        for (const requestedTool of requestToolDefs) {
            const existingTool = existingToolMap.get(requestedTool.toolId);

            if (existingTool) {
                // Tool exists - check if update needed
                if (!toolsAreSame(requestedTool as ToolDefinition, existingTool)) {
                    // Tool changed - update it
                    const fieldsToUpdate = {} as Record<UpdateableToolDefinitionFields, any>;
                    const fieldsToRemove: UpdateableToolDefinitionFields[] = [];

                    // Handle required fields
                    handleRequiredFieldUpdate(requestedTool.name, existingTool.name, 'name', fieldsToUpdate);
                    handleRequiredFieldUpdate(requestedTool.displayName, existingTool.displayName, 'displayName', fieldsToUpdate);
                    handleRequiredFieldUpdate(requestedTool.description, existingTool.description, 'description', fieldsToUpdate);
                    handleRequiredFieldUpdate(requestedTool.executionType, existingTool.executionType, 'executionType', fieldsToUpdate);
                    handleRequiredArrayFieldUpdate(requestedTool.supportedAgentFrameworks, existingTool.supportedAgentFrameworks, 'supportedAgentFrameworks', fieldsToUpdate);

                    // Handle optional fields that can be updated or removed
                    handleOptionalFieldUpdate(requestedTool.executionTimeout, existingTool.executionTimeout, 'executionTimeout', fieldsToUpdate, fieldsToRemove);
                    handleOptionalFieldUpdate(requestedTool.lambdaArn, existingTool.lambdaArn, 'lambdaArn', fieldsToUpdate, fieldsToRemove);
                    handleObjectFieldUpdate(requestedTool.functionSchema, existingTool.functionSchema, 'functionSchema', fieldsToUpdate, fieldsToRemove, true);
                    handleObjectFieldUpdate(requestedTool.tags, existingTool.tags, 'tags', fieldsToUpdate, fieldsToRemove, true);
                    handleObjectFieldUpdate(requestedTool.lifecycle, existingTool.lifecycle, 'lifecycle', fieldsToUpdate, fieldsToRemove, true);
                    handleArrayFieldUpdate(requestedTool.accessRules, existingTool.accessRules, 'accessRules', fieldsToUpdate, fieldsToRemove, true);

                    const updatedTool = await updateTool(existingTool, fieldsToUpdate, fieldsToRemove, userId);
                    finalTools.push(updatedTool);
                } else {
                    // Tool unchanged - use existing
                    finalTools.push(existingTool);
                }
            } else {
                // Tool doesn't exist - create it
                const newTool = createEntityWithMetadata(requestedTool, userId, now) as ToolDefinition;
                const createdTool = await createTool(newTool);
                finalTools.push(createdTool);
            }
        }

        // Check if final tool list differs from existing agent's tools
        const finalToolIds = finalTools.map((tool) => tool.toolId);
        const toolListChanged = !arraysHaveSameElements(finalToolIds, toolIdsOnExistingAgent);

        return [finalTools, toolListChanged];
    } else {
        // Should never reach here due to early validation, but TypeScript requires it
        return [[], false];
    }
}

/**
 * Create a new agent
 * POST /api/chat-admin/agent
 */
export async function createAgentDefinition(request: CreateAgentRequest): Promise<AgentDefinition> {
    // Agent IDs must be unique, so if one is provided, we must verify it is not already in use
    if (request.agent.agentId) {
        const existingAgent = await getAgent(request.agent.agentId);
        if (existingAgent) {
            throw new Error('Agent ID already exists');
        }
    }

    const now = new Date().toISOString();

    const toolIds = [...(request.existingToolsToAssociate ?? []), ...(request.newToolsToCreate?.map((tool) => tool.toolId) ?? [])];

    // If there are existing tools to associate, we need to make sure they exist first
    if (request.existingToolsToAssociate) {
        const existingTools = await getToolsByIds(request.existingToolsToAssociate);
        if (existingTools.length !== request.existingToolsToAssociate.length) {
            throw new Error(
                `These tools don't exist to associate with your agent: ${request.existingToolsToAssociate.filter((toolId) => !existingTools.some((tool) => tool.toolId === toolId)).join(', ')}`
            );
        }
    }

    // If we are being asked to create new tools, then do so
    if (request.newToolsToCreate) {
        for (const tool of request.newToolsToCreate) {
            const newTool = await createToolDefinition(tool, request.userId);
            toolIds.push(newTool.toolId);
        }
    }

    const ttl = request.agent.test ? calculateTTL(1) : undefined;

    const agent: AgentDefinition = {
        ...request.agent,
        agentId: request.agent.agentId ?? uuidv7(),
        version: 1,
        toolIds,
        createdBy: request.userId,
        lastModifiedBy: request.userId,
        createdAt: now,
        updatedAt: now,
        ...(ttl ? { ttl } : {})
    };

    await createAgent(agent);

    return agent;
}

/**
 * Update an existing agent.  Only updates the fields that are provided in the request.
 * PUT /api/chat-admin/agent/{agentId}
 */
export async function updateAgentDefinition(request: UpdateAgentRequest): Promise<AgentDefinition> {
    const existingAgent = await getAgent(request.agent.agentId);
    if (!existingAgent) {
        throw new Error(`Agent ${request.agent.agentId} not found`);
    }

    const now = new Date().toISOString();
    const fieldsToUpdate: Record<UpdateableAgentDefinitionFields, any> = {} as any;
    const fieldsToRemove: UpdateableAgentDefinitionFields[] = [];

    // Handle basePrompt - required field, can only be updated
    handleRequiredFieldUpdate(request.agent.basePrompt, existingAgent.basePrompt, 'basePrompt', fieldsToUpdate);

    // Handle toolIds - required field, can only be updated
    const existingTools = new Set(existingAgent.toolIds ?? []);
    const newToolIds = new Set(request.agent.toolIds ?? []);

    // Find if the new toolIds are different from the existing toolIds by comparing the sets
    if (existingAgent.toolIds !== undefined && (existingTools.size !== newToolIds.size || !Array.from(existingTools).every((toolId) => newToolIds.has(toolId)))) {
        fieldsToUpdate.toolIds = Array.from(newToolIds);

        // Find which tools are new so we can validate that they exist
        const newlyAddedToolIds = Array.from(newToolIds).filter((toolId) => !existingTools.has(toolId));
        if (newlyAddedToolIds.length > 0) {
            const newlyAddedTools = await getToolsByIds(newlyAddedToolIds);
            validateEntitiesExist(newlyAddedToolIds, newlyAddedTools, 'tools', 'toolId', "These tools don't exist to associate with your agent");
        }
    }

    // Handle optional fields that can be updated or removed
    handleArrayFieldUpdate(request.agent.accessRules, existingAgent.accessRules, 'accessRules', fieldsToUpdate, fieldsToRemove, true);
    handleObjectFieldUpdate(request.agent.rolloutPolicy, existingAgent.rolloutPolicy, 'rolloutPolicy', fieldsToUpdate, fieldsToRemove, true);
    handleOptionalFieldUpdate(request.agent.dontCacheThis, existingAgent.dontCacheThis, 'dontCacheThis', fieldsToUpdate, fieldsToRemove);
    handleOptionalFieldUpdate(request.agent.runtimeAdapter, existingAgent.runtimeAdapter, 'runtimeAdapter', fieldsToUpdate, fieldsToRemove);

    if (Object.keys(fieldsToUpdate).length === 0 && fieldsToRemove.length === 0) {
        return existingAgent;
    } else {
        return await updateAgent(existingAgent, fieldsToUpdate, fieldsToRemove, request.userId, now);
    }
}

/**
 * Get agents created by a specific user
 */
export async function getAgentsByUser(userId: string): Promise<AgentDefinition[]> {
    const agents = await getAgentsByCreator(userId);
    return agents.map((agent) => {
        if ('ttl' in agent) {
            delete agent.ttl;
        }
        return agent;
    });
}

// ===== TOOL MANAGEMENT APIS =====

/**
 * Get all tools defined
 * GET /api/chat-admin/tool
 */
export async function getTools(): Promise<ToolDefinition[]> {
    const tools = await getAllTools();
    return tools.map((tool) => {
        if ('ttl' in tool) {
            delete tool.ttl;
        }
        return tool;
    });
}

/**
 * Get a specific tool
 * GET /api/chat-admin/tool/{toolId}
 */
export async function getTool(toolId: string): Promise<ToolDefinition | undefined> {
    const tool = await getToolById(toolId);
    if (tool && 'ttl' in tool) {
        delete tool.ttl;
    }
    return tool;
}

/**
 * Find all tools in the list by their IDs
 * POST /api/chat-admin/tool/search
 * Body: {"toolIds": ["aaa", "bbb"]}
 */
export async function searchToolsByIds(toolIds: string[]): Promise<ToolDefinition[]> {
    return await getToolsByIds(toolIds);
}

/**
 * Create a tool
 * POST /api/chat-admin/tool
 */
export async function createToolDefinition(toolData: ToolDefinitionForCreate, userId: string): Promise<ToolDefinition> {
    // If the toolId is provided, we need to make sure it is unique
    if (toolData.toolId) {
        const existingTool = await getTool(toolData.toolId);
        if (existingTool) {
            throw new Error(`Tool ID ${toolData.toolId} already exists`);
        }
    }

    const ttl = toolData.test ? calculateTTL(1) : undefined;

    const now = new Date().toISOString();
    const tool: ToolDefinition = {
        ...toolData,
        toolId: toolData.toolId ?? uuidv7(),
        version: 1,
        createdBy: userId,
        lastModifiedBy: userId,
        createdAt: now,
        updatedAt: now,
        ...(ttl ? { ttl } : {})
    };

    return await createTool(tool);
}

/**
 * Update a tool
 * PUT /api/chat-admin/tool
 * Note: The toolId should be in the request body since this is a PUT to the base resource
 */
export async function updateToolDefinition(request: UpdateToolRequest): Promise<ToolDefinition> {
    const MAX_TOOL_DESCRIPTION_LENGTH = 500;
    if (request.tool.description && request.tool.description.length > MAX_TOOL_DESCRIPTION_LENGTH) {
        throw new HttpStatusError(`Tool description must be less than ${MAX_TOOL_DESCRIPTION_LENGTH} characters`, 400);
    }

    const now = new Date().toISOString();
    const existingTool = await getTool(request.tool.toolId);
    if (!existingTool) {
        throw new Error(`Tool ${request.tool.toolId} not found`);
    }

    const fieldsToUpdate: Record<UpdateableToolDefinitionFields, any> = {} as any;
    const fieldsToRemove: UpdateableToolDefinitionFields[] = [];

    // Handle required fields
    handleRequiredFieldUpdate(request.tool.name, existingTool.name, 'name', fieldsToUpdate);
    handleRequiredFieldUpdate(request.tool.displayName, existingTool.displayName, 'displayName', fieldsToUpdate);
    handleRequiredFieldUpdate(request.tool.description, existingTool.description, 'description', fieldsToUpdate);
    handleRequiredFieldUpdate(request.tool.executionType, existingTool.executionType, 'executionType', fieldsToUpdate);
    handleRequiredArrayFieldUpdate(request.tool.supportedAgentFrameworks, existingTool.supportedAgentFrameworks, 'supportedAgentFrameworks', fieldsToUpdate);

    // Handle optional fields that can be updated or removed
    handleOptionalFieldUpdate(request.tool.executionTimeout, existingTool.executionTimeout, 'executionTimeout', fieldsToUpdate, fieldsToRemove);
    handleOptionalFieldUpdate(request.tool.lambdaArn, existingTool.lambdaArn, 'lambdaArn', fieldsToUpdate, fieldsToRemove);
    handleObjectFieldUpdate(request.tool.functionSchema, existingTool.functionSchema, 'functionSchema', fieldsToUpdate, fieldsToRemove, true);
    handleObjectFieldUpdate(request.tool.tags, existingTool.tags, 'tags', fieldsToUpdate, fieldsToRemove, true);
    handleObjectFieldUpdate(request.tool.lifecycle, existingTool.lifecycle, 'lifecycle', fieldsToUpdate, fieldsToRemove, true);
    handleArrayFieldUpdate(request.tool.accessRules, existingTool.accessRules, 'accessRules', fieldsToUpdate, fieldsToRemove, true);

    return await updateTool(existingTool, fieldsToUpdate, fieldsToRemove, request.userId);
}

/**
 * Get tools created by a specific user
 */
export async function getToolsByUser(userId: string): Promise<ToolDefinition[]> {
    const tools = await getToolsByCreator(userId);
    return tools.map((tool) => {
        if ('ttl' in tool) {
            delete tool.ttl;
        }
        return tool;
    });
}

/**
 * Get tools by execution type
 */
export async function getToolsByType(executionType: string): Promise<ToolDefinition[]> {
    const tools = await getToolsByExecutionType(executionType);
    return tools.map((tool) => {
        if ('ttl' in tool) {
            delete tool.ttl;
        }
        return tool;
    });
}

/**
 * Get tools by lifecycle status
 */
export async function getToolsByStatus(status: string): Promise<ToolDefinition[]> {
    const tools = await getToolsByLifecycleStatus(status);
    return tools.map((tool) => {
        if ('ttl' in tool) {
            delete tool.ttl;
        }
        return tool;
    });
}

/**
 * Validate agent definition before creation/update
 */
export function validateAgentDefinition(agent: Partial<AgentDefinition>): string[] {
    const errors: string[] = [];

    if (!agent.basePrompt || agent.basePrompt.trim().length === 0) {
        errors.push('Base prompt is required and cannot be empty');
    }

    if (agent.toolIds && !Array.isArray(agent.toolIds)) {
        errors.push('toolIds must be an array');
    }

    if (agent.version !== undefined && agent.version < 1) {
        errors.push('Version must be a positive integer');
    }

    return errors;
}

/**
 * Validate tool definition before creation/update
 */
export function validateToolDefinition(tool: Partial<ToolDefinition>): string[] {
    const errors: string[] = [];

    if (!tool.displayName || tool.displayName.trim().length === 0) {
        errors.push('Display name is required and cannot be empty');
    }

    if (!tool.description || tool.description.trim().length === 0) {
        errors.push('Description is required and cannot be empty');
    }

    if (!tool.executionType) {
        errors.push('Execution type is required');
    }

    if (tool.executionType === 'lambda' && !tool.lambdaArn) {
        errors.push('Lambda ARN is required for lambda execution type');
    }

    if (!tool.supportedAgentFrameworks || tool.supportedAgentFrameworks.length === 0) {
        errors.push('At least one supported agent framework is required');
    }

    if (tool.supportedAgentFrameworks?.includes('bedrock') && !tool.functionSchema) {
        errors.push('Function schema is required for bedrock agent framework');
    }

    if (tool.version !== undefined && tool.version < 1) {
        errors.push('Version must be a positive integer');
    }

    if (tool.executionTimeout !== undefined && tool.executionTimeout < 1) {
        errors.push('Execution timeout must be a positive number');
    }

    if (tool.functionSchema && tool.functionSchema.length > MAX_NUM_FUNCTIONS_PER_TOOL) {
        errors.push(`Tool cannot have more than ${MAX_NUM_FUNCTIONS_PER_TOOL} functions`);
    }

    if (tool.functionSchema && tool.functionSchema.some((func) => func.parameters && Object.keys(func.parameters).length > MAX_NUM_PARAMS_PER_FUNCTION)) {
        errors.push(`Tool cannot have more than ${MAX_NUM_PARAMS_PER_FUNCTION} parameters per function`);
    }

    return errors;
}

export function validateAgentDataRequest(agentData: AgentDataRequest): string[] {
    const errors: string[] = [];

    if (typeof agentData !== 'object' || agentData === null) {
        errors.push('AgentData property when ungzipped and hex decoded is not an object');
    }

    const agentDataObj = agentData as AgentDataRequest;

    if (!agentDataObj.agent) {
        errors.push('AgentData is missing the agent property');
    }

    if (!agentDataObj.userId) {
        errors.push('AgentData is missing the userId property');
    }

    if (!agentDataObj.agent.agentId) {
        errors.push('AgentData.agent.agentId is missing: agentId must be provided for idempotent create/update');
    }

    const tools = agentDataObj.tools;
    if (tools) {
        if (!Array.isArray(tools)) {
            errors.push('AgentData.agent.tools must be an array');
        }

        for (let i = 0; i < tools.length; i++) {
            const tool = tools[i];
            if (!tool.toolId) {
                errors.push(`AgentData.agent.tools[${i}].toolId is missing: toolId must be provided for idempotent create/update`);
            }
        }
    }

    // If they provided both agent.toolIds and tools, then we need to throw an error
    if ((agentDataObj.agent.toolIds ?? []).length > 0 && (agentDataObj.tools ?? []).length > 0) {
        errors.push('AgentData.agent.toolIds and AgentData.tools cannot both be provided');
    }

    return errors;
}

// ===== CHAT APP MANAGEMENT APIS =====

/**
 * Get all chat apps defined
 * GET /api/chat-admin/chat-app
 */
export async function getChatApps(): Promise<ChatApp[]> {
    const chatApps = await getAllChatApps();
    return chatApps.map((chatApp) => {
        if ('ttl' in chatApp) {
            delete chatApp.ttl;
        }
        return chatApp;
    });
}

/**
 * Get a single chat app by its ID
 * GET /api/chat-admin/chat-app/{chatAppId}
 */
export async function getChatApp(chatAppId: string): Promise<ChatApp | undefined> {
    const chatApp = await getChatAppById(chatAppId);

    // The ChatApp type doesn't have a ttl filed but it may be there on the row in ddb.
    // If it is, just remove it from the response
    if (chatApp && 'ttl' in chatApp) {
        delete chatApp.ttl;
    }

    return chatApp;
}

/**
 * Create a new chat app
 * POST /api/chat-admin/chat-app
 */
export async function createChatAppDefinition(request: CreateChatAppRequest): Promise<ChatApp> {
    // Chat App IDs must be unique, so we must verify it is not already in use
    const existingChatApp = await getChatApp(request.chatApp.chatAppId);
    if (existingChatApp) {
        throw new Error(`Chat App ID '${request.chatApp.chatAppId}' already exists`);
    }

    const ttl = request.chatApp.test ? calculateTTL(1) : undefined;

    const now = new Date().toISOString();

    // You don't get to create the override this way, if there remove it
    if (request.chatApp.override) {
        delete request.chatApp.override;
    }

    const chatApp: ChatApp = {
        ...request.chatApp,
        createDate: now,
        lastUpdate: now,
        ...(ttl ? { ttl } : {})
    };

    await createChatApp(chatApp);

    return chatApp;
}

export async function deleteChatAppOverride(chatAppId: string): Promise<void> {
    await deleteChatAppOverrideDdb(`${chatAppId}:override`);
}

export async function createOrUpdateChatAppOverride(request: CreateOrUpdateChatAppOverrideRequest, chatAppId: string): Promise<ChatAppOverride> {
    const existingChatApp = await getChatApp(chatAppId);
    if (!existingChatApp) {
        throw new Error(`Chat App ${chatAppId} not found`);
    }

    const errors = validateChatAppOverride(request.override);
    if (errors.length > 0) {
        console.error('createOrUpdateChatAppOverride - Validation errors:', errors);
        throw new HttpStatusError(errors.join(', '), 400);
    }

    if (existingChatApp.override) {
        // We are doing an update, just update the override record
        return await updateChatAppOverride(existingChatApp.override, chatAppId, request.userId, request.override);
    } else {
        // We are doing a create, create the override record
        return await createChatAppOverride(chatAppId, request.userId, request.override);
    }
}

/**
 * Do not call this until you are sure the chat app exists and has no override
 */
async function createChatAppOverride(chatAppId: string, userId: string, override: ChatAppOverrideForCreateOrUpdate): Promise<ChatAppOverride> {
    const now = new Date().toISOString();
    const chatAppOverride: ChatAppOverrideDdb = {
        ...override,
        createDate: now,
        lastUpdate: now,
        createdByUserId: userId,
        updatedByUserId: userId,
        chatAppId: `${chatAppId}:override`
    };

    await createChatAppOverrideDdb(chatAppOverride);

    return chatAppOverride;
}

async function updateChatAppOverride(existingOverride: ChatAppOverride, chatAppId: string, userId: string, override: ChatAppOverrideForCreateOrUpdate): Promise<ChatAppOverride> {
    const chatAppIdWithOverride = `${chatAppId}:override`;
    const fieldsToUpdate = {} as Record<UpdateableChatAppOverrideFields, any>;
    const fieldsToRemove: UpdateableChatAppOverrideFields[] = [];

    handleRequiredFieldUpdate(override.enabled, existingOverride.enabled, 'enabled', fieldsToUpdate);
    handleArrayFieldUpdate(override.userTypes, existingOverride.userTypes, 'userTypes', fieldsToUpdate, fieldsToRemove, true);
    handleArrayFieldUpdate(override.userRoles, existingOverride.userRoles, 'userRoles', fieldsToUpdate, fieldsToRemove, true);
    handleOptionalFieldUpdate(override.applyRulesAs, existingOverride.applyRulesAs, 'applyRulesAs', fieldsToUpdate, fieldsToRemove);

    handleOptionalFieldUpdate(override.title, existingOverride.title, 'title', fieldsToUpdate, fieldsToRemove);
    handleOptionalFieldUpdate(override.description, existingOverride.description, 'description', fieldsToUpdate, fieldsToRemove);
    handleObjectFieldUpdate(override.features, existingOverride.features, 'features', fieldsToUpdate, fieldsToRemove, true);
    handleOptionalFieldUpdate(override.dontCacheThis, existingOverride.dontCacheThis, 'dontCacheThis', fieldsToUpdate, fieldsToRemove);

    handleArrayFieldUpdate(
        override.exclusiveExternalAccessControl,
        existingOverride.exclusiveExternalAccessControl,
        'exclusiveExternalAccessControl',
        fieldsToUpdate,
        fieldsToRemove,
        true
    );
    handleArrayFieldUpdate(
        override.exclusiveInternalAccessControl,
        existingOverride.exclusiveInternalAccessControl,
        'exclusiveInternalAccessControl',
        fieldsToUpdate,
        fieldsToRemove,
        true
    );
    handleArrayFieldUpdate(
        override.exclusiveUserIdAccessControl,
        existingOverride.exclusiveUserIdAccessControl,
        'exclusiveUserIdAccessControl',
        fieldsToUpdate,
        fieldsToRemove,
        true
    );

    if (Object.keys(fieldsToUpdate).length === 0 && fieldsToRemove.length === 0) {
        return existingOverride;
    } else {
        return await updateChatAppOverrideToDdb(chatAppId, chatAppIdWithOverride, userId, fieldsToUpdate, fieldsToRemove);
    }
}

/**
 * Update an existing chat app
 * PUT /api/chat-admin/chat-app/{chatAppId}
 */
export async function updateChatAppDefinition(request: UpdateChatAppRequest): Promise<ChatApp> {
    const existingChatApp = await getChatApp(request.chatApp.chatAppId!);
    if (!existingChatApp) {
        throw new Error(`Chat App ${request.chatApp.chatAppId} not found`);
    }

    // You don't get to create the override this way, if there remove it
    if (request.chatApp.override) {
        delete request.chatApp.override;
    }

    const now = new Date().toISOString();

    // Check if the user is trying to change the chatAppId (primary key)
    if (request.chatApp.chatAppId && request.chatApp.chatAppId !== existingChatApp.chatAppId) {
        // Changing the primary key requires create new + delete old
        const newChatAppId = request.chatApp.chatAppId;

        // Check that the new ID doesn't already exist
        const chatAppWithNewId = await getChatApp(newChatAppId);
        if (chatAppWithNewId) {
            throw new Error(`Chat App ID '${newChatAppId}' already exists`);
        }

        // Create the new chat app with the updated data
        const newChatApp: ChatApp = {
            ...existingChatApp,
            ...request.chatApp,
            chatAppId: newChatAppId,
            lastUpdate: now
            // Keep the original createDate
        };

        // Create the new record first
        await createChatApp(newChatApp);

        // If creation succeeded, delete the old record
        try {
            await deleteChatApp(existingChatApp.chatAppId);
        } catch (error) {
            // If deletion fails, we should clean up the new record to maintain consistency
            try {
                await deleteChatApp(newChatAppId);
            } catch (cleanupError) {
                console.error('Failed to cleanup new record after deletion failure:', cleanupError);
            }
            throw new Error(`Failed to delete old chat app after creating new one: ${error instanceof Error ? error.message : String(error)}`);
        }

        return newChatApp;
    } else {
        // Normal update (no primary key change)
        const fieldsToUpdate = {} as Record<UpdateableChatAppFields, any>;
        const fieldsToRemove: UpdateableChatAppFields[] = [];

        // Handle required fields that can only be updated
        handleRequiredFieldUpdate(request.chatApp.title, existingChatApp.title, 'title', fieldsToUpdate);
        handleRequiredFieldUpdate(request.chatApp.agentId, existingChatApp.agentId, 'agentId', fieldsToUpdate);
        handleRequiredFieldUpdate(request.chatApp.enabled, existingChatApp.enabled, 'enabled', fieldsToUpdate);

        // Handle optional fields that can be updated or removed
        handleOptionalFieldUpdate(request.chatApp.dontCacheThis, existingChatApp.dontCacheThis, 'dontCacheThis', fieldsToUpdate, fieldsToRemove);
        handleObjectFieldUpdate(request.chatApp.features, existingChatApp.features, 'features', fieldsToUpdate, fieldsToRemove, true);
        handleArrayFieldUpdate(request.chatApp.userTypes, existingChatApp.userTypes, 'userTypes', fieldsToUpdate, fieldsToRemove, true);
        handleArrayFieldUpdate(request.chatApp.userRoles, existingChatApp.userRoles, 'userRoles', fieldsToUpdate, fieldsToRemove, true);

        if (Object.keys(fieldsToUpdate).length === 0 && fieldsToRemove.length === 0) {
            return existingChatApp;
        } else {
            return await updateChatApp(existingChatApp, fieldsToUpdate, fieldsToRemove, now);
        }
    }
}

/**
 * Validate chat app definition before creation/update
 */
export function validateChatAppDefinition(chatApp: Partial<ChatApp>): string[] {
    const errors: string[] = [];

    if (!chatApp.chatAppId || chatApp.chatAppId.trim().length === 0) {
        errors.push('Chat App ID is required and cannot be empty');
    }

    if (chatApp.chatAppId && !/^[a-zA-Z0-9_-]+$/.test(chatApp.chatAppId)) {
        errors.push('Chat App ID can only contain alphanumeric characters, hyphens, and underscores');
    }

    if (!chatApp.title || chatApp.title.trim().length === 0) {
        errors.push('Title is required and cannot be empty');
    }

    if (!chatApp.agentId || chatApp.agentId.trim().length === 0) {
        errors.push('Agent ID is required and cannot be empty');
    }

    if (chatApp.enabled === undefined) {
        errors.push('Enabled field is required');
    }

    if (chatApp.modesSupported && !Array.isArray(chatApp.modesSupported)) {
        errors.push('ModesSupported must be an array of strings');
    } else if (chatApp.modesSupported && chatApp.modesSupported.length > 0) {
        for (const mode of chatApp.modesSupported) {
            if (!['standalone', 'embedded'].includes(mode)) {
                errors.push(`Invalid mode: ${mode}. Valid values are: standalone, embedded`);
            }
        }
    }

    if (chatApp.features && (typeof chatApp.features !== 'object' || Array.isArray(chatApp.features))) {
        errors.push('Features must be a Record object with feature IDs as keys');
    }

    return errors;
}

/**
 * Validate ChatAppOverride fields
 */
export function validateChatAppOverride(override: Partial<ChatAppOverride>): string[] {
    const errors: string[] = [];

    // enabled is required
    if (override.enabled === undefined) {
        errors.push('Enabled field is required');
    } else if (typeof override.enabled !== 'boolean') {
        errors.push('Enabled field must be a boolean');
    }

    // userTypes validation (optional)
    if (override.userTypes !== undefined) {
        if (!Array.isArray(override.userTypes)) {
            errors.push('userTypes must be an array');
        } else {
            const invalidUserTypes = override.userTypes.filter((userType) => !UserTypes.includes(userType as any));
            if (invalidUserTypes.length > 0) {
                errors.push(`Invalid userTypes: ${invalidUserTypes.join(', ')}. Valid values are: ${UserTypes.join(', ')}`);
            }
        }
    }

    // userRoles validation (optional)
    if (override.userRoles !== undefined) {
        if (!Array.isArray(override.userRoles)) {
            errors.push('userRoles must be an array');
        } else {
            const invalidUserRoles = override.userRoles.filter((role) => !PikaUserRoles.includes(role as any));
            if (invalidUserRoles.length > 0) {
                errors.push(`Invalid userRoles: ${invalidUserRoles.join(', ')}. Valid values are: ${PikaUserRoles.join(', ')}`);
            }
        }
    }

    // applyRulesAs validation (optional)
    if (override.applyRulesAs !== undefined) {
        if (!['and', 'or'].includes(override.applyRulesAs)) {
            errors.push('applyRulesAs must be either "and" or "or"');
        }
    }

    // exclusiveExternalAccessControl validation (optional)
    if (override.exclusiveExternalAccessControl !== undefined) {
        if (!Array.isArray(override.exclusiveExternalAccessControl)) {
            errors.push('exclusiveExternalAccessControl must be an array');
        } else {
            const invalidEntries = override.exclusiveExternalAccessControl.filter((entry) => typeof entry !== 'string');
            if (invalidEntries.length > 0) {
                errors.push('exclusiveExternalAccessControl must be an array of strings');
            }
        }
    }

    // exclusiveInternalAccessControl validation (optional)
    if (override.exclusiveInternalAccessControl !== undefined) {
        if (!Array.isArray(override.exclusiveInternalAccessControl)) {
            errors.push('exclusiveInternalAccessControl must be an array');
        } else {
            const invalidEntries = override.exclusiveInternalAccessControl.filter((entry) => typeof entry !== 'string');
            if (invalidEntries.length > 0) {
                errors.push('exclusiveInternalAccessControl must be an array of strings');
            }
        }
    }

    // exclusiveUserIdAccessControl validation (optional)
    if (override.exclusiveUserIdAccessControl !== undefined) {
        if (!Array.isArray(override.exclusiveUserIdAccessControl)) {
            errors.push('exclusiveUserIdAccessControl must be an array');
        } else {
            const invalidEntries = override.exclusiveUserIdAccessControl.filter((entry) => typeof entry !== 'string');
            if (invalidEntries.length > 0) {
                errors.push('exclusiveUserIdAccessControl must be an array of strings');
            }
        }
    }

    return errors;
}

/**
 * Create or update a chat app idempotently. This is used to create or update a chat app in a single operation.
 * POST /api/chat-admin/chat-app/chat-app-data
 *
 * @param chatAppData The chat app data to create or update
 * @returns The chat app
 */
export async function createOrUpdateChatAppIdempotently(chatAppData: ChatAppDataRequest): Promise<ChatApp> {
    console.log('createOrUpdateChatAppIdempotently - Starting with chatAppId:', chatAppData.chatApp.chatAppId);

    // You don't get to create the override this way, if there remove it
    if (chatAppData.chatApp.override) {
        delete chatAppData.chatApp.override;
    }

    try {
        const errors = validateChatAppDataRequest(chatAppData);
        if (errors.length > 0) {
            console.error('createOrUpdateChatAppIdempotently - Validation errors:', errors);
            throw new HttpStatusError(errors.join(', '), 400);
        }
        console.log('createOrUpdateChatAppIdempotently - Validation passed');

        const now = new Date().toISOString();

        console.log('createOrUpdateChatAppIdempotently - Checking if chat app exists:', chatAppData.chatApp.chatAppId);
        const existingChatApp = await getChatApp(chatAppData.chatApp.chatAppId);

        if (existingChatApp) {
            console.log('createOrUpdateChatAppIdempotently - Chat app exists, updating. Last update:', existingChatApp.lastUpdate);
            return await updateChatAppData(chatAppData, existingChatApp, now);
        } else {
            console.log('createOrUpdateChatAppIdempotently - Chat app does not exist, creating new chat app');

            const chatApp: ChatApp = {
                ...chatAppData.chatApp,
                createDate: now,
                lastUpdate: now
            };

            console.log('createOrUpdateChatAppIdempotently - Creating chat app in database. ChatAppId:', chatApp.chatAppId);
            await createChatApp(chatApp);
            console.log('createOrUpdateChatAppIdempotently - Chat app created successfully');

            return chatApp;
        }
    } catch (error) {
        console.error('createOrUpdateChatAppIdempotently - Error occurred:', error);
        console.error('createOrUpdateChatAppIdempotently - Error details:', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined,
            chatAppId: chatAppData?.chatApp?.chatAppId,
            userId: chatAppData?.userId
        });
        throw error;
    }
}

async function updateChatAppData(chatAppData: ChatAppDataRequest, existingChatApp: ChatApp, now: string): Promise<ChatApp> {
    // Check if chat app fields have changed
    if (chatAppsAreSame(chatAppData.chatApp, existingChatApp)) {
        console.log('updateChatAppData - No changes detected, returning existing chat app');
        return existingChatApp;
    }

    console.log('updateChatAppData - Changes detected, updating chat app');

    const fieldsToUpdate = {} as Record<UpdateableChatAppFields, any>;
    const fieldsToRemove: UpdateableChatAppFields[] = [];

    // Handle required fields that can only be updated
    handleRequiredFieldUpdate(chatAppData.chatApp.title, existingChatApp.title, 'title', fieldsToUpdate);
    handleRequiredFieldUpdate(chatAppData.chatApp.description, existingChatApp.description, 'description', fieldsToUpdate);
    handleRequiredFieldUpdate(chatAppData.chatApp.agentId, existingChatApp.agentId, 'agentId', fieldsToUpdate);
    handleRequiredFieldUpdate(chatAppData.chatApp.enabled, existingChatApp.enabled, 'enabled', fieldsToUpdate);
    handleArrayFieldUpdate(chatAppData.chatApp.modesSupported, existingChatApp.modesSupported, 'modesSupported', fieldsToUpdate, fieldsToRemove, true);

    // Handle optional array fields from AccessRules
    handleArrayFieldUpdate(chatAppData.chatApp.userTypes, existingChatApp.userTypes, 'userTypes', fieldsToUpdate, fieldsToRemove, true);
    handleArrayFieldUpdate(chatAppData.chatApp.userRoles, existingChatApp.userRoles, 'userRoles', fieldsToUpdate, fieldsToRemove, true);

    // Handle other optional fields that can be updated or removed
    handleOptionalFieldUpdate(chatAppData.chatApp.dontCacheThis, existingChatApp.dontCacheThis, 'dontCacheThis', fieldsToUpdate, fieldsToRemove);
    handleObjectFieldUpdate(chatAppData.chatApp.features, existingChatApp.features, 'features', fieldsToUpdate, fieldsToRemove, true);

    // Check if we actually have changes to apply
    if (Object.keys(fieldsToUpdate).length === 0 && fieldsToRemove.length === 0) {
        console.log('updateChatAppData - No actual field changes detected after comparison, returning existing chat app');
        return existingChatApp;
    }

    const updatedChatApp = await updateChatApp(existingChatApp, fieldsToUpdate, fieldsToRemove, now);
    return updatedChatApp;
}

/**
 * Helper function to compare if two chat apps are the same for updatable fields only
 */
function chatAppsAreSame(chatApp1: ChatAppForIdempotentCreateOrUpdate, chatApp2: ChatApp): boolean {
    // Compare required updatable fields
    if (chatApp1.title !== chatApp2.title) return false;
    if (chatApp1.description !== chatApp2.description) return false;
    if (chatApp1.agentId !== chatApp2.agentId) return false;
    if (chatApp1.enabled !== chatApp2.enabled) return false;

    // Compare optional updatable array fields
    if (!arraysAreSame(chatApp1.modesSupported, chatApp2.modesSupported)) return false;
    if (!arraysAreSame(chatApp1.userTypes, chatApp2.userTypes)) return false;
    if (!arraysAreSame(chatApp1.userRoles, chatApp2.userRoles)) return false;

    // Compare other optional updatable fields
    if (chatApp1.dontCacheThis !== chatApp2.dontCacheThis) return false;

    // Compare features record
    if (!recordsHaveSameElements(chatApp1.features, chatApp2.features)) {
        return false;
    }

    return true;
}

export function validateChatAppDataRequest(chatAppData: ChatAppDataRequest): string[] {
    const errors: string[] = [];

    if (typeof chatAppData !== 'object' || chatAppData === null) {
        errors.push('ChatAppData property when ungzipped and hex decoded is not an object');
    }

    const chatAppDataObj = chatAppData as ChatAppDataRequest;

    if (!chatAppDataObj.chatApp) {
        errors.push('ChatAppData is missing the chatApp property');
    }

    if (!chatAppDataObj.userId) {
        errors.push('ChatAppData is missing the userId property');
    }

    if (!chatAppDataObj.chatApp.chatAppId) {
        errors.push('ChatAppData.chatApp.chatAppId is missing: chatAppId must be provided for idempotent create/update');
    }

    // Validate the chat app definition itself
    if (chatAppDataObj.chatApp) {
        const chatAppErrors = validateChatAppDefinition(chatAppDataObj.chatApp);
        errors.push(...chatAppErrors);
    }

    return errors;
}
