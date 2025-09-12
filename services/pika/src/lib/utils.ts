import type { DynamoDBRecord } from 'aws-lambda';
import { createHash } from 'crypto';
import type { ChatSession, ChatUser, ConverseInvocationMode, RecordOrUndef, SessionDataWithChatUserCustomDataSpreadIn } from 'pika-shared/types/chatbot/chatbot-types';
import { convertToCamelCase, convertToSnakeCase, type SnakeCase } from 'pika-shared/util/chatbot-shared-utils';
import { type ChatSessionOs } from './opensearch/types';

export function createSessionToken(sessionId: string, userId: string) {
    return createHash('sha256')
        .update(sessionId + ':' + userId)
        .digest('hex');
}

export function validateSessionToken(token: string, sessionId: string, companyId: string, userId: string) {
    return (
        createHash('sha256')
            .update(sessionId + ':' + companyId + ':' + userId)
            .digest('hex') === token
    );
}

export function getFromEnv(key: string, defaultValue?: string) {
    const value = process.env[key];
    if (!value) {
        if (defaultValue) {
            return defaultValue;
        }
        throw new Error(`Environment variable ${key} is not set.`);
    }
    return value;
}

export function getEnv(): string {
    return getFromEnv('stage');
}

export function getRegion(): string {
    return getFromEnv('AWS_REGION', 'us-east-1');
}

export function getChatMessagesTable(): string {
    return getFromEnv('CHAT_MESSAGES_TABLE');
}

export function getChatSessionTable(): string {
    return getFromEnv('CHAT_SESSION_TABLE');
}

export function getChatSessionFeedbackTable(): string {
    return getFromEnv('CHAT_SESSION_FEEDBACK_TABLE');
}

export function getChatUserTable(): string {
    return getFromEnv('CHAT_USER_TABLE');
}

export function getPikaDomainEndpoint(): string {
    return getFromEnv('PIKA_DOMAIN_ENDPOINT');
}

export function isDevLikeEnv(): boolean {
    const stage = getEnv();
    return stage.includes('dev') || stage.includes('test');
}

// export function getAgentId(): string {
//     return getFromEnv('AGENT_ID');
// }

// export function getAgentAliasId(): string {
//     return getFromEnv('AGENT_ALIAS_ID');
// }

/**
 * Extracts the message id from the message id string and increments it by 1.
 * If the message id is not provided, it returns 1.
 *
 * @param messageId The message id string.
 * @returns The incremented message id.
 */
export function extractAndIncrementMessageId(messageId?: string): number {
    if (!messageId) return 1;
    const parts = messageId.split(':');
    const lastId = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    return lastId + 1;
}

/**
 * Creates a message id string from the session id and the message number.
 * The exact format is sessionId:messageNum where messageNum is a 5 digit number
 * padded with leading zeros.
 *
 * @param sessionId The session id.
 * @param messageNum The message number.
 * @returns The message ID.
 */
export function createMessageId(sessionId: string, messageNum: number): string {
    return `${sessionId}:${String(messageNum).padStart(5, '0')}`;
}

/**
 * Gets the next message id for a given session.
 *
 * @param sessionId The session id.
 * @param messageId The message id.
 * @returns The next message id.
 */
export function getNextMessageId(sessionId: string, messageId?: string): string {
    const messageNum = extractAndIncrementMessageId(messageId);
    return createMessageId(sessionId, messageNum);
}

/**
 * Removes sensitive properties from an Error object and converts it to a string
 */
export function sanitizeAndStringifyError(error: unknown): string {
    let sanitized: Record<string, unknown>;
    if (!(error instanceof Error || typeof error === 'object') || error === null) {
        sanitized = { message: String(error) };
    } else {
        sanitized = Object.getOwnPropertyNames(error).reduce<Record<string, unknown>>((acc, prop) => {
            // Remove stack and private properties
            if (prop !== 'stack' && !prop.startsWith('$')) {
                acc[prop] = (error as unknown as Record<string, unknown>)[prop];
            }
            return acc;
        }, {});
    }

    return JSON.stringify(sanitized);
}

/**
 * Checks if a DynamoDB stream record represents a TTL deletion.
 * TTL deletions have specific userIdentity values that identify them as service-initiated deletions.
 *
 * @param record - The DynamoDB stream record to check
 * @returns true if the deletion was caused by TTL expiration, false otherwise
 */
export function isTTLDeletion(record: DynamoDBRecord): boolean {
    return record.userIdentity?.type === 'Service' && record.userIdentity?.principalId === 'dynamodb.amazonaws.com';
}

/**
 * Recursively converts Date objects to ISO strings in an object
 * This is needed because AWS Bedrock returns Date objects in trace metadata
 * but DynamoDB marshalling doesn't support Date objects
 *
 * Example:
 * Input: { metadata: { endTime: new Date('2025-06-18T21:55:25.326Z') } }
 * Output: { metadata: { endTime: '2025-06-18T21:55:25.326Z' } }
 */
export function convertDatesToStrings(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (obj instanceof Date) {
        return obj.toISOString();
    }

    if (Array.isArray(obj)) {
        return obj.map(convertDatesToStrings);
    }

    if (typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = convertDatesToStrings(value);
        }
        return result;
    }

    return obj;
}

/**
 * Converts a ChatUser object to snake_case for DynamoDB storage.
 * Preserves the customData value without converting its internal structure.
 * Only the customData key name gets converted (customData -> custom_data).
 */
