import type {
    AgentDefinition,
    ChatApp,
    ChatAppOverride,
    ChatAppOverrideDdb,
    ChatSession,
    ChatSessionFeedback,
    ChatSessionFeedbackForUpdate,
    ChatSessionLiteForUpdate,
    RecordOrUndef,
    TagDefinition,
    TagDefinitionWidget,
    TagDefinitionForCreateOrUpdate,
    TagDefinitionLite,
    SemanticDirective,
    SemanticDirectiveForCreateOrUpdate,
    SearchSemanticDirectivesRequest,
    ToolDefinition,
    UpdateableAgentDefinitionFields,
    UpdateableChatAppFields,
    UpdateableChatAppOverrideFields,
    UpdateableToolDefinitionFields,
    SemanticDirectiveScope
} from 'pika-shared/types/chatbot/chatbot-types';
import { INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS } from 'pika-shared/types/chatbot/chatbot-types';
import { convertStringToSnakeCase, convertToCamelCase, convertToSnakeCase, type SnakeCase } from 'pika-shared/util/chatbot-shared-utils';
import { constructScope } from 'pika-shared/util/server-client-utils';

import { DynamoDBClient, type ScanOutput } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import pRetry, { AbortError } from 'p-retry';
import { convertChatSessionToCamelFromSnakeCase, getChatSessionFeedbackTable, getChatSessionTable } from './utils';

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

function getTagDefinitionsTable(): string {
    const tableName = process.env.TAG_DEFINITIONS_TABLE;
    if (!tableName) {
        throw new Error('TAG_DEFINITIONS_TABLE environment variable is not set');
    }
    return tableName;
}

