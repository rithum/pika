import type {
    AgentDefinition,
    ChatApp,
    ToolDefinition,
    UpdateableAgentDefinitionFields,
    UpdateableChatAppFields,
    UpdateableToolDefinitionFields
} from '@pika/shared/types/chatbot/chatbot-types';
import { convertStringToSnakeCase, convertToCamelCase, convertToSnakeCase, type SnakeCase } from '@pika/shared/util/chatbot-shared-utils';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';

const region = process.env.AWS_REGION ?? 'us-east-1';
const ddbClient = new DynamoDBClient({
    region,
    maxAttempts: 5,
    requestHandler: new NodeHttpHandler({
        connectionTimeout: 2000,
        requestTimeout: 5000,
        httpsAgent: new https.Agent({
            ciphers: 'ALL'
        })
    })
});
const ddbDocClient = DynamoDBDocument.from(ddbClient, {
    marshallOptions: {
        convertEmptyValues: true,
        removeUndefinedValues: true
    }
});

function getAgentDefinitionsTable(): string {
    const tableName = process.env.AGENT_DEFINITIONS_TABLE;
    if (!tableName) {
        throw new Error('AGENT_DEFINITIONS_TABLE environment variable is not set');
    }
    return tableName;
}

function getToolDefinitionsTable(): string {
    const tableName = process.env.TOOL_DEFINITIONS_TABLE;
    if (!tableName) {
        throw new Error('TOOL_DEFINITIONS_TABLE environment variable is not set');
    }
    return tableName;
}

function getChatAppTable(): string {
    const tableName = process.env.CHAT_APP_TABLE;
    if (!tableName) {
        throw new Error('CHAT_APP_TABLE environment variable is not set');
    }
    return tableName;
}

// ===== AGENT OPERATIONS =====

/**
 * Get all agent definitions with pagination handling
 */
