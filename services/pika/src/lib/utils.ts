import { DynamoDBRecord } from 'aws-lambda';
import { createHash } from 'crypto';

export function createSessionToken(sessionId: string, companyId: string, userId: string) {
    return createHash('sha256')
        .update(sessionId + ':' + companyId + ':' + userId)
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

export function getRegion(): string {
    return getFromEnv('AWS_REGION', 'us-east-1');
}

export function getChatMessagesTable(): string {
    return getFromEnv('CHAT_MESSAGES_TABLE', 'chat-messages-table');
}

export function getChatSessionTable(): string {
    return getFromEnv('CHAT_SESSION_TABLE', 'chat-session-table');
}

export function getChatUserTable(): string {
    return getFromEnv('CHAT_USER_TABLE', 'chat-user-table');
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