function getSemanticDirectiveTable(): string {
    const tableName = process.env.SEMANTIC_DIRECTIVE_TABLE;
    if (!tableName) {
        throw new Error('SEMANTIC_DIRECTIVE_TABLE environment variable is not set');
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

    // Separate main ChatApp records from override records
    const mainChatApps: any[] = [];
    const overrides = new Map<string, any>();

    for (const item of allItems) {
        const chatAppId = item.chat_app_id;
        if (chatAppId.endsWith(':override')) {
            // This is an override record
            const mainChatAppId = chatAppId.replace(':override', '');
            overrides.set(mainChatAppId, item);
        } else {
            // This is a main ChatApp record
            mainChatApps.push(item);
        }
    }

    // Convert and combine records
    return mainChatApps.map((item) => {
        const chatApp = convertToCamelCase<ChatApp>(item as SnakeCase<ChatApp>);

        // Add override if present
        const override = overrides.get(chatApp.chatAppId);
        if (override) {
            chatApp.override = convertToCamelCase<ChatAppOverride>(override as SnakeCase<ChatAppOverride>);
        }

        return chatApp;
    });
}

/**
 * Get chat app definition by ID
 */
export async function getChatAppById(chatAppId: string): Promise<ChatApp | undefined> {
    const chatAppIdWithOverride = `${chatAppId}:override`;
    const result = await ddbDocClient.batchGet({
        RequestItems: {
            [getChatAppTable()]: {
                Keys: [{ chat_app_id: chatAppId }, { chat_app_id: chatAppIdWithOverride }]
            }
        }
    });

    const items = result.Responses?.[getChatAppTable()] || [];

    let chatApp: ChatApp | undefined;
    let override: ChatAppOverride | undefined;

    for (const item of items) {
        if (item.chat_app_id === chatAppId) {
            // This is the main ChatApp record
            chatApp = convertToCamelCase<ChatApp>(item as SnakeCase<ChatApp>);
        } else if (item.chat_app_id === chatAppIdWithOverride) {
            // This is the override record
            override = convertToCamelCase<ChatAppOverride>(item as SnakeCase<ChatAppOverride>);
        }
    }

    // If main ChatApp record not found, return undefined
    if (!chatApp) {
        return undefined;
    }

    // Add override if present
    if (override) {
        chatApp.override = override;
    }

    return chatApp;
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
 * Create a new chat app override
 */
export async function createChatAppOverrideDdb(override: ChatAppOverrideDdb): Promise<ChatAppOverride> {
    await ddbDocClient.put({
        TableName: getChatAppTable(),
        Item: convertToSnakeCase<ChatAppOverrideDdb>(override),
        ConditionExpression: 'attribute_not_exists(chat_app_id)' // Prevent overwriting existing override
    });

    return override;
}

/**
 * Update an existing chat app override
 */
export async function updateChatAppOverrideToDdb(
    chatAppId: string,
    chatAppIdWithOverride: string,
    userId: string,
    fieldsToUpdate: Record<UpdateableChatAppOverrideFields, any>,
    fieldsToRemove: UpdateableChatAppOverrideFields[]
): Promise<ChatAppOverride> {
    // Build update expression and attribute values dynamically based on provided fields
    const setExpressions: string[] = [];
    const removeExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    setExpressions.push('#lastUpdate = :lastUpdate');
    expressionAttributeNames['#lastUpdate'] = 'last_update';
    expressionAttributeValues[':lastUpdate'] = new Date().toISOString();

    setExpressions.push('#updatedByUserId = :updatedByUserId');
    expressionAttributeNames['#updatedByUserId'] = 'updated_by_user_id';
    expressionAttributeValues[':updatedByUserId'] = userId;

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
    let updateExpression = '';
    if (setExpressions.length > 0) {
        updateExpression = `SET ${setExpressions.join(', ')}`;
    }
    if (removeExpressions.length > 0) {
        updateExpression += updateExpression ? ` REMOVE ${removeExpressions.join(', ')}` : `REMOVE ${removeExpressions.join(', ')}`;
    }

    await ddbDocClient.update({
        TableName: getChatAppTable(),
        Key: { chat_app_id: chatAppIdWithOverride },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(chat_app_id)' // Ensure override exists
    });

    // Get the updated override by fetching the main ChatApp (which will include the override)
    const updatedChatApp = await getChatAppById(chatAppId);
    if (!updatedChatApp?.override) {
        throw new Error(`Chat app override not found after update: ${chatAppId}`);
    }

    return updatedChatApp.override;
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
    const chatAppIdWithOverride = `${chatAppId}:override`;

    // Delete the main chat app record (with condition to ensure it exists)
    await ddbDocClient.delete({
        TableName: getChatAppTable(),
        Key: {
            chat_app_id: chatAppId
        },
        ConditionExpression: 'attribute_exists(chat_app_id)' // Ensure chat app exists before deletion
    });

    // Delete the override record if it exists (no condition, so won't error if not found)
    await ddbDocClient.delete({
        TableName: getChatAppTable(),
        Key: {
            chat_app_id: chatAppIdWithOverride
        }
        // No ConditionExpression - won't error if the override record doesn't exist
    });
}

/**
 * Delete a chat app override by ID
 */
export async function deleteChatAppOverrideDdb(chatAppIdWithOverride: string): Promise<void> {
    // Delete the override record if it exists (no condition, so won't error if not found)
    await ddbDocClient.delete({
        TableName: getChatAppTable(),
        Key: {
            chat_app_id: chatAppIdWithOverride
        }
        // No ConditionExpression - won't error if the override record doesn't exist
    });
}

// ===== SESSION INSIGHTS OPERATIONS =====

/**
 * Convert existing function to async iterator that yields pages
 * Checks timeout between each page fetch
 */
export async function* getSessionsThatNeedInsightsAnalysisIterator(
    date: Date,
    pageSize: number,
    getRemainingTimeInMillis: () => number,
    timeoutBufferMs: number
): AsyncGenerator<ChatSession<RecordOrUndef>[], void, undefined> {
    let lastEvaluatedKey: Record<string, any> | undefined;
    let pageCount = 0;

    do {
        // Check if we have enough time to continue
        if (getRemainingTimeInMillis() < timeoutBufferMs) {
            console.log(`Stopping pagination early - timeout approaching. Processed ${pageCount} pages`);
            break;
        }

        const sessions = await ddbDocClient.send(
            new QueryCommand({
                TableName: getChatSessionTable(),
                IndexName: 'insight-status-index',
                KeyConditionExpression: 'insight_status = :insightStatus and last_message_id <= :lastMessageId',
                ExpressionAttributeValues: {
                    ':insightStatus': INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS,
                    ':lastMessageId': date.toISOString()
                },
                ExclusiveStartKey: lastEvaluatedKey,
                Limit: pageSize
            })
        );
        const convertedSessions = (sessions.Items || []).map((item) => convertChatSessionToCamelFromSnakeCase<RecordOrUndef>(item as SnakeCase<ChatSession<RecordOrUndef>>));

        if (convertedSessions.length > 0) {
            pageCount++;
            console.log(`Yielding page ${pageCount} with ${convertedSessions.length} sessions`);
            yield convertedSessions;
        }

        lastEvaluatedKey = sessions.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Pagination complete. Total pages processed: ${pageCount}`);
}

/**
 * If a session has insightStatus set to NEEDS_INSIGHTS_ANALYSIS then we need to compute the insights for that session.
 * This function will return all sessions that have insightStatus set to NEEDS_INSIGHTS_ANALYSIS and have a lastMessageId
 * that is before the date.  It collects them all up in a single query.  We could change this to be a paginated query if we need to.
 *
 * @param date The date after which we should compute insights for based on the lastMessageId which can be used for date comparisons.
 */
export async function getSessionsThatNeedInsightsAnalysis(date: Date): Promise<ChatSession<RecordOrUndef>[]> {
    const allSessions: ChatSession<RecordOrUndef>[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
        const sessions = await ddbDocClient.query({
            TableName: getChatSessionTable(),
            IndexName: 'insight-status-index',
            KeyConditionExpression: 'insight_status = :insightStatus and last_message_id <= :lastMessageId',
            ExpressionAttributeValues: {
                ':insightStatus': INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS,
                ':lastMessageId': date.toISOString()
            },
            ExclusiveStartKey: lastEvaluatedKey
        });

        const convertedSessions = (sessions.Items || []).map((item) => convertChatSessionToCamelFromSnakeCase<RecordOrUndef>(item as SnakeCase<ChatSession<RecordOrUndef>>));
        allSessions.push(...convertedSessions);

        lastEvaluatedKey = sessions.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allSessions;
}

/**
 * Updates session insights analysis data in batch with robust error handling and resilience.
 *
 * Field update behavior:
 * - If field value is a concrete value: updates the session field in DynamoDB
 * - If field value is undefined: no operation on that field in DynamoDB
 * - If field value is null: removes that field from the session in DynamoDB
 *
 * @param sessions Array of session update objects
 * @returns Promise that resolves when all updates are complete
 * @throws Error if critical validation fails or all retries are exhausted for too many batches
 */
export async function setSessionsInsightsAnalysisInBatch(sessions: ChatSessionLiteForUpdate[]): Promise<void> {
    // Input validation
    if (!Array.isArray(sessions)) {
        throw new AbortError('Sessions parameter must be an array');
    }

    if (sessions.length === 0) {
        console.log('No sessions to process');
        return;
    }

    console.log(`Starting batch update process for ${sessions.length} sessions`);

    // Configuration constants
    const BATCH_SIZE = 20; // DynamoDB batch limit
    const CONCURRENCY_LIMIT = 3; // Reduced for better stability
    const MAX_RETRY_ATTEMPTS = 3;
    const MIN_RETRY_DELAY_MS = 1000;
    const MAX_RETRY_DELAY_MS = 8000;
    const REQUEST_TIMEOUT_MS = 10000; // 10 seconds per individual request

    // Split sessions into batches for processing
    const batches: (typeof sessions)[] = [];
    for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
        batches.push(sessions.slice(i, i + BATCH_SIZE));
    }

    console.log(`Split ${sessions.length} sessions into ${batches.length} batches`);

    // Track overall results
    const batchResults: { success: boolean; batchIndex: number; error?: Error }[] = [];
    let totalSuccessfulUpdates = 0;
    let totalFailedUpdates = 0;

    // Process each batch with proper error handling
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchId = `batch-${batchIndex + 1}-of-${batches.length}`;

        console.log(`Processing ${batchId} with ${batch.length} sessions`);

        try {
            const batchResult = await processBatchWithRetry(batch, batchId, {
                maxRetries: MAX_RETRY_ATTEMPTS,
                minRetryDelay: MIN_RETRY_DELAY_MS,
                maxRetryDelay: MAX_RETRY_DELAY_MS,
                requestTimeout: REQUEST_TIMEOUT_MS,
                concurrencyLimit: CONCURRENCY_LIMIT
            });

            batchResults.push({ success: true, batchIndex });
            totalSuccessfulUpdates += batchResult.successCount;
            totalFailedUpdates += batchResult.failureCount;

            console.log(`${batchId} completed: ${batchResult.successCount} successful, ${batchResult.failureCount} failed`);
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            batchResults.push({ success: false, batchIndex, error: errorObj });
            totalFailedUpdates += batch.length;

            console.error(`${batchId} failed completely after all retries:`, {
                error: errorObj.message,
                batchSize: batch.length
            });
        }
    }

    // Report final results
    const successfulBatches = batchResults.filter((r) => r.success).length;
    const failedBatches = batchResults.filter((r) => !r.success).length;

    console.log(`Batch processing completed:`, {
        totalSessions: sessions.length,
        totalBatches: batches.length,
        successfulBatches,
        failedBatches,
        totalSuccessfulUpdates,
        totalFailedUpdates
    });

    // Fail if too many batches failed (adjust threshold as needed)
    const failureThreshold = 0.1; // 10% failure tolerance
    if (failedBatches / batches.length > failureThreshold) {
        const failureRate = Math.round((failedBatches / batches.length) * 100);
        throw new Error(`Batch failure rate too high: ${failureRate}% (${failedBatches}/${batches.length} batches failed)`);
    }
}

/**
 * Perform a no-op touch on a chat session to trigger DynamoDB Streams without changing business data.
 * Sets last_update to its current value if present; otherwise performs a self-assign update.
 */
export async function touchChatSession(session: { userId: string; sessionId: string }): Promise<void> {
    const tableName = getChatSessionTable();
    const key = { user_id: session.userId, session_id: session.sessionId };

    // Retrieve the current last_update value (if any)
    const current = await ddbDocClient.get({
        TableName: tableName,
        Key: key,
        ProjectionExpression: 'last_update'
    });

    const lastUpdate = (current.Item as any)?.last_update;

    if (lastUpdate !== undefined) {
        // Re-set the same value to force an update event
        await ddbDocClient.update({
            TableName: tableName,
            Key: key,
            UpdateExpression: 'SET #lastUpdate = :lastUpdate',
            ExpressionAttributeNames: { '#lastUpdate': 'last_update' },
            ExpressionAttributeValues: { ':lastUpdate': lastUpdate }
        });
    } else {
        // Fall back to a self-assign update which does not add attributes
        await ddbDocClient.update({
            TableName: tableName,
            Key: key,
            UpdateExpression: 'SET #lastUpdate = #lastUpdate',
            ExpressionAttributeNames: { '#lastUpdate': 'last_update' }
        });
    }
}

/**
 * Perform a no-op touch on a feedback record to trigger DynamoDB Streams without changing business data.
 * Re-writes updated_on to its current value if present; otherwise performs a self-assign update.
 */
export async function touchChatFeedback(feedbackId: string): Promise<void> {
    const tableName = getChatSessionFeedbackTable();
    const key = { feedback_id: feedbackId };

    // Retrieve the current updated_on value (if any)
    const current = await ddbDocClient.get({
        TableName: tableName,
        Key: key,
        ProjectionExpression: 'updated_on'
    });

    const updatedOn = (current.Item as any)?.updated_on;

    if (updatedOn !== undefined) {
        // Re-set the same value to force an update event
        await ddbDocClient.update({
            TableName: tableName,
            Key: key,
            UpdateExpression: 'SET #updatedOn = :updatedOn',
            ExpressionAttributeNames: { '#updatedOn': 'updated_on' },
            ExpressionAttributeValues: { ':updatedOn': updatedOn }
        });
    } else {
        // Fall back to a self-assign update which does not add attributes
        await ddbDocClient.update({
            TableName: tableName,
            Key: key,
            UpdateExpression: 'SET #updatedOn = #updatedOn',
            ExpressionAttributeNames: { '#updatedOn': 'updated_on' }
        });
    }
}

/**
 * Process a single batch with retry logic using p-retry
 */
async function processBatchWithRetry(
    batch: ChatSessionLiteForUpdate[],
    batchId: string,
    config: {
        maxRetries: number;
        minRetryDelay: number;
        maxRetryDelay: number;
        requestTimeout: number;
        concurrencyLimit: number;
    }
): Promise<{ successCount: number; failureCount: number }> {
    return await pRetry(
        async (attemptNumber) => {
            console.log(`${batchId} attempt ${attemptNumber}`);

            // Build update requests from batch
            const updateRequests = batch.map((session) => buildUpdateRequest(session)).filter((req): req is NonNullable<typeof req> => req !== null);

            if (updateRequests.length === 0) {
                console.log(`${batchId} has no updates to perform`);
                return { successCount: 0, failureCount: 0 };
            }

            // Execute updates with concurrency control and timeouts
            const results = await executeUpdatesConcurrently(updateRequests, config.concurrencyLimit, config.requestTimeout, batchId);

            // Count results
            const successCount = results.filter((r) => r.status === 'fulfilled').length;
            const failureCount = results.filter((r) => r.status === 'rejected').length;

            // Log failed requests for this attempt
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    console.warn(`${batchId} request ${index} failed on attempt ${attemptNumber}:`, result.reason);
                }
            });

            // If we have failures and this isn't the last attempt, throw to trigger retry
            if (failureCount > 0) {
                const error = new Error(`${failureCount}/${results.length} requests failed in ${batchId}`);

                // Check if errors are retryable
                const hasRetryableErrors = results.some((result) => result.status === 'rejected' && isRetryableError(result.reason));

                if (!hasRetryableErrors) {
                    // All errors are non-retryable, don't retry
                    console.warn(`${batchId} has only non-retryable errors, not retrying`);
                    throw new AbortError(error.message);
                }

                throw error; // Retryable error
            }

            return { successCount, failureCount };
        },
        {
            retries: config.maxRetries,
            factor: 2,
            minTimeout: config.minRetryDelay,
            maxTimeout: config.maxRetryDelay,
            onFailedAttempt: (error) => {
                console.warn(`${batchId} attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left:`, {
                    error: error.message,
                    attemptNumber: error.attemptNumber,
                    retriesLeft: error.retriesLeft
                });
            }
        }
    );
}

/**
 * Build DynamoDB update request from session data
 */
function buildUpdateRequest(session: {
    userId: string;
    sessionId: string;
    lastAnalyzedMessageId: string | undefined | null;
    insightStatus: 'NEEDS_INSIGHTS_ANALYSIS' | undefined | null;
    insightsS3Url: string | undefined | null;
}): {
    userId: string;
    sessionId: string;
    updateParams: any;
} | null {
    const setExpressions: string[] = [];
    const removeExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Handle insightStatus field
    if (session.insightStatus === 'NEEDS_INSIGHTS_ANALYSIS') {
        setExpressions.push('#insightStatus = :insightStatus');
        expressionAttributeNames['#insightStatus'] = 'insight_status';
        expressionAttributeValues[':insightStatus'] = session.insightStatus;
    } else if (session.insightStatus === null) {
        // Remove the field entirely to remove it from GSI
        removeExpressions.push('#insightStatusRemove');
        expressionAttributeNames['#insightStatusRemove'] = 'insight_status';
    }

    // Handle insightsS3Url field
    if (session.insightsS3Url !== undefined) {
        if (session.insightsS3Url === null) {
            // Remove the field entirely
            removeExpressions.push('#insightsS3UrlRemove');
            expressionAttributeNames['#insightsS3UrlRemove'] = 'insights_s3_url';
        } else {
            setExpressions.push('#insightsS3Url = :insightsS3Url');
            expressionAttributeNames['#insightsS3Url'] = 'insights_s3_url';
            expressionAttributeValues[':insightsS3Url'] = session.insightsS3Url;
        }
    }

    // Handle lastAnalyzedMessageId field
    if (session.lastAnalyzedMessageId !== undefined) {
        if (session.lastAnalyzedMessageId === null) {
            // Remove the field entirely
            removeExpressions.push('#lastAnalyzedMessageIdRemove');
            expressionAttributeNames['#lastAnalyzedMessageIdRemove'] = 'last_analyzed_message_id';
        } else {
            setExpressions.push('#lastAnalyzedMessageId = :lastAnalyzedMessageId');
            expressionAttributeNames['#lastAnalyzedMessageId'] = 'last_analyzed_message_id';
            expressionAttributeValues[':lastAnalyzedMessageId'] = session.lastAnalyzedMessageId;
        }
    }

    // Skip if no updates needed
    if (setExpressions.length === 0 && removeExpressions.length === 0) {
        return null;
    }

    // Build UpdateExpression
    const expressionParts: string[] = [];
    if (setExpressions.length > 0) {
        expressionParts.push(`SET ${setExpressions.join(', ')}`);
    }
    if (removeExpressions.length > 0) {
        expressionParts.push(`REMOVE ${removeExpressions.join(', ')}`);
    }

    return {
        userId: session.userId,
        sessionId: session.sessionId,
        updateParams: {
            TableName: getChatSessionTable(),
            Key: {
                user_id: session.userId,
                session_id: session.sessionId
            },
            UpdateExpression: expressionParts.join(' '),
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined
        }
    };
}

export async function getFeedbackById(feedbackId: string): Promise<ChatSessionFeedback | undefined> {
    const feedback = await ddbDocClient.get({
        TableName: getChatSessionFeedbackTable(),
        Key: { feedback_id: feedbackId }
    });
    return feedback.Item ? convertToCamelCase<ChatSessionFeedback>(feedback.Item as SnakeCase<ChatSessionFeedback>) : undefined;
}

/**
 * Only update the fields that are provided.
 * @param feedback
 */
export async function updateFeedback(feedbackId: string, feedback: ChatSessionFeedbackForUpdate): Promise<void> {
    const now = new Date().toISOString();

    // Build update expression and attribute values dynamically based on provided fields
    const setExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Always update updatedOn
    setExpressions.push('#updatedOn = :updatedOn');
    expressionAttributeNames['#updatedOn'] = 'updated_on';
    expressionAttributeValues[':updatedOn'] = now;

    // Handle each updateable field if provided
    for (const [field, value] of Object.entries(feedback)) {
        if (value !== undefined) {
            setExpressions.push(`#${field} = :${field}`);
            expressionAttributeNames[`#${field}`] = convertStringToSnakeCase(field);
            // Ensure nested objects/arrays have snake_cased keys for consistency with inserts
            const valueToStore = value !== null && typeof value === 'object' ? convertToSnakeCase(value as any) : value;
            expressionAttributeValues[`:${field}`] = valueToStore;
        }
    }

    const updateExpression = `SET ${setExpressions.join(', ')}`;

    await ddbDocClient.update({
        TableName: getChatSessionFeedbackTable(),
        Key: { feedback_id: feedbackId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(feedback_id)' // Ensure feedback exists
    });
}

/**
 * Add a new feedback record to the database. Expect that it has everything on it we need and can just write it to the database.
 */
export async function addFeedback(feedback: ChatSessionFeedback): Promise<void> {
    await ddbDocClient.put({
        TableName: getChatSessionFeedbackTable(),
        Item: convertToSnakeCase<ChatSessionFeedback>(feedback),
        ConditionExpression: 'attribute_not_exists(feedback_id)' // Prevent overwriting existing feedback
    });
}

/**
 * Execute DynamoDB updates with controlled concurrency and timeouts
 */
async function executeUpdatesConcurrently(
    updateRequests: { userId: string; sessionId: string; updateParams: any }[],
    concurrencyLimit: number,
    timeoutMs: number,
    batchId: string
): Promise<PromiseSettledResult<any>[]> {
    const executeWithTimeout = async (request: (typeof updateRequests)[0], index: number) => {
        // Add jitter to reduce thundering herd
        const jitter = Math.random() * 100;
        await new Promise((resolve) => setTimeout(resolve, jitter));

        // Execute with timeout
        return Promise.race([
            ddbDocClient.update(request.updateParams),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs))
        ]);
    };

    // Process in chunks to control concurrency
    const results: PromiseSettledResult<any>[] = [];
    for (let i = 0; i < updateRequests.length; i += concurrencyLimit) {
        const chunk = updateRequests.slice(i, i + concurrencyLimit);
        const chunkResults = await Promise.allSettled(chunk.map((request, index) => executeWithTimeout(request, i + index)));
        results.push(...chunkResults);
    }

    return results;
}