export async function getAllAgents(): Promise<AgentDefinition[]> {
    const allItems: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
        const result = await ddbDocClient.scan({
            TableName: getAgentDefinitionsTable(),
            ExclusiveStartKey: lastEvaluatedKey
        });

        if (result.Items) {
            allItems.push(...result.Items);
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allItems.map((item) => convertToCamelCase<AgentDefinition>(item as SnakeCase<AgentDefinition>));
}

/**
 * Get agent definition by ID
 */
export async function getAgentById(agentId: string): Promise<AgentDefinition | undefined> {
    const result = await ddbDocClient.get({
        TableName: getAgentDefinitionsTable(),
        Key: {
            agent_id: agentId
        }
    });

    return result.Item ? convertToCamelCase<AgentDefinition>(result.Item as SnakeCase<AgentDefinition>) : undefined;
}

/**
 * Create a new agent definition
 */
export async function createAgent(agent: AgentDefinition): Promise<AgentDefinition> {
    const now = new Date().toISOString();
    agent.createdAt = now;
    agent.updatedAt = now;

    await ddbDocClient.put({
        TableName: getAgentDefinitionsTable(),
        Item: convertToSnakeCase<AgentDefinition>(agent),
        ConditionExpression: 'attribute_not_exists(agent_id)' // Prevent overwriting existing agents
    });

    return agent;
}

/**
 * Update an existing agent definition
 */
export async function updateAgent(
    existingAgent: AgentDefinition,
    fieldsToUpdate: Record<UpdateableAgentDefinitionFields, any>,
    fieldsToRemove: UpdateableAgentDefinitionFields[],
    userId: string,
    now?: string
): Promise<AgentDefinition> {
    now = now ?? new Date().toISOString();

    // Build update expression and attribute values dynamically based on provided fields
    const setExpressions: string[] = [];
    const removeExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Always update updatedAt and lastModifiedBy
    setExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updated_at';
    expressionAttributeValues[':updatedAt'] = now;

    setExpressions.push('#lastModifiedBy = :lastModifiedBy');
    expressionAttributeNames['#lastModifiedBy'] = 'last_modified_by';
    expressionAttributeValues[':lastModifiedBy'] = userId;

    for (const [field, value] of Object.entries(fieldsToUpdate)) {
        setExpressions.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = convertStringToSnakeCase(field);
        expressionAttributeValues[`:${field}`] = value;
    }

    for (const field of fieldsToRemove) {
        removeExpressions.push(`#${field}_remove`);
        expressionAttributeNames[`#${field}_remove`] = convertStringToSnakeCase(field);
    }

    // Build the complete UpdateExpression
    let updateExpression = `SET ${setExpressions.join(', ')}`;
    if (removeExpressions.length > 0) {
        updateExpression += ` REMOVE ${removeExpressions.join(', ')}`;
    }

    await ddbDocClient.update({
        TableName: getAgentDefinitionsTable(),
        Key: { agent_id: existingAgent.agentId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(agent_id)' // Ensure agent exists
    });

    // Return the updated agent
    const updatedAgent = await getAgentById(existingAgent.agentId);
    if (!updatedAgent) {
        throw new Error(`Agent not found after update: ${existingAgent.agentId}`);
    }

    return updatedAgent;
}

/**
 * Get agents by creator with time ordering
 */
export async function getAgentsByCreator(createdBy: string): Promise<AgentDefinition[]> {
    const result = await ddbDocClient.query({
        TableName: getAgentDefinitionsTable(),
        IndexName: 'createdBy-createdAt-index',
        KeyConditionExpression: 'created_by = :createdBy',
        ExpressionAttributeValues: {
            ':createdBy': createdBy
        },
        ScanIndexForward: false // Most recent first
    });

    return (result.Items || []).map((item) => convertToCamelCase<AgentDefinition>(item as SnakeCase<AgentDefinition>));
}

// ===== TOOL OPERATIONS =====

/**
 * Convert ToolDefinition to snake case, preserving functionSchema as-is
 */
function convertToolToSnakeCase(tool: ToolDefinition): SnakeCase<ToolDefinition> {
    const { functionSchema, ...rest } = tool;
    const converted = convertToSnakeCase(rest);
    return {
        ...converted,
        function_schema: functionSchema // Preserve functionSchema as-is
    } as SnakeCase<ToolDefinition>;
}

/**
 * Convert ToolDefinition from snake case to camel case, preserving functionSchema as-is
 */
function convertToolFromSnakeCase(item: any): ToolDefinition {
    const { function_schema, ...rest } = item;
    const converted = convertToCamelCase(rest);
    return {
        ...converted,
        functionSchema: function_schema // Preserve functionSchema as-is
    } as ToolDefinition;
}

/**
 * Get all tool definitions with pagination handling
 */
export async function getAllTools(): Promise<ToolDefinition[]> {
    const allItems: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
        const result = await ddbDocClient.scan({
            TableName: getToolDefinitionsTable(),
            ExclusiveStartKey: lastEvaluatedKey
        });

        if (result.Items) {
            allItems.push(...result.Items);
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allItems.map((item) => convertToolFromSnakeCase(item));
}

/**
 * Get tool definition by ID
 */
export async function getToolById(toolId: string): Promise<ToolDefinition | undefined> {
    const result = await ddbDocClient.get({
        TableName: getToolDefinitionsTable(),
        Key: {
            tool_id: toolId
        }
    });

    return result.Item ? convertToolFromSnakeCase(result.Item) : undefined;
}

/**
 * Get multiple tools by their IDs
 */
export async function getToolsByIds(toolIds: string[]): Promise<ToolDefinition[]> {
    if (toolIds.length === 0) {
        return [];
    }

    // DynamoDB BatchGet has a limit of 100 items, so we need to chunk if necessary
    const chunks = [];
    for (let i = 0; i < toolIds.length; i += 100) {
        chunks.push(toolIds.slice(i, i + 100));
    }

    const allTools: ToolDefinition[] = [];

    for (const chunk of chunks) {
        const keys = chunk.map((toolId) => ({ tool_id: toolId }));

        const result = await ddbDocClient.batchGet({
            RequestItems: {
                [getToolDefinitionsTable()]: {
                    Keys: keys
                }
            }
        });

        const tools = (result.Responses?.[getToolDefinitionsTable()] || []).map((item) => convertToolFromSnakeCase(item));

        allTools.push(...tools);
    }

    return allTools;
}

/**
 * Create a new tool definition
 */
export async function createTool(tool: ToolDefinition): Promise<ToolDefinition> {
    const now = new Date().toISOString();
    tool.createdAt = now;
    tool.updatedAt = now;

    await ddbDocClient.put({
        TableName: getToolDefinitionsTable(),
        Item: convertToolToSnakeCase(tool),
        ConditionExpression: 'attribute_not_exists(tool_id)' // Prevent overwriting existing tools
    });

    return tool;
}

/**
 * Update an existing tool definition
 */
export async function updateTool(
    existingTool: ToolDefinition,
    fieldsToUpdate: Record<UpdateableToolDefinitionFields, any>,
    fieldsToRemove: UpdateableToolDefinitionFields[],
    userId: string
): Promise<ToolDefinition> {
    const now = new Date().toISOString();

    // Build update expression and attribute values dynamically based on provided fields
    const setExpressions: string[] = [];
    const removeExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Always update updatedAt
    setExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updated_at';
    expressionAttributeValues[':updatedAt'] = now;

    setExpressions.push('#lastModifiedBy = :lastModifiedBy');
    expressionAttributeNames['#lastModifiedBy'] = 'last_modified_by';
    expressionAttributeValues[':lastModifiedBy'] = userId;

    for (const [field, value] of Object.entries(fieldsToUpdate)) {
        setExpressions.push(`#${field} = :${field}`);
        // Special handling for functionSchema - don't convert to snake case
        if (field === 'functionSchema') {
            expressionAttributeNames[`#${field}`] = 'function_schema';
        } else {
            expressionAttributeNames[`#${field}`] = convertStringToSnakeCase(field);
        }
        expressionAttributeValues[`:${field}`] = value;
    }

    for (const field of fieldsToRemove) {
        removeExpressions.push(`#${field}_remove`);
        // Special handling for functionSchema - don't convert to snake case
        if (field === 'functionSchema') {
            expressionAttributeNames[`#${field}_remove`] = 'function_schema';
        } else {
            expressionAttributeNames[`#${field}_remove`] = convertStringToSnakeCase(field);
        }
    }

    // Build the complete UpdateExpression
    let updateExpression = `SET ${setExpressions.join(', ')}`;
    if (removeExpressions.length > 0) {
        updateExpression += ` REMOVE ${removeExpressions.join(', ')}`;
    }

    await ddbDocClient.update({
        TableName: getToolDefinitionsTable(),
        Key: { tool_id: existingTool.toolId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(tool_id)' // Ensure tool exists
    });

    // Return the updated tool
    const updatedTool = await getToolById(existingTool.toolId);
    if (!updatedTool) {
        throw new Error(`Tool not found after update: ${existingTool.toolId}`);
    }

    return updatedTool;
}

/**
 * Get tools by execution type with version ordering
 */
export async function getToolsByExecutionType(executionType: string): Promise<ToolDefinition[]> {
    const result = await ddbDocClient.query({
        TableName: getToolDefinitionsTable(),
        IndexName: 'executionType-version-index',
        KeyConditionExpression: 'execution_type = :executionType',
        ExpressionAttributeValues: {
            ':executionType': executionType
        },
        ScanIndexForward: false // Latest version first
    });

    return (result.Items || []).map((item) => convertToolFromSnakeCase(item));
}

/**
 * Get tools by lifecycle status
 */
export async function getToolsByLifecycleStatus(status: string): Promise<ToolDefinition[]> {
    const result = await ddbDocClient.query({
        TableName: getToolDefinitionsTable(),
        IndexName: 'lifecycle-status-toolId-index',
        KeyConditionExpression: 'lifecycle_status = :status',
        ExpressionAttributeValues: {
            ':status': status
        }
    });

    return (result.Items || []).map((item) => convertToolFromSnakeCase(item));
}

/**
 * Get tools by creator with time ordering
 */
export async function getToolsByCreator(createdBy: string): Promise<ToolDefinition[]> {
    const result = await ddbDocClient.query({
        TableName: getToolDefinitionsTable(),
        IndexName: 'createdBy-createdAt-index',
        KeyConditionExpression: 'created_by = :createdBy',
        ExpressionAttributeValues: {
            ':createdBy': createdBy
        },
        ScanIndexForward: false // Most recent first
    });

    return (result.Items || []).map((item) => convertToolFromSnakeCase(item));
}

// ===== CHAT APP OPERATIONS =====

/**
 * Get all chat app definitions with pagination handling
 */
export async function getAllChatApps(): Promise<ChatApp[]> {
    const allItems: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
        const result = await ddbDocClient.scan({
            TableName: getChatAppTable(),
            ExclusiveStartKey: lastEvaluatedKey
        });

        if (result.Items) {
            allItems.push(...result.Items);
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allItems.map((item) => convertToCamelCase<ChatApp>(item as SnakeCase<ChatApp>));
}

/**
 * Get chat app definition by ID
 */
export async function getChatAppById(chatAppId: string): Promise<ChatApp | undefined> {
    const result = await ddbDocClient.get({
        TableName: getChatAppTable(),
        Key: {
            chat_app_id: chatAppId
        }
    });

    return result.Item ? convertToCamelCase<ChatApp>(result.Item as SnakeCase<ChatApp>) : undefined;
}

/**
 * Create a new chat app definition
 */
export async function createChatApp(chatApp: ChatApp): Promise<ChatApp> {
    const now = new Date().toISOString();
    chatApp.createDate = now;
    chatApp.lastUpdate = now;

    await ddbDocClient.put({
        TableName: getChatAppTable(),
        Item: convertToSnakeCase<ChatApp>(chatApp),
        ConditionExpression: 'attribute_not_exists(chat_app_id)' // Prevent overwriting existing chat apps
    });

    return chatApp;
}

/**
 * Update an existing chat app definition
 */
export async function updateChatApp(
    existingChatApp: ChatApp,
    fieldsToUpdate: Record<UpdateableChatAppFields, any>,
    fieldsToRemove: UpdateableChatAppFields[],
    now?: string
): Promise<ChatApp> {
    now = now ?? new Date().toISOString();

    // Build update expression and attribute values dynamically based on provided fields
    const setExpressions: string[] = [];
    const removeExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Always update lastUpdate
    setExpressions.push('#lastUpdate = :lastUpdate');
    expressionAttributeNames['#lastUpdate'] = 'last_update';
    expressionAttributeValues[':lastUpdate'] = now;

    for (const [field, value] of Object.entries(fieldsToUpdate)) {
        setExpressions.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = convertStringToSnakeCase(field);
        expressionAttributeValues[`:${field}`] = value;
    }

    for (const field of fieldsToRemove) {
        removeExpressions.push(`#${field}_remove`);
        expressionAttributeNames[`#${field}_remove`] = convertStringToSnakeCase(field);
    }

    // Build the complete UpdateExpression
    let updateExpression = `SET ${setExpressions.join(', ')}`;
    if (removeExpressions.length > 0) {
        updateExpression += ` REMOVE ${removeExpressions.join(', ')}`;
    }

    await ddbDocClient.update({
        TableName: getChatAppTable(),
        Key: { chat_app_id: existingChatApp.chatAppId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(chat_app_id)' // Ensure chat app exists
    });

    // Return the updated chat app
    const updatedChatApp = await getChatAppById(existingChatApp.chatAppId);
    if (!updatedChatApp) {
        throw new Error(`Chat app not found after update: ${existingChatApp.chatAppId}`);
    }

    return updatedChatApp;
}

/**
 * Delete a chat app definition by ID
 */
export async function deleteChatApp(chatAppId: string): Promise<void> {
    await ddbDocClient.delete({
        TableName: getChatAppTable(),
        Key: {
            chat_app_id: chatAppId
        },
        ConditionExpression: 'attribute_exists(chat_app_id)' // Ensure chat app exists before deletion
    });
}
