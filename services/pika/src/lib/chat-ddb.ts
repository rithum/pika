import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import pRetry, { AbortError } from 'p-retry';
import type {
    ChatMessage,
    ChatMessageUsage,
    ChatSession,
    ChatSessionFeedback,
    ChatUser,
    ChatUserLite,
    PinnedSession,
    PinnedSessionDynamoDb,
    RecordOrUndef,
    SharedSessionVisitHistory,
    SharedSessionVisitHistoryDynamoDb,
    UserPrefs
} from 'pika-shared/types/chatbot/chatbot-types';
import { BadRequestError } from 'pika-shared/util/bad-request-error';
import { convertToCamelCase, convertToSnakeCase, type SnakeCase } from 'pika-shared/util/chatbot-shared-utils';
import { ForbiddenError } from 'pika-shared/util/forbidden-error';
import { HttpStatusError } from 'pika-shared/util/http-status-error';
import {
    convertChatSessionToCamelFromSnakeCase,
    convertChatSessionToSnakeFromCamelCase,
    convertChatUserToCamelFromSnakeCase,
    convertChatUserToSnakeFromCamelCase,
    convertPinnedSessionToCamelFromSnakeCaseFromDynamoDb,
    convertPinnedSessionToSnakeFromCamelCaseForDynamoDb,
    convertSharedSessionVisitHistoryToCamelFromSnakeCaseFromDynamoDb,
    getChatMessagesTable,
    getChatSessionFeedbackTable,
    getChatSessionTable,
    getChatUserTable,
    getPinnedSessionTable,
    getSharedSessionVisitHistoryTable
} from './utils';

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

export async function searchForUsersByPartialUserId(partialUserId: string): Promise<ChatUserLite[]> {
    const users = await ddbDocClient.query({
        TableName: getChatUserTable(),
        IndexName: 'user-search-index',
        KeyConditionExpression: 'user_id_prefix = :userIdPrefix and begins_with(user_id_lower, :userIdLower)',
        ExpressionAttributeValues: {
            ':userIdPrefix': partialUserId.slice(0, 3).toLowerCase(),
            ':userIdLower': partialUserId.toLowerCase()
        },
        ProjectionExpression: 'user_id, first_name, last_name',
        Limit: 20
    });

    return (users.Items || []).map((item) => convertChatUserToCamelFromSnakeCase(item as SnakeCase<ChatUser>));
}

export async function getUserByUserId(userId: string): Promise<ChatUser | undefined> {
    const user = await ddbDocClient.get({
        TableName: getChatUserTable(),
        Key: {
            user_id: userId
        }
    });

    // Start by removing the two attributes we added to the user for autocomplete search.
    const userItem = user.Item as SnakeCase<ChatUser> | undefined;
    if (userItem) {
        delete (userItem as any).user_id_prefix;
        delete (userItem as any).user_id_lower;
    }

    return userItem ? convertChatUserToCamelFromSnakeCase(userItem) : undefined;
}

export async function getUserPrefsByUserId(userId: string): Promise<UserPrefs | undefined> {
    const user = await ddbDocClient.get({
        TableName: getChatUserTable(),
        Key: {
            user_id: `${userId}/prefs`
        }
    });

    let result: UserPrefs | undefined;

    // Remove the user_id attribute from the user prefs.
    if (user.Item) {
        result = user.Item as unknown as UserPrefs;
        delete (result as any).user_id;
    }

    return result;
}

export async function setUserPrefsForUser(userId: string, prefs: UserPrefs): Promise<void> {
    await ddbDocClient.put({
        TableName: getChatUserTable(),
        Item: {
            ...prefs,
            user_id: `${userId}/prefs`
        }
    });
}

export async function deleteUserPrefsForUser(userId: string): Promise<void> {
    await ddbDocClient.delete({
        TableName: getChatUserTable(),
        Key: { user_id: `${userId}/prefs` }
    });
}

export async function addUser(user: ChatUser<RecordOrUndef>): Promise<ChatUser<RecordOrUndef>> {
    const now = new Date().toISOString();
    user.createDate = now;
    user.lastUpdate = now;

    // We add two attributes to the user to make it so we can do an autocomplete search.
    (user as any).userIdPrefix = user.userId.slice(0, 3).toLowerCase(); // Used as partition key for the GSI.
    (user as any).userIdLower = user.userId.toLowerCase(); // This is used for case insensitive searches.

    console.log('about to add user in chat database', convertChatUserToSnakeFromCamelCase(user));

    await ddbDocClient.put({
        TableName: getChatUserTable(),
        Item: convertChatUserToSnakeFromCamelCase(user)
    });

    return user;
}