// ===== TAG DEFINITION OPERATIONS =====

/**
 * Get all tag definitions with scan operation since no GSI is needed
 */
export async function getAllTagDefinitions(
    includeDisabled: boolean = true,
    includeInstructions: boolean = false,
    paginationToken?: Record<string, any> | undefined
): Promise<[TagDefinition<TagDefinitionWidget>[], Record<string, any> | undefined]> {
    let lastEvaluatedKey: Record<string, any> | undefined;

    const scanParams: any = {
        TableName: getTagDefinitionsTable(),
        ExclusiveStartKey: paginationToken
    };

    if (!includeDisabled) {
        scanParams.FilterExpression = 'attribute_not_exists(disabled) OR disabled = :disabled';
        scanParams.ExpressionAttributeValues = { ':disabled': false };
    }

    const result: ScanOutput = await ddbDocClient.scan(scanParams);
    lastEvaluatedKey = result.LastEvaluatedKey;

    let tagDefinitions = result.Items ? result.Items.map((item) => convertToCamelCase(item as unknown as SnakeCase<TagDefinition<TagDefinitionWidget>>)) : [];

    // Filter out disabled definitions if requested
    if (!includeDisabled) {
        tagDefinitions = tagDefinitions.filter((tag) => !tag.disabled);
    }

    if (!includeInstructions) {
        tagDefinitions = tagDefinitions.map((tag) => {
            delete tag.llmInstructionsMd;
            return tag;
        });
    }

    return [tagDefinitions, lastEvaluatedKey];
}

