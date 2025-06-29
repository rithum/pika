import type { ChatMessage, ChatMessageUsage, ChatSession, ChatUser, ChatUserLite } from '@pika/shared/types/chatbot/chatbot-types';
import { convertToCamelCase, convertToSnakeCase, type SnakeCase } from '@pika/shared/util/chatbot-shared-utils';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import { getChatMessagesTable, getChatSessionTable, getChatUserTable, convertChatUserToCamelFromSnakeCase, convertChatUserToSnakeFromCamelCase } from './utils';

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
    const userItem = user.Item as SnakeCase<ChatUser>;
    delete (userItem as any).userIdPrefix;
    delete (userItem as any).userIdLower;

    return userItem ? convertChatUserToCamelFromSnakeCase(userItem) : undefined;
}

export async function addUser(user: ChatUser): Promise<ChatUser> {
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

/**
 * You must have verified that the user exists before calling this function.
 */
export async function updateUser(user: ChatUser): Promise<ChatUser> {
    if (!user.createDate) {
        throw new Error('User create date is required');
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

export async function getUserSessionsByUserId(userId: string): Promise<ChatSession[]> {
    const sessions = await ddbDocClient.query({
        TableName: getChatSessionTable(),
        KeyConditionExpression: 'user_id = :userId',
        ExpressionAttributeValues: {
            ':userId': userId
        }
    });

    return (sessions.Items || []).map((item) => convertToCamelCase<ChatSession>(item as SnakeCase<ChatSession>));
}

export async function getSessionsByUserIdAndChatAppId(userId: string, chatAppId: string): Promise<ChatSession[]> {
    const sessions = await ddbDocClient.query({
        TableName: getChatSessionTable(),
        IndexName: 'user-chat-app-index',
        KeyConditionExpression: 'user_id = :userId and chat_app_id = :chatAppId',
        ExpressionAttributeValues: {
            ':userId': userId,
            ':chatAppId': chatAppId
        }
    });

    return (sessions.Items || []).map((item) => convertToCamelCase<ChatSession>(item as SnakeCase<ChatSession>));
}

export async function getChatSessionByUserIdAndSessionId(userId: string, sessionId: string): Promise<ChatSession | undefined> {
    const session = await ddbDocClient.get({
        TableName: getChatSessionTable(),
        Key: {
            user_id: userId,
            session_id: sessionId
        }
    });

    return session.Item ? convertToCamelCase<ChatSession>(session.Item as SnakeCase<ChatSession>) : undefined;
}

export async function addChatSession(chatSession: ChatSession): Promise<ChatSession> {
    await ddbDocClient.put({
        TableName: getChatSessionTable(),
        Item: convertToSnakeCase<ChatSession>(chatSession)
    });

    return chatSession;
}

export async function addMessage(chatMessage: ChatMessage): Promise<void> {
    const message = convertToSnakeCase<ChatMessage>(chatMessage);
    await ddbDocClient.put({
        TableName: getChatMessagesTable(),
        Item: message
    });
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

export async function updateSessionTitleInDdb(sessionId: string, userId: string, title: string): Promise<ChatSession> {
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
        throw new Error(`Session not found for userId ${userId} and sessionId ${sessionId}`);
    }

    return session;
}