export async function deleteMockUser(userId: string): Promise<void> {
    const user = await getUserByUserId(userId);
    if (!user) {
        return;
    }

    if (user.testType !== 'mock') {
        throw new ForbiddenError('Cannot delete user since it is not a mock test user');
    }

    await ddbDocClient.delete({
        TableName: getChatUserTable(),
        Key: { user_id: userId }
    });
}

/**
 * You must have verified that the user exists before calling this function.
 */
export async function updateUser(user: ChatUser<RecordOrUndef>): Promise<ChatUser<RecordOrUndef>> {
    if (!user.createDate) {
        throw new BadRequestError('User create date is required');
    }

    const now = new Date().toISOString();
    user.lastUpdate = now;

    // Build update expression and attribute values dynamically based on provided fields
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Always update lastUpdate
    updateExpressions.push('#lastUpdate = :lastUpdate');
    expressionAttributeNames['#lastUpdate'] = 'last_update';
    expressionAttributeValues[':lastUpdate'] = now;

    // Add other fields if they are provided
    if (user.customData !== undefined) {
        updateExpressions.push('#customData = :customData');
        expressionAttributeNames['#customData'] = 'custom_data';
        expressionAttributeValues[':customData'] = user.customData;
    }
    if (user.firstName !== undefined) {
        updateExpressions.push('#firstName = :firstName');
        expressionAttributeNames['#firstName'] = 'first_name';
        expressionAttributeValues[':firstName'] = user.firstName;
    }
    if (user.lastName !== undefined) {
        updateExpressions.push('#lastName = :lastName');
        expressionAttributeNames['#lastName'] = 'last_name';
        expressionAttributeValues[':lastName'] = user.lastName;
    }
    if (user.features !== undefined) {
        updateExpressions.push('#features = :features');
        expressionAttributeNames['#features'] = 'features';
        expressionAttributeValues[':features'] = user.features;
    }

    await ddbDocClient.update({
        TableName: getChatUserTable(),
        Key: { user_id: user.userId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    });

    return user;
}

export async function getChatMessagesInSession(userId: string, sessionId: string): Promise<ChatMessage[]> {
    const messages = await ddbDocClient.query({
        TableName: getChatMessagesTable(),
        KeyConditionExpression: 'user_id = :userId and begins_with(message_id, :sessionId)',
        ExpressionAttributeValues: {
            ':userId': userId,
            // The : at the end is used to match the message_id prefix which is the sessionId followed by a colon
            ':sessionId': `${sessionId}:`
        }
    });

    return (messages.Items || []).map((item) => convertToCamelCase<ChatMessage>(item as SnakeCase<ChatMessage>));
}

export async function getUserSessionsByUserId(userId: string): Promise<ChatSession<RecordOrUndef>[]> {
    const sessions = await ddbDocClient.query({
        TableName: getChatSessionTable(),
        KeyConditionExpression: 'user_id = :userId',
        ExpressionAttributeValues: {
            ':userId': userId
        }
    });

    return (sessions.Items || []).map((item) => convertChatSessionToCamelFromSnakeCase<RecordOrUndef>(item as SnakeCase<ChatSession<RecordOrUndef>>));
}

export async function getSessionsByUserIdAndChatAppId(userId: string, chatAppId: string): Promise<ChatSession<RecordOrUndef>[]> {
    const sessions = await ddbDocClient.query({
        TableName: getChatSessionTable(),
        IndexName: 'user-chat-app-index',
        KeyConditionExpression: 'user_id = :userId and chat_app_id = :chatAppId',
        ExpressionAttributeValues: {
            ':userId': userId,
            ':chatAppId': chatAppId
        }
    });

    return (sessions.Items || []).map((item) => convertChatSessionToCamelFromSnakeCase<RecordOrUndef>(item as SnakeCase<ChatSession<RecordOrUndef>>));
}

export async function getChatSessionByUserIdAndSessionId(userId: string, sessionId: string): Promise<ChatSession<RecordOrUndef> | undefined> {
    const session = await ddbDocClient.get({
        TableName: getChatSessionTable(),
        Key: {
            user_id: userId,
            session_id: sessionId
        }
    });

    return session.Item ? convertChatSessionToCamelFromSnakeCase<RecordOrUndef>(session.Item as SnakeCase<ChatSession<RecordOrUndef>>) : undefined;
}

export async function addChatSession(chatSession: ChatSession<RecordOrUndef>): Promise<ChatSession<RecordOrUndef>> {
    await ddbDocClient.put({
        TableName: getChatSessionTable(),
        Item: convertChatSessionToSnakeFromCamelCase<RecordOrUndef>(chatSession)
    });

    return chatSession;
}

export async function deleteMockSessionDdb(sessionId: string, sessionUserId: string): Promise<void> {
    const session = await getChatSessionByUserIdAndSessionId(sessionUserId, sessionId);
    if (!session) {
        return;
    }

    if (session.testType !== 'mock') {
        throw new ForbiddenError('Cannot delete session since it is not a test session');
    }

    await ddbDocClient.delete({
        TableName: getChatSessionTable(),
        Key: { user_id: sessionUserId, session_id: sessionId }
    });
}

export async function addMessage(chatMessage: ChatMessage): Promise<void> {
    const message = convertToSnakeCase<ChatMessage>(chatMessage);
    await ddbDocClient.put({
        TableName: getChatMessagesTable(),
        Item: message
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

export async function getFeedbackBySessionId(sessionId: string): Promise<ChatSessionFeedback[]> {
    const feedback = await ddbDocClient.query({
        TableName: getChatSessionFeedbackTable(),
        IndexName: 'chat-session-feedback-session-id-index',
        KeyConditionExpression: 'session_id = :sessionId',
        ExpressionAttributeValues: {
            ':sessionId': sessionId
        }
    });

    // Filter out any items that weren't created by the customer

    return (feedback.Items || []).map((item) => convertToCamelCase<ChatSessionFeedback>(item as SnakeCase<ChatSessionFeedback>));
}

/**
 * When we update the session, at the very least we need to update the last message id and the last
 * update timestamp.  Then, we also increment the usage stats for the session in the session row using
 * dynamodb's add operation.
 */
export async function updateSession(sessionId: string, userId: string, lastMessageId: string, timestamp: string, usage?: ChatMessageUsage): Promise<void> {
    await ddbDocClient.update({
        TableName: getChatSessionTable(),
        Key: {
            user_id: userId,
            session_id: sessionId
        },
        UpdateExpression: `SET last_message_id = :messageId, 
                               last_update = :timestamp
                           ADD input_cost :inputCost,
                               input_tokens :inputTokens,
                               output_cost :outputCost,
                               output_tokens :outputTokens,
                               total_cost :totalCost`,
        ExpressionAttributeValues: {
            ':messageId': lastMessageId,
            ':timestamp': timestamp,
            ':inputCost': usage?.inputCost ?? 0,
            ':inputTokens': usage?.inputTokens ?? 0,
            ':outputCost': usage?.outputCost ?? 0,
            ':outputTokens': usage?.outputTokens ?? 0,
            ':totalCost': usage?.totalCost ?? 0
        }
    });
}

export async function updateSessionTitleInDdb(sessionId: string, userId: string, title: string): Promise<ChatSession<RecordOrUndef>> {
    await ddbDocClient.update({
        TableName: getChatSessionTable(),
        Key: {
            user_id: userId,
            session_id: sessionId
        },
        UpdateExpression: 'set title = :title',
        ExpressionAttributeValues: {
            ':title': title
        }
    });

    const session = await getChatSessionByUserIdAndSessionId(userId, sessionId);
    if (!session) {
        throw new HttpStatusError(`Session not found for userId ${userId} and sessionId ${sessionId}`, 404);
    }

    return session;
}

// ===== SHARING SESSIONS FEATURE DATABASE OPERATIONS =====

// Shared Session operations - now stored on ChatSession directly
export async function revokeSharedSession(shareId: string): Promise<void> {
    // First get the session using the shareId
    const sessionData = await getChatSessionByShareId(shareId);
    if (!sessionData) {
        throw new HttpStatusError('Shared session not found', 404);
    }

    // Update the session to set the revoked date
    await ddbDocClient.update({
        TableName: getChatSessionTable(),
        Key: {
            user_id: sessionData.userId,
            session_id: sessionData.sessionId
        },
        UpdateExpression: 'SET share_revoked_date = :revokedDate',
        ExpressionAttributeValues: {
            ':revokedDate': new Date().toISOString()
        },
        ConditionExpression: 'attribute_exists(share_id)' // Ensure session is actually shared
    });
}

export async function unrevokeSharedSession(shareId: string): Promise<void> {
    // First get the session using the shareId
    const sessionData = await getChatSessionByShareId(shareId);
    if (!sessionData) {
        throw new HttpStatusError('Shared session not found', 404);
    }

    if (!sessionData.shareRevokedDate) {
        throw new BadRequestError('Shared session is not revoked');
    }

    // Update the session to remove the revoked date
    await ddbDocClient.update({
        TableName: getChatSessionTable(),
        Key: {
            user_id: sessionData.userId,
            session_id: sessionData.sessionId
        },
        UpdateExpression: 'REMOVE share_revoked_date',
        ConditionExpression: 'attribute_exists(share_id) AND attribute_exists(share_revoked_date)' // Ensure session is shared and actually revoked
    });
}

// SharedSessionVisitHistory operations
export async function recordSharedSessionVisit(userId: string, shareId: string, chatAppId: string, title: string, entityId: string): Promise<void> {
    const now = new Date().toISOString();
    const partitionKey = `${userId}#${chatAppId}`;

    // Try to update existing visit, or create if it doesn't exist
    await ddbDocClient.update({
        TableName: getSharedSessionVisitHistoryTable(),
        Key: {
            user_id_chat_app_id: partitionKey,
            share_id: shareId
        },
        UpdateExpression:
            'SET last_visited_at = :lastVisited, chat_app_id = :chatAppId, visit_count = if_not_exists(visit_count, :zero) + :inc, first_visited_at = if_not_exists(first_visited_at, :firstVisited), title = :title, entity_id = :entityId',
        ExpressionAttributeValues: {
            ':lastVisited': now,
            ':chatAppId': chatAppId,
            ':zero': 0,
            ':inc': 1,
            ':firstVisited': now,
            ':title': title,
            ':entityId': entityId
        }
    });
}

export async function getRecentSharedSessionHistory(
    userId: string,
    chatAppId: string,
    limit: number = 5,
    nextToken?: string
): Promise<[SharedSessionVisitHistory[], string | undefined]> {
    const partitionKey = `${userId}#${chatAppId}`;

    const result = await ddbDocClient.query({
        TableName: getSharedSessionVisitHistoryTable(),
        IndexName: 'recent-visits-index',
        KeyConditionExpression: 'user_id_chat_app_id = :partitionKey',
        ExpressionAttributeValues: {
            ':partitionKey': partitionKey
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit,
        ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined
    });

    const returnNextToken = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined;

    // Transform results to clean interface
    return [
        (result.Items || []).map((item) => convertSharedSessionVisitHistoryToCamelFromSnakeCaseFromDynamoDb(item as SnakeCase<SharedSessionVisitHistoryDynamoDb>)),
        returnNextToken
    ];
}

// PinnedSession operations
export async function pinSession(userId: string, pinnedSession: PinnedSession): Promise<PinnedSession> {
    const pinnedSessionDynamoDb = convertPinnedSessionToSnakeFromCamelCaseForDynamoDb(userId, pinnedSession);

    await ddbDocClient.put({
        TableName: getPinnedSessionTable(),
        Item: pinnedSessionDynamoDb,
        ConditionExpression: 'attribute_not_exists(session_or_share_id)'
    });

    return pinnedSession;
}

export async function unpinSession(userId: string, chatAppId: string, sessionId?: string, shareId?: string): Promise<void> {
    const partitionKey = `${userId}#${chatAppId}`;
    const sessionOrShareId = sessionId || shareId!;

    await ddbDocClient.delete({
        TableName: getPinnedSessionTable(),
        Key: {
            user_id_chat_app_id: partitionKey,
            session_or_share_id: sessionOrShareId
        }
    });
}

export async function getPinnedSessions(
    userId: string,
    chatAppId: string,
    limit: number = 20,
    nextToken?: string
): Promise<{ pinnedSessions: PinnedSession[]; nextToken?: string }> {
    const partitionKey = `${userId}#${chatAppId}`;

    const queryParams: any = {
        TableName: getPinnedSessionTable(),
        IndexName: 'user-chat-pinned-at-index',
        KeyConditionExpression: 'user_id_chat_app_id = :partitionKey',
        ExpressionAttributeValues: {
            ':partitionKey': partitionKey
        },
        ScanIndexForward: false, // Sort by pinned_at in descending order
        Limit: limit
    };

    // Add pagination token if provided
    if (nextToken) {
        try {
            queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        } catch (error) {
            console.error('Invalid pagination token:', error);
            throw new BadRequestError('Invalid pagination token');
        }
    }

    const result = await ddbDocClient.query(queryParams);

    // Transform results to hide composite key implementation details
    // No need to sort since GSI returns results in descending order by pinned_at
    const pinnedSessions = (result.Items || []).map((item) => convertPinnedSessionToCamelFromSnakeCaseFromDynamoDb(item as SnakeCase<PinnedSessionDynamoDb>));

    const returnNextToken = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined;

    return {
        pinnedSessions,
        nextToken: returnNextToken
    };
}

export async function getMockTestPinnedSessions(limit: number = 20, nextToken?: string): Promise<{ pinnedSessions: PinnedSession[]; nextToken?: string }> {
    const queryParams: any = {
        TableName: getPinnedSessionTable(),
        IndexName: 'test-pinned-sessions-index',
        KeyConditionExpression: 'test_type = :testType',
        ExpressionAttributeValues: {
            ':testType': 'mock'
        },
        Limit: limit
    };

    // Add pagination token if provided
    if (nextToken) {
        try {
            queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        } catch (error) {
            console.error('Invalid pagination token:', error);
            throw new BadRequestError('Invalid pagination token');
        }
    }

    const result = await ddbDocClient.query(queryParams);

    // Transform results to hide composite key implementation details
    // No need to sort since GSI returns results in descending order by session_or_share_id
    const pinnedSessions = (result.Items || []).map((item) => convertPinnedSessionToCamelFromSnakeCaseFromDynamoDb(item as SnakeCase<PinnedSessionDynamoDb>));
    const returnNextToken = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined;

    return {
        pinnedSessions,
        nextToken: returnNextToken
    };
}

export async function deleteAllMockTestPinnedSessions(): Promise<number> {
    let deletedCount = 0;
    let nextToken: string | undefined;

    do {
        // Query for mock test records using the GSI
        const queryParams: any = {
            TableName: getPinnedSessionTable(),
            IndexName: 'test-pinned-sessions-index',
            KeyConditionExpression: 'test_type = :testType',
            ExpressionAttributeValues: {
                ':testType': 'mock'
            },
            Limit: 100 // Process in batches
        };

        if (nextToken) {
            queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        }

        const result = await ddbDocClient.query(queryParams);
        const items = (result.Items || []) as SnakeCase<PinnedSession>[];

        if (items.length === 0) break;

        // Batch delete in chunks of 25 (DynamoDB limit)
        const chunks = [] as SnakeCase<PinnedSession>[][];
        for (let i = 0; i < items.length; i += 25) {
            chunks.push(items.slice(i, i + 25));
        }

        for (const chunk of chunks) {
            const deleteRequests = chunk.map((item: SnakeCase<PinnedSession>) => {
                // Reconstruct the composite keys like in pinSession
                const partitionKey = `${item.user_id}#${item.chat_app_id}`;
                const sessionOrShareId = item.session_id || item.share_id;

                return {
                    DeleteRequest: {
                        Key: {
                            user_id_chat_app_id: partitionKey, // Reconstructed partition key
                            session_or_share_id: sessionOrShareId // Reconstructed sort key
                        }
                    }
                };
            });

            await ddbDocClient.batchWrite({
                RequestItems: {
                    [getPinnedSessionTable()]: deleteRequests
                }
            });

            deletedCount += chunk.length;
        }

        nextToken = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined;
    } while (nextToken);

    console.log(`Deleted ${deletedCount} mock test pinned sessions`);
    return deletedCount;
}

// ===== MOCK TEST METHODS FOR OTHER TABLES =====

export async function getMockTestChatSessions(limit: number = 20, nextToken?: string): Promise<{ chatSessions: ChatSession<RecordOrUndef>[]; nextToken?: string }> {
    const queryParams: any = {
        TableName: getChatSessionTable(),
        IndexName: 'test-records-index',
        KeyConditionExpression: 'test_type = :testType',
        ExpressionAttributeValues: {
            ':testType': 'mock'
        },
        Limit: limit
    };

    // Add pagination token if provided
    if (nextToken) {
        try {
            queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        } catch (error) {
            console.error('Invalid pagination token:', error);
            throw new BadRequestError('Invalid pagination token');
        }
    }

    const result = await ddbDocClient.query(queryParams);

    // Transform results to camelCase
    const chatSessions = (result.Items || []).map((item) => convertChatSessionToCamelFromSnakeCase<RecordOrUndef>(item as SnakeCase<ChatSession<RecordOrUndef>>));
    const returnNextToken = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined;

    return {
        chatSessions,
        nextToken: returnNextToken
    };
}

export async function deleteAllMockTestChatSessions(): Promise<number> {
    let deletedCount = 0;
    let nextToken: string | undefined;

    do {
        // Query for mock test records using the GSI
        const queryParams: any = {
            TableName: getChatSessionTable(),
            IndexName: 'test-records-index',
            KeyConditionExpression: 'test_type = :testType',
            ExpressionAttributeValues: {
                ':testType': 'mock'
            },
            Limit: 50 // Process in batches
        };

        if (nextToken) {
            queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        }

        const result = await ddbDocClient.query(queryParams);
        const items = (result.Items || []) as SnakeCase<ChatSession<RecordOrUndef>>[];

        if (items.length === 0) break;

        // Batch delete in chunks of 25 (DynamoDB limit)
        const chunks = [] as SnakeCase<ChatSession<RecordOrUndef>>[][];
        for (let i = 0; i < items.length; i += 25) {
            chunks.push(items.slice(i, i + 25));
        }

        for (const chunk of chunks) {
            const deleteRequests = chunk.map((item: SnakeCase<ChatSession<RecordOrUndef>>) => {
                return {
                    DeleteRequest: {
                        Key: {
                            user_id: item.user_id,
                            session_id: item.session_id
                        }
                    }
                };
            });

            await ddbDocClient.batchWrite({
                RequestItems: {
                    [getChatSessionTable()]: deleteRequests
                }
            });

            deletedCount += chunk.length;
        }

        nextToken = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined;
    } while (nextToken);

    console.log(`Deleted ${deletedCount} mock test chat sessions`);
    return deletedCount;
}

export async function getMockTestChatUsers(limit: number = 20, nextToken?: string): Promise<{ chatUsers: ChatUser[]; nextToken?: string }> {
    const queryParams: any = {
        TableName: getChatUserTable(),
        IndexName: 'test-users-index',
        KeyConditionExpression: 'test_type = :testType',
        ExpressionAttributeValues: {
            ':testType': 'mock'
        },
        Limit: limit
    };

    // Add pagination token if provided
    if (nextToken) {
        try {
            queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        } catch (error) {
            console.error('Invalid pagination token:', error);
            throw new BadRequestError('Invalid pagination token');
        }
    }

    const result = await ddbDocClient.query(queryParams);

    // Transform results to camelCase
    const chatUsers = (result.Items || []).map((item) => convertChatUserToCamelFromSnakeCase(item as SnakeCase<ChatUser>));
    const returnNextToken = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined;

    return {
        chatUsers,
        nextToken: returnNextToken
    };
}

export async function deleteAllMockTestChatUsers(): Promise<number> {
    let deletedCount = 0;
    let nextToken: string | undefined;

    do {
        // Query for mock test records using the GSI
        const queryParams: any = {
            TableName: getChatUserTable(),
            IndexName: 'test-users-index',
            KeyConditionExpression: 'test_type = :testType',
            ExpressionAttributeValues: {
                ':testType': 'mock'
            },
            Limit: 50 // Process in batches
        };

        if (nextToken) {
            queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        }

        const result = await ddbDocClient.query(queryParams);
        const items = (result.Items || []) as SnakeCase<ChatUser>[];

        if (items.length === 0) break;

        // Batch delete in chunks of 25 (DynamoDB limit)
        const chunks = [] as SnakeCase<ChatUser>[][];
        for (let i = 0; i < items.length; i += 25) {
            chunks.push(items.slice(i, i + 25));
        }

        for (const chunk of chunks) {
            const deleteRequests = chunk.map((item: SnakeCase<ChatUser>) => {
                return {
                    DeleteRequest: {
                        Key: {
                            user_id: item.user_id
                        }
                    }
                };
            });

            await ddbDocClient.batchWrite({
                RequestItems: {
                    [getChatUserTable()]: deleteRequests
                }
            });

            deletedCount += chunk.length;
        }

        nextToken = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined;
    } while (nextToken);

    console.log(`Deleted ${deletedCount} mock test chat users`);
    return deletedCount;
}

export async function getMockTestSharedSessionVisits(limit: number = 20, nextToken?: string): Promise<{ sharedSessionVisits: SharedSessionVisitHistory[]; nextToken?: string }> {
    const queryParams: any = {
        TableName: getSharedSessionVisitHistoryTable(),
        IndexName: 'test-shared-sessions-visits-index',
        KeyConditionExpression: 'test_type = :testType',
        ExpressionAttributeValues: {
            ':testType': 'mock'
        },
        Limit: limit
    };

    // Add pagination token if provided
    if (nextToken) {
        try {
            queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        } catch (error) {
            console.error('Invalid pagination token:', error);
            throw new BadRequestError('Invalid pagination token');
        }
    }

    const result = await ddbDocClient.query(queryParams);

    // Transform results to clean interface
    const sharedSessionVisits = (result.Items || []).map((item) => convertToCamelCase<SharedSessionVisitHistory>(item as SnakeCase<SharedSessionVisitHistory>));
    const returnNextToken = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined;

    return {
        sharedSessionVisits,
        nextToken: returnNextToken
    };
}

export async function deleteAllMockTestSharedSessionVisits(): Promise<number> {
    let deletedCount = 0;
    let nextToken: string | undefined;

    do {
        // Query for mock test records using the GSI
        const queryParams: any = {
            TableName: getSharedSessionVisitHistoryTable(),
            IndexName: 'test-shared-sessions-visits-index',
            KeyConditionExpression: 'test_type = :testType',
            ExpressionAttributeValues: {
                ':testType': 'mock'
            },
            Limit: 50 // Process in batches
        };

        if (nextToken) {
            queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        }

        const result = await ddbDocClient.query(queryParams);
        const items = (result.Items || []) as any[];

        if (items.length === 0) break;

        // Batch delete in chunks of 25 (DynamoDB limit)
        const chunks = [] as any[][];
        for (let i = 0; i < items.length; i += 25) {
            chunks.push(items.slice(i, i + 25));
        }

        for (const chunk of chunks) {
            const deleteRequests = chunk.map((item: any) => {
                return {
                    DeleteRequest: {
                        Key: {
                            user_id_chat_app_id: item.user_id_chat_app_id,
                            share_id: item.share_id
                        }
                    }
                };
            });

            await ddbDocClient.batchWrite({
                RequestItems: {
                    [getSharedSessionVisitHistoryTable()]: deleteRequests
                }
            });

            deletedCount += chunk.length;
        }

        nextToken = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined;
    } while (nextToken);

    console.log(`Deleted ${deletedCount} mock test shared session visits`);
    return deletedCount;
}

export async function markSessionAsShared(sessionId: string, userId: string, shareId: string, shareCreatedByUserId: string): Promise<void> {
    await ddbDocClient.update({
        TableName: getChatSessionTable(),
        Key: {
            user_id: userId,
            session_id: sessionId
        },
        UpdateExpression: 'SET share_id = :shareId, share_date = :shareDate, share_created_by_user_id = :shareCreatedByUserId',
        ExpressionAttributeValues: {
            ':shareId': shareId,
            ':shareDate': new Date().toISOString(),
            ':shareCreatedByUserId': shareCreatedByUserId
        }
    });
}

export async function getChatSessionByShareId(shareId: string): Promise<ChatSession<RecordOrUndef> | undefined> {
    const result = await ddbDocClient.query({
        TableName: getChatSessionTable(),
        IndexName: 'shared-sessions-index',
        KeyConditionExpression: 'share_id = :shareId',
        ExpressionAttributeValues: {
            ':shareId': shareId
        },
        Limit: 1
    });

    if (!result.Items || result.Items.length === 0) {
        return undefined;
    }

    const sessionData = convertToCamelCase<ChatSession<RecordOrUndef>>(result.Items[0] as any);
    return sessionData;
}

// ===== BATCH OPERATIONS FOR PERFORMANCE =====

/**
 * Check if a DynamoDB error is retryable
 */
function isRetryableError(error: any): boolean {
    if (!error) return false;

    const errorCode = error.code || error.name || '';
    const retryableErrors = ['ProvisionedThroughputExceededException', 'RequestLimitExceeded', 'ServiceUnavailable', 'ThrottlingException', 'InternalServerError'];

    return retryableErrors.includes(errorCode);
}

/**
 * Batch get chat sessions by primary key (userId, sessionId) with retry logic.
 * Uses BatchGetItem for efficiency, processing in batches of 5.
 */
export async function batchGetChatSessionsByPrimaryKey(sessionKeys: { userId: string; sessionId: string }[]): Promise<ChatSession<RecordOrUndef>[]> {
    if (sessionKeys.length === 0) {
        return [];
    }

    // BatchGetItem limit is 100, but we'll use smaller batches for better performance
    const BATCH_SIZE = 5;
    const allSessions: ChatSession<RecordOrUndef>[] = [];

    // Process in chunks
    for (let i = 0; i < sessionKeys.length; i += BATCH_SIZE) {
        const chunk = sessionKeys.slice(i, i + BATCH_SIZE);

        const sessions = await pRetry(
            async () => {
                const keys = chunk.map(({ userId, sessionId }) => ({
                    user_id: userId,
                    session_id: sessionId
                }));

                const result = await ddbDocClient.batchGet({
                    RequestItems: {
                        [getChatSessionTable()]: {
                            Keys: keys
                        }
                    }
                });

                const sessions = (result.Responses?.[getChatSessionTable()] || []).map((item) =>
                    convertChatSessionToCamelFromSnakeCase<RecordOrUndef>(item as SnakeCase<ChatSession<RecordOrUndef>>)
                );

                // Handle unprocessed keys if any
                if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length > 0) {
                    console.warn('Some keys were unprocessed in batch get operation, will retry');
                    throw new HttpStatusError('Unprocessed keys detected', 500);
                }

                return sessions;
            },
            {
                retries: 3,
                factor: 2,
                minTimeout: 100,
                maxTimeout: 2000,
                onFailedAttempt: (error) => {
                    if (isRetryableError(error)) {
                        console.warn(`Batch get primary key attempt ${error.attemptNumber} failed, retrying:`, error.message);
                    } else {
                        console.warn('Non-retryable error in batch get:', error.message);
                        throw new AbortError(error.message);
                    }
                }
            }
        );

        allSessions.push(...sessions);
    }

    return allSessions;
}

/**
 * Get multiple chat sessions by shareId in parallel with controlled concurrency.
 * Uses individual GSI queries with 3 concurrent requests at a time.
 */
export async function batchGetChatSessionsByShareId(shareIds: string[]): Promise<ChatSession<RecordOrUndef>[]> {
    if (shareIds.length === 0) {
        return [];
    }

    const CONCURRENCY_LIMIT = 3;
    const allSessions: ChatSession<RecordOrUndef>[] = [];

    // Process shareIds in batches with concurrency control
    for (let i = 0; i < shareIds.length; i += CONCURRENCY_LIMIT) {
        const chunk = shareIds.slice(i, i + CONCURRENCY_LIMIT);

        const promises = chunk.map((shareId) =>
            pRetry(
                async () => {
                    const session = await getChatSessionByShareId(shareId);
                    return session;
                },
                {
                    retries: 3,
                    factor: 2,
                    minTimeout: 100,
                    maxTimeout: 2000,
                    onFailedAttempt: (error) => {
                        if (isRetryableError(error)) {
                            console.warn(`Get by shareId ${shareId} attempt ${error.attemptNumber} failed, retrying:`, error.message);
                        } else {
                            console.warn(`Non-retryable error for shareId ${shareId}:`, error.message);
                            throw new AbortError(error.message);
                        }
                    }
                }
            )
        );

        const results = await Promise.allSettled(promises);

        // Collect successful results
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                allSessions.push(result.value);
            } else if (result.status === 'rejected') {
                console.warn('Failed to get session by shareId:', result.reason);
            }
        }
    }

    return allSessions;
}