/**
 * Get a specific tag definition by scope and tag
 */
export async function getTagDefinition(scope: string, tag: string): Promise<TagDefinition<TagDefinitionWidget> | null> {
    const getParams = {
        TableName: getTagDefinitionsTable(),
        Key: {
            scope,
            tag
        }
    };

    const result = await ddbDocClient.get(getParams);

    if (!result.Item) {
        return null;
    }

    return convertToCamelCase(result.Item as any) as TagDefinition<TagDefinitionWidget>;
}

/**
 * Create or update a tag definition (idempotent operation)
 */
export async function createOrUpdateTagDefinition(tagDefinition: TagDefinitionForCreateOrUpdate, userId: string): Promise<TagDefinition<TagDefinitionWidget>> {
    const now = new Date().toISOString();

    // Check if the tag definition already exists
    const existingTagDef = await getTagDefinition(tagDefinition.scope, tagDefinition.tag);

    const tagDefToStore: TagDefinition<TagDefinitionWidget> = {
        ...tagDefinition,
        createdBy: existingTagDef?.createdBy ?? userId,
        lastUpdatedBy: userId,
        createDate: existingTagDef?.createDate ?? now,
        lastUpdate: now
    };

    const putParams = {
        TableName: getTagDefinitionsTable(),
        Item: convertToSnakeCase(tagDefToStore)
    };

    await ddbDocClient.put(putParams);

    return tagDefToStore;
}