export function convertChatUserToSnakeFromCamelCase(user: ChatUser): any {
    const { customData, ...userWithoutCustomData } = user;

    // Convert everything except customData
    const converted = convertToSnakeCase<ChatUser>(userWithoutCustomData);

    // Add customData back with snake_case key but preserve its value structure
    if (customData !== undefined) {
        converted.custom_data = customData;
    }

    return converted;
}

/**
 * Converts a ChatUser object from snake_case (from DynamoDB) to camelCase.
 * Preserves the customData value without converting its internal structure.
 * Only the custom_data key name gets converted (custom_data -> customData).
 */
export function convertChatUserToCamelFromSnakeCase(user: SnakeCase<ChatUser>): ChatUser {
    const { custom_data, ...userWithoutCustomData } = user;

    // Convert everything except custom_data
    const converted = convertToCamelCase<ChatUser>(userWithoutCustomData);

    // Add customData back with camelCase key but preserve its value structure
    if (custom_data !== undefined) {
        converted.customData = custom_data;
    }

    return converted as ChatUser;
}

// Convert ChatSession to snake_case for OpenSearch storage
export function convertChatSessionToSnakeFromCamelCase<T extends RecordOrUndef = undefined>(session: ChatSession<T>): SnakeCase<ChatSession<T>> {
    const { sessionAttributes, ...sessionWithoutAttributes } = session;

    // Convert everything except sessionAttributes
    const converted = convertToSnakeCase(sessionWithoutAttributes as any) as any;

    // Add sessionAttributes back with snake_case key but preserve custom data structure
    if (sessionAttributes !== undefined) {
        // Extract ALL known SessionAttributes fields (not just the ones I originally listed)
        const { firstName, lastName, timezone, token, userId, chatAppId, agentId, currentDate, ...customData } = sessionAttributes;

        // Convert known SessionAttributes fields to snake_case
        (converted as any).session_attributes = {
            ...(firstName !== undefined && { first_name: firstName }),
            ...(lastName !== undefined && { last_name: lastName }),
            ...(timezone !== undefined && { timezone: timezone }), // Already snake_case
            ...(token !== undefined && { token: token }), // Already snake_case
            user_id: userId,
            chat_app_id: chatAppId,
            agent_id: agentId,
            current_date: currentDate,
            ...customData // Preserve custom data keys and values as-is (this is the T generic spread)
        };
    }

    return converted as SnakeCase<ChatSession<T>>;
}

// Convert ChatSession from snake_case (from OpenSearch) to camelCase
export function convertChatSessionToCamelFromSnakeCase<T extends RecordOrUndef = undefined>(session: SnakeCase<ChatSession<T>>): ChatSession<T> {
    const { session_attributes, ...sessionWithoutAttributes } = session;

    // Convert everything except session_attributes
    const converted = convertToCamelCase(sessionWithoutAttributes as any) as any;

    // Add sessionAttributes back with camelCase key but preserve custom data structure
    if (session_attributes !== undefined) {
        // Extract ALL known SessionAttributes fields from snake_case
        const { first_name, last_name, timezone, token, user_id, chat_app_id, agent_id, current_date, ...customData } = session_attributes as any;

        // Convert known fields back to camelCase, preserve custom data
        (converted as any).sessionAttributes = {
            ...(first_name !== undefined && { firstName: first_name }),
            ...(last_name !== undefined && { lastName: last_name }),
            ...(timezone !== undefined && { timezone: timezone }), // Already camelCase
            ...(token !== undefined && { token: token }), // Already camelCase
            userId: user_id,
            chatAppId: chat_app_id,
            agentId: agent_id,
            currentDate: current_date,
            ...customData // Preserve custom data keys and values as-is (this is the T generic spread)
        } as SessionDataWithChatUserCustomDataSpreadIn<T>;
    }

    return converted as ChatSession<T>;
}

/**
 * Extracts a value from custom data using a dot-notation path.
 * Supports nested object traversal like "account.company.id".
 *
 * @param customData - The custom data object to extract from
 * @param customDataFieldPathToMatchUsersEntity - Dot-notation path to the field (e.g., "account.company.id")
 * @returns The value at the specified path, or undefined if not found
 */
export function getEntityFromCustomData(customData: Record<string, any> | undefined, customDataFieldPathToMatchUsersEntity: string): string | undefined {
    if (!customData) {
        console.log(
            `[getEntityFromCustomData] No customData attribute found on user, so returning undefined.  This could be a bug in the Pika config since we only call this when we want to find the user's entity.`
        );
        return undefined;
    }

    // Split the path by dots to handle nested properties
    const pathSegments = customDataFieldPathToMatchUsersEntity.split('.');
    let current: any = customData;

    // Traverse the nested path
    for (const segment of pathSegments) {
        if (current == null || typeof current !== 'object') {
            return undefined;
        }
        current = current[segment];
    }

    // Return the value if it's a string, or convert to string if it's a primitive
    if (typeof current === 'string') {
        return current;
    } else if (typeof current === 'number' || typeof current === 'boolean') {
        return String(current);
    }

    return undefined;
}

export function getEffectiveChatAppId(chatAppId: string | undefined, agentId: string, mode: ConverseInvocationMode): string {
    return mode === 'direct-agent-invoke' ? `direct-agent-${agentId}` : chatAppId!;
}