/**
 * Delete a tag definition
 */
export async function deleteTagDefinition(scope: string, tag: string): Promise<void> {
    const deleteParams = {
        TableName: getTagDefinitionsTable(),
        Key: {
            scope,
            tag
        }
    };

    await ddbDocClient.delete(deleteParams);
}

/**
 * Search tag definitions with optional filtering
 */
export async function searchTagDefinitions(
    tagsDesired?: TagDefinitionLite[],
    includeDisabled: boolean = true,
    includeInstructions: boolean = false,
    paginationToken?: Record<string, any> | undefined
): Promise<[TagDefinition<TagDefinitionWidget>[], Record<string, any> | undefined]> {
    // Get all tag definitions first
    let [allTagDefs, newPaginationToken] = await getAllTagDefinitions(includeDisabled, includeInstructions, paginationToken);

    // If specific tags are desired, filter to only those
    if (tagsDesired && tagsDesired.length > 0) {
        const desiredSet = new Set(tagsDesired.map((t) => `${t.scope}.${t.tag}`));
        allTagDefs = allTagDefs.filter((tagDef) => desiredSet.has(`${tagDef.scope}.${tagDef.tag}`));
    }

    return [allTagDefs, newPaginationToken];
}

/**
 * Determine if an error is retryable based on AWS DynamoDB error patterns
 */
function isRetryableError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message || String(error);
    const errorName = error.name || error.code || '';

    // Non-retryable errors (4xx client errors - don't retry)
    const nonRetryablePatterns = [
        // DynamoDB-specific non-retryable errors
        'ValidationException',
        'ResourceNotFoundException',
        'ConditionalCheckFailedException',
        'AccessDeniedException',
        'UnrecognizedClientException',
        'InvalidParameterValueException',
        'ItemSizeTooLargeException',
        'ItemCollectionSizeLimitExceededException',
        'DuplicateTransactionError',
        'TransactionConflictException',
        'InvalidEndpointException',
        'ResourceInUseException',
        'BackupInUseException',
        'ContinuousBackupsUnavailableException',

        // General AWS auth/permission errors
        'InvalidSignatureException',
        'TokenRefreshRequiredException',
        'IncompleteSignatureException',
        'MissingAuthenticationTokenException',
        'ExpiredTokenException',
        'InvalidAccessKeyIdException',
        'InvalidUserIdException',

        // HTTP 4xx patterns
        'HTTP 400',
        'HTTP 401',
        'HTTP 403',
        'HTTP 404'
    ];

    // Retryable errors (5xx server errors and throttling - can retry)
    const retryablePatterns = [
        // DynamoDB throttling and capacity errors
        'ProvisionedThroughputExceededException',
        'RequestLimitExceeded',
        'ThrottlingException',
        'LimitExceededException',

        // AWS service errors (5xx)
        'InternalServerError',
        'InternalFailure',
        'ServiceUnavailableException',
        'ServiceUnavailable',
        'SlowDown',
        'TooManyRequestsException',

        // Network and connectivity errors
        'TimeoutError',
        'RequestTimeout',
        'ECONNRESET',
        'ENOTFOUND',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'EPIPE',
        'socket hang up',
        'network timeout',
        'connection timeout',
        'read timeout',
        'write timeout',

        // HTTP 5xx patterns
        'HTTP 500',
        'HTTP 502',
        'HTTP 503',
        'HTTP 504',

        // Generic timeout patterns
        'timeout',
        'Timeout'
    ];

    // Check for non-retryable patterns first (more specific check)
    for (const pattern of nonRetryablePatterns) {
        if (errorName.includes(pattern) || errorMessage.includes(pattern)) {
            return false;
        }
    }

    // Check for retryable patterns
    for (const pattern of retryablePatterns) {
        if (errorName.includes(pattern) || errorMessage.includes(pattern)) {
            return true;
        }
    }

    // For unknown errors, check HTTP status if available
    const httpStatus = error.statusCode || error.$metadata?.httpStatusCode;
    if (httpStatus) {
        if (httpStatus >= 400 && httpStatus < 500) {
            return false; // 4xx client errors are not retryable
        }
        if (httpStatus >= 500) {
            return true; // 5xx server errors are retryable
        }
    }

    // Conservative approach: default to retryable for truly unknown errors
    // This ensures we don't miss retrying legitimate transient failures
    return true;
}

// ===== SEMANTIC DIRECTIVE OPERATIONS =====

/**
 * Create or update a semantic directive (idempotent operation).  If you pass in the scope value, we ignore it and construct it ourselves.
 */
export async function createOrUpdateSemanticDirective(semanticDirective: SemanticDirectiveForCreateOrUpdate, userId: string): Promise<SemanticDirective> {
    const now = new Date().toISOString();

    const scope = constructScope(semanticDirective.scopeType, semanticDirective.scopeValue);

    // Check if the semantic directive already exists
    const existingSemanticDirective = await getSemanticDirective(scope, semanticDirective.id);

    const semanticDirectiveToStore: SemanticDirective = {
        ...semanticDirective,
        scope,
        createdBy: existingSemanticDirective?.createdBy ?? userId,
        lastUpdatedBy: userId,
        createDate: existingSemanticDirective?.createDate ?? now,
        lastUpdate: now
    };

    const putParams = {
        TableName: getSemanticDirectiveTable(),
        Item: convertToSnakeCase(semanticDirectiveToStore)
    };

    try {
        await ddbDocClient.put(putParams);
    } catch (error) {
        console.error(`Error creating/updating semantic directive ${scope}/${semanticDirective.id}:`, error);
        throw error;
    }

    return semanticDirectiveToStore;
}

/**
 * Get a specific semantic directive by scope and id
 */
export async function getSemanticDirective(scope: string, id: string): Promise<SemanticDirective | undefined> {
    const getParams = {
        TableName: getSemanticDirectiveTable(),
        Key: {
            scope,
            id
        }
    };

    try {
        const result = await ddbDocClient.get(getParams);

        if (!result.Item) {
            return undefined;
        }

        return convertToCamelCase(result.Item as any) as SemanticDirective;
    } catch (error) {
        console.error(`Error getting semantic directive ${scope}/${id}:`, error);
        throw error;
    }
}

/**
 * Delete a semantic directive
 */
export async function deleteSemanticDirective(scope: string, id: string): Promise<void> {
    const deleteParams = {
        TableName: getSemanticDirectiveTable(),
        Key: {
            scope,
            id
        }
    };

    await ddbDocClient.delete(deleteParams);
}

/**
 * Get semantic directives by groupId using GSI3
 */
export async function getSemanticDirectivesByGroupId(
    groupId: string,
    limit?: number,
    paginationToken?: Record<string, any>
): Promise<[SemanticDirective[], Record<string, any> | undefined]> {
    const effectiveLimit = Math.min(limit || 100, 100);

    const params: any = {
        TableName: getSemanticDirectiveTable(),
        IndexName: 'GSI3_byGroupId',
        KeyConditionExpression: 'group_id = :groupId',
        ExpressionAttributeValues: {
            ':groupId': groupId
        },
        Limit: effectiveLimit,
        ScanIndexForward: false, // Most recent first
        ExclusiveStartKey: paginationToken
    };

    const result = await ddbDocClient.query(params);
    const convertedItems = (result.Items || []).map((item: any) => convertToCamelCase(item as any) as SemanticDirective);

    return [convertedItems, result.LastEvaluatedKey];
}

/**
 * Search semantic directives with complex filtering and multiple access patterns
 */
export async function searchSemanticDirectives(request: SearchSemanticDirectivesRequest & { groupId?: string }): Promise<[SemanticDirective[], Record<string, any> | undefined]> {
    const { scopes, createdBy, directiveIds, groupId, createdAfter, createdBefore, updatedAfter, updatedBefore, sortOrder = 'desc', limit = 50, paginationToken } = request;

    // Validate limit
    const effectiveLimit = Math.min(limit || 50, 100);

    let allResults: SemanticDirective[] = [];
    let newPaginationToken: Record<string, any> | undefined;

    // Strategy 0: Query by findOne
    if (request.findOne) {
        const scope = constructScope(request.findOne.scopeType, request.findOne.scopeValue);
        const existingSemanticDirective = await getSemanticDirective(scope, request.findOne.id);
        if (existingSemanticDirective) {
            allResults.push(existingSemanticDirective);
        }
        newPaginationToken = undefined;
    }
    // Strategy 1: Query by groupId (uses GSI3)
    else if (groupId) {
        [allResults, newPaginationToken] = await getSemanticDirectivesByGroupId(groupId, effectiveLimit, paginationToken);
    }
    // Strategy 2: Query by specific scopes
    else if (scopes && scopes.length > 0) {
        [allResults, newPaginationToken] = await searchByScopes(scopes, effectiveLimit, paginationToken);
    }
    // Strategy 3: Query by creator (uses GSI1)
    else if (createdBy) {
        [allResults, newPaginationToken] = await searchByCreator(createdBy, sortOrder, effectiveLimit, paginationToken);
    }
    // Strategy 4: Query by directive IDs (uses GSI2)
    else if (directiveIds && directiveIds.length > 0) {
        [allResults, newPaginationToken] = await searchByDirectiveIds(directiveIds, effectiveLimit, paginationToken);
    }
    // Strategy 5: Scan all (fallback)
    else {
        [allResults, newPaginationToken] = await scanAllSemanticDirectives(effectiveLimit, paginationToken);
    }

    // Apply date filters if specified
    allResults = applyDateFilters(allResults, {
        createdAfter,
        createdBefore,
        updatedAfter,
        updatedBefore
    });

    // Filter out disabled directives if requested
    if (request.excludeDisabled) {
        allResults = allResults.filter((directive) => !directive.disabled);
        if (allResults.length === 0 && newPaginationToken) {
            // Let's go ahead and get the next page of results
            request.paginationToken = newPaginationToken;
            [allResults, newPaginationToken] = await searchSemanticDirectives(request);
        }
    }

    return [allResults, newPaginationToken];
}

/**
 * Search semantic directives by specific scopes using main table
 */
async function searchByScopes(
    scopes: SemanticDirectiveScope[],
    limit: number,
    paginationToken?: Record<string, any>
): Promise<[SemanticDirective[], Record<string, any> | undefined]> {
    // For instruction augmentation, we don't support pagination across multiple scopes
    // as it's conceptually problematic and unnecessary for this use case
    if (scopes.length > 1 && paginationToken) {
        console.warn('Pagination not supported when querying multiple scopes - ignoring pagination token');
    }

    const allResults: SemanticDirective[] = [];
    const batchSize = Math.ceil(limit / scopes.length);

    const scopeKeys = scopes.map((scope) => constructScope(scope.scopeType, scope.scopeValue));

    // Execute queries with concurrency control and retry logic
    const executeQueryWithRetry = async (scopeKey: string, index: number) => {
        return await pRetry(
            async (attemptNumber) => {
                const params: any = {
                    TableName: getSemanticDirectiveTable(),
                    KeyConditionExpression: '#scope = :scope',
                    ExpressionAttributeNames: {
                        '#scope': 'scope'
                    },
                    ExpressionAttributeValues: {
                        ':scope': scopeKey
                    },
                    Limit: batchSize,
                    ScanIndexForward: false // Most recent first by default
                };

                // Only use pagination token for single scope queries
                if (scopes.length === 1 && paginationToken) {
                    params.ExclusiveStartKey = paginationToken;
                }

                const result = await ddbDocClient.query(params);
                return {
                    items: result.Items || [],
                    lastEvaluatedKey: result.LastEvaluatedKey,
                    scopeKey
                };
            },
            {
                retries: 3,
                factor: 2,
                minTimeout: 100,
                maxTimeout: 1000,
                onFailedAttempt: (error) => {
                    console.warn(`Query scope ${scopeKey} attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left:`, error.message);

                    // Don't retry on non-retryable errors
                    if (!isRetryableError(error)) {
                        throw new AbortError(error.message);
                    }
                }
            }
        );
    };

    // Process in chunks of 3 to avoid overwhelming DynamoDB
    const CONCURRENCY_LIMIT = 3;
    const results: Awaited<ReturnType<typeof executeQueryWithRetry>>[] = [];

    for (let i = 0; i < scopeKeys.length; i += CONCURRENCY_LIMIT) {
        const chunk = scopeKeys.slice(i, i + CONCURRENCY_LIMIT);
        const chunkResults = await Promise.allSettled(chunk.map((scopeKey, chunkIndex) => executeQueryWithRetry(scopeKey, i + chunkIndex)));

        // Handle results and log any failures
        for (let j = 0; j < chunkResults.length; j++) {
            const result = chunkResults[j];
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                console.error(`Failed to query scope ${chunk[j]} after retries:`, result.reason);
                // Continue with other scopes rather than failing completely
            }
        }
    }

    // Combine and convert results
    for (const result of results) {
        const convertedItems = result.items.map((item: any) => convertToCamelCase(item as any) as SemanticDirective);
        allResults.push(...convertedItems);
    }

    // For single scope queries, return the pagination token
    const newPaginationToken = scopes.length === 1 && results.length > 0 ? results[0].lastEvaluatedKey : undefined;

    // Sort by createDate and limit results
    allResults.sort((a, b) => new Date(b.createDate).getTime() - new Date(a.createDate).getTime());
    const limitedResults = allResults.slice(0, limit);

    return [limitedResults, newPaginationToken];
}

/**
 * Search semantic directives by creator using GSI1
 */
async function searchByCreator(
    createdBy: string,
    sortOrder: 'asc' | 'desc',
    limit: number,
    paginationToken?: Record<string, any>
): Promise<[SemanticDirective[], Record<string, any> | undefined]> {
    const params: any = {
        TableName: getSemanticDirectiveTable(),
        IndexName: 'GSI1_byCreatedByDate',
        KeyConditionExpression: 'created_by = :createdBy',
        ExpressionAttributeValues: {
            ':createdBy': createdBy
        },
        Limit: limit,
        ScanIndexForward: sortOrder === 'asc',
        ExclusiveStartKey: paginationToken
    };

    const result = await ddbDocClient.query(params);
    const convertedItems = (result.Items || []).map((item: any) => convertToCamelCase(item as any) as SemanticDirective);

    return [convertedItems, result.LastEvaluatedKey];
}

/**
 * Search semantic directives by directive IDs using GSI2
 */
async function searchByDirectiveIds(
    directiveIds: string[],
    limit: number,
    paginationToken?: Record<string, any>,
    includeInstructions: boolean = false
): Promise<[SemanticDirective[], Record<string, any> | undefined]> {
    const allResults: SemanticDirective[] = [];
    const batchSize = Math.ceil(limit / directiveIds.length);

    // Execute queries in parallel for each directive ID
    const queries = directiveIds.map(async (id, index) => {
        const params: any = {
            TableName: getSemanticDirectiveTable(),
            IndexName: 'GSI2_byId',
            KeyConditionExpression: 'id = :id',
            ExpressionAttributeValues: {
                ':id': id
            },
            Limit: batchSize
        };

        // Add pagination token for first directive ID only (simplified pagination)
        if (paginationToken && index === 0) {
            params.ExclusiveStartKey = paginationToken;
        }

        const result = await ddbDocClient.query(params);
        return {
            items: result.Items || [],
            lastEvaluatedKey: result.LastEvaluatedKey,
            id
        };
    });

    const results = await Promise.all(queries);

    // Combine and convert results
    for (const result of results) {
        const convertedItems = result.items.map((item: any) => convertToCamelCase(item as any) as SemanticDirective);
        allResults.push(...convertedItems);
    }

    // Use the last evaluated key from the first directive ID for pagination
    const firstDirectiveResult = results.find((r) => r.id === directiveIds[0]);
    const newPaginationToken = firstDirectiveResult?.lastEvaluatedKey;

    // Sort by createDate and limit results
    allResults.sort((a, b) => new Date(b.createDate).getTime() - new Date(a.createDate).getTime());
    let limitedResults = allResults.slice(0, limit);

    // Filter out instructions if not requested
    if (!includeInstructions) {
        limitedResults = limitedResults.map((directive) => {
            const { instructions, ...directiveWithoutInstructions } = directive;
            return directiveWithoutInstructions as SemanticDirective;
        });
    }

    return [limitedResults, newPaginationToken];
}

/**
 * Scan all semantic directives (fallback when no specific criteria)
 */
async function scanAllSemanticDirectives(limit: number, paginationToken?: Record<string, any>): Promise<[SemanticDirective[], Record<string, any> | undefined]> {
    const params: any = {
        TableName: getSemanticDirectiveTable(),
        Limit: limit,
        ExclusiveStartKey: paginationToken
    };

    const result = await ddbDocClient.scan(params);
    const convertedItems = (result.Items || []).map((item: any) => convertToCamelCase(item as any) as SemanticDirective);

    // Sort by createDate (newest first)
    convertedItems.sort((a, b) => new Date(b.createDate).getTime() - new Date(a.createDate).getTime());

    return [convertedItems, result.LastEvaluatedKey];
}

/**
 * Apply date filters to results
 */
function applyDateFilters(
    results: SemanticDirective[],
    filters: {
        createdAfter?: string;
        createdBefore?: string;
        updatedAfter?: string;
        updatedBefore?: string;
    }
): SemanticDirective[] {
    const { createdAfter, createdBefore, updatedAfter, updatedBefore } = filters;

    return results.filter((directive) => {
        const createDate = new Date(directive.createDate);
        const updateDate = new Date(directive.lastUpdate);

        // Apply created date filters
        if (createdAfter && createDate <= new Date(createdAfter)) return false;
        if (createdBefore && createDate >= new Date(createdBefore)) return false;

        // Apply updated date filters
        if (updatedAfter && updateDate <= new Date(updatedAfter)) return false;
        if (updatedBefore && updateDate >= new Date(updatedBefore)) return false;

        return true;
    });
}
