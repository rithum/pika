import type { APIGatewayProxyStructuredResultV2, DynamoDBRecord } from 'aws-lambda';
import { createHash } from 'crypto';
import type {
    ChatSession,
    ChatUser,
    ConverseInvocationMode,
    PinnedSession,
    PinnedSessionDynamoDb,
    RecordOrUndef,
    SessionDataWithChatUserCustomDataSpreadIn,
    SharedSessionVisitHistory,
    SharedSessionVisitHistoryDynamoDb,
    UserMemoryStrategy,
    UserType,
    ValidateShareAccessResponse
} from 'pika-shared/types/chatbot/chatbot-types';
import { convertToCamelCase, convertToSnakeCase, type SnakeCase } from 'pika-shared/util/chatbot-shared-utils';

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

let memoryStrategies: Partial<Record<UserMemoryStrategy, string>> | undefined;

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

export function getMemoryId(): string {
    return getFromEnv('MEMORY_ID');
}

export function getMemoryStrategies(): Partial<Record<UserMemoryStrategy, string>> {
    if (!memoryStrategies) {
        memoryStrategies = JSON.parse(getFromEnv('MEMORY_STRATEGIES')) as Partial<Record<UserMemoryStrategy, string>>;
    }
    return memoryStrategies;
}

export function isDevLikeEnv(): boolean {
    const stage = getEnv();
    return stage.includes('dev') || stage.includes('test');
}

export function getSharedSessionVisitHistoryTable(): string {
    return getFromEnv('SHARED_SESSION_VISIT_HISTORY_TABLE');
}

export function getPinnedSessionTable(): string {
    return getFromEnv('PINNED_SESSION_TABLE');
}

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
export function convertChatUserToSnakeFromCamelCase(user: ChatUser<RecordOrUndef>): any {
    const { customData, ...userWithoutCustomData } = user;

    // Convert everything except customData
    const converted = convertToSnakeCase<ChatUser<RecordOrUndef>>(userWithoutCustomData);

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
    const { sessionAttributes, sentContexts, ...sessionWithoutAttributes } = session;

    // Convert everything except sessionAttributes and sentContexts
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

    // Handle sentContexts: preserve sourceId keys, convert record values to snake_case
    if (sentContexts !== undefined) {
        (converted as any).sent_contexts = Object.fromEntries(
            Object.entries(sentContexts).map(([sourceId, record]) => [
                sourceId, // Preserve sourceId key as-is
                convertToSnakeCase(record) // Convert SentContextRecord fields to snake_case
            ])
        );
    }

    return converted as SnakeCase<ChatSession<T>>;
}

// Convert ChatSession from snake_case (from OpenSearch) to camelCase
export function convertChatSessionToCamelFromSnakeCase<T extends RecordOrUndef = undefined>(session: SnakeCase<ChatSession<T>>): ChatSession<T> {
    const { session_attributes, chat_app_sk, sent_contexts, ...sessionWithoutAttributes } = session as any;

    // Convert everything except session_attributes, chat_app_sk (internal GSI field), and sent_contexts
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

    // Handle sent_contexts: preserve sourceId keys, convert record values to camelCase
    if (sent_contexts !== undefined) {
        (converted as any).sentContexts = Object.fromEntries(
            Object.entries(sent_contexts).map(([sourceId, record]: [string, any]) => [
                sourceId, // Preserve sourceId key as-is
                convertToCamelCase(record) // Convert SentContextRecord fields to camelCase
            ])
        );
    }

    // Normalize account ID onto the top-level session row for admin tables.
    const sessionAttributes = (converted as any).sessionAttributes as Record<string, unknown> | undefined;
    const normalizedAccountId = getNormalizedAccountId(sessionAttributes);
    if (normalizedAccountId) {
        (converted as any).accountId = normalizedAccountId;
    }

    return converted as ChatSession<T>;
}

const DEFAULT_ACCOUNT_ID_FIELD_NAMES = ['accountId', 'account_id'];

/**
 * Returns the list of field names used to resolve an account ID from session data.
 * Reads from the `PIKA_ACCOUNT_ID_FIELD_NAMES` environment variable (comma-separated).
 * Falls back to `['accountId', 'account_id']` when the env var is not set.
 */
export function getAccountIdFieldNames(): string[] {
    const envVal = process.env.PIKA_ACCOUNT_ID_FIELD_NAMES;
    return envVal ? envVal.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ACCOUNT_ID_FIELD_NAMES;
}

/**
 * Returns true when the session already carries an account ID in any recognised field,
 * so the backfill step can be skipped for existing sessions.
 * Checks top-level fields, sessionAttributes fields, and the nested `account` object.
 * Uses `getAccountIdFieldNames()` so `PIKA_ACCOUNT_ID_FIELD_NAMES` controls resolution.
 */
export function hasSessionAccountContext(session: ChatSession<RecordOrUndef>): boolean {
    const fieldNames = getAccountIdFieldNames();
    const sessionRecord = session as unknown as Record<string, unknown>;

    // Check top-level fields first
    for (const field of fieldNames) {
        const v = sessionRecord[field];
        if (typeof v === 'string' && v.length > 0) return true;
        if (typeof v === 'number') return true;
    }

    const sessionAttributes = (sessionRecord.sessionAttributes as Record<string, unknown> | undefined) ?? undefined;

    // Check sessionAttributes fields
    if (sessionAttributes) {
        for (const field of fieldNames) {
            const v = sessionAttributes[field];
            if (typeof v === 'string' && v.length > 0) return true;
            if (typeof v === 'number') return true;
        }
    }

    // Fall back to nested account object (account.id, account.accountId, account.account_id)
    const accountObject = sessionAttributes?.account;
    if (accountObject && typeof accountObject === 'object' && !Array.isArray(accountObject)) {
        const accountRecord = accountObject as Record<string, unknown>;
        const nestedId = accountRecord.id ?? accountRecord.accountId ?? accountRecord.account_id;
        if (typeof nestedId === 'string' && nestedId.length > 0) return true;
        if (typeof nestedId === 'number') return true;
    }

    return false;
}

/**
 * Extracts the subset of user customData fields that are relevant to account context,
 * for backfilling onto sessions that don't yet have an account ID.
 * Includes all `getAccountIdFieldNames()` fields plus static metadata keys and the
 * nested `account` object.
 */
export function getAccountBackfillAttributes(customUserData: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!customUserData) {
        return {};
    }

    // Start with dynamic account ID field names (e.g. accountId, account_id, retailerId, supplierId, etc.)
    // then append the static metadata fields and the nested account object.
    const allowedKeys = [
        ...getAccountIdFieldNames(),
        'accountType',
        'account_type',
        'accountName',
        'account_name',
        'account'
    ];

    const attributes: Record<string, unknown> = {};
    for (const key of allowedKeys) {
        const value = customUserData[key];
        if (value !== undefined && value !== null) {
            attributes[key] = value;
        }
    }

    return attributes;
}

/**
 * Extracts a normalized account ID string from a session-attributes object.
 * Tries each field name in `accountIdFieldNames` (top-level keys first, then
 * the nested `account` sub-object's `id`/`accountId`/`account_id` fields).
 *
 * @param sessionAttributes - The session attributes record to inspect
 * @param accountIdFieldNames - Field names to try, in order. Defaults to `PIKA_ACCOUNT_ID_FIELD_NAMES`
 *   env var value, or `['accountId', 'account_id']` if not set.
 * @returns The first non-empty string (or stringified number) found, or undefined
 */
function getNormalizedAccountId(
    sessionAttributes: Record<string, unknown> | undefined,
    accountIdFieldNames: string[] = getAccountIdFieldNames()
): string | undefined {
    if (!sessionAttributes) {
        return undefined;
    }

    for (const fieldName of accountIdFieldNames) {
        const rawValue = sessionAttributes[fieldName];
        if (typeof rawValue === 'string' && rawValue.length > 0) {
            return rawValue;
        }
        if (typeof rawValue === 'number') {
            return String(rawValue);
        }
    }

    // Fall back to nested account object (account.id, account.accountId, account.account_id)
    const accountObject = sessionAttributes.account;
    if (accountObject && typeof accountObject === 'object' && !Array.isArray(accountObject)) {
        const accountRecord = accountObject as Record<string, unknown>;
        const nestedAccountId = accountRecord.id ?? accountRecord.accountId ?? accountRecord.account_id;
        if (typeof nestedAccountId === 'string' && nestedAccountId.length > 0) {
            return nestedAccountId;
        }
        if (typeof nestedAccountId === 'number') {
            return String(nestedAccountId);
        }
    }

    return undefined;
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

export function getMemoryNamespaceForStrategy(strategy: UserMemoryStrategy): string {
    return `/strategies/${strategy}/actors/{actorId}`;
}

export function getMemoryNamespaceForStrategyAndUserId(strategy: UserMemoryStrategy, userId: string): string {
    const namespace = getMemoryNamespaceForStrategy(strategy);
    return namespace.replace('{actorId}', userId);
}

export function convertPinnedSessionToCamelFromSnakeCaseFromDynamoDb(pinnedSession: SnakeCase<PinnedSessionDynamoDb>): PinnedSession {
    const result = convertToCamelCase<PinnedSession>(pinnedSession);

    delete (result as any).userIdChatAppId;
    delete (result as any).sessionOrShareId;

    return result;
}

export function convertPinnedSessionToSnakeFromCamelCaseForDynamoDb(userId: string, pinnedSession: PinnedSession): SnakeCase<PinnedSessionDynamoDb> {
    const partitionKey = `${userId}#${pinnedSession.chatAppId}`;
    const sessionOrShareId = pinnedSession.sessionId || pinnedSession.shareId!;

    if (pinnedSession.testType && pinnedSession.testType !== 'mock') {
        delete pinnedSession.testType;
    }

    if (!pinnedSession.pinnedAt) {
        pinnedSession.pinnedAt = new Date().toISOString();
    }

    return convertToSnakeCase<PinnedSessionDynamoDb>({ ...pinnedSession, userIdChatAppId: partitionKey, sessionOrShareId });
}

export function convertSharedSessionVisitHistoryToCamelFromSnakeCaseFromDynamoDb(
    sharedSessionVisitHistory: SnakeCase<SharedSessionVisitHistoryDynamoDb>
): SharedSessionVisitHistory {
    const result = convertToCamelCase<SharedSessionVisitHistory>(sharedSessionVisitHistory);

    delete (result as any).userIdChatAppId;

    return result;
}

export function convertSharedSessionVisitHistoryToSnakeFromCamelCaseForDynamoDb(
    userId: string,
    sharedSessionVisitHistory: SharedSessionVisitHistory
): SnakeCase<SharedSessionVisitHistoryDynamoDb> {
    const partitionKey = `${userId}#${sharedSessionVisitHistory.chatAppId}`;

    return convertToSnakeCase<SharedSessionVisitHistoryDynamoDb>({ ...sharedSessionVisitHistory, userIdChatAppId: partitionKey });
}

export function validateUserCanAccessSession(
    session: ChatSession<RecordOrUndef> | undefined,
    chatAppId: string,
    userType: UserType,
    userEntityId?: string
): ValidateShareAccessResponse {
    if (!session) {
        return { success: true, hasAccess: false, error: 'Shared session not found' };
    }

    if (!session.shareId) {
        return { success: true, hasAccess: false, error: 'Session is not a shared session' };
    }

    if (!session) {
        return { success: true, hasAccess: false, error: 'Shared session not found' };
    }

    if (session.shareRevokedDate) {
        return { success: true, hasAccess: false, error: 'This shared session has been revoked and is no longer available' };
    }

    if (session.chatAppId !== chatAppId) {
        return { success: true, hasAccess: false, error: 'Shared session not valid for this chat app' };
    }

    // External users must belong to the same entity
    if (session.entityId === 'chat-app-global') {
        // When entity feature is disabled, all users with chat app access can view
        return {
            success: true,
            hasAccess: true,
            sessionData: session
        };
    } else {
        if (userType === 'internal-user') {
            if (userEntityId && userEntityId !== session.entityId) {
                return { success: true, hasAccess: false, error: 'Access denied - user not in same organization' };
            }
            return { success: true, hasAccess: true, sessionData: session };
        } else if (userEntityId === session.entityId) {
            return {
                success: true,
                hasAccess: true,
                sessionData: session
            };
        } else {
            return { success: true, hasAccess: false, error: 'Access denied - user not in same organization' };
        }
    }
}

/**
 * Converts a TagDefinition object to snake_case for DynamoDB storage.
 * Preserves the keys within componentAgentInstructionsMd without converting them.
 * Only the componentAgentInstructionsMd field name gets converted to snake_case.
 * The keys inside (developer-defined instruction names like 'getCurrentWeather') remain as-is.
 */
export function convertTagDefinitionToSnakeFromCamelCase<T extends Record<string, any>>(tagDef: T): any {
    const { componentAgentInstructionsMd, ...tagDefWithoutInstructions } = tagDef as any;

    // Convert everything except componentAgentInstructionsMd
    const converted = convertToSnakeCase(tagDefWithoutInstructions);

    // Add componentAgentInstructionsMd back with snake_case key but preserve its keys structure
    if (componentAgentInstructionsMd !== undefined) {
        converted.component_agent_instructions_md = componentAgentInstructionsMd;
    }

    return converted;
}

/**
 * Converts a TagDefinition object from snake_case (from DynamoDB) to camelCase.
 * Preserves the keys within component_agent_instructions_md without converting them.
 * Only the field name gets converted (component_agent_instructions_md -> componentAgentInstructionsMd).
 * The keys inside (developer-defined instruction names like 'getCurrentWeather') remain as-is.
 */
export function convertTagDefinitionToCamelFromSnakeCase<T extends Record<string, any>>(tagDef: T): any {
    const tagDefAny = tagDef as any;
    const { component_agent_instructions_md, ...tagDefWithoutInstructions } = tagDefAny;

    // Convert everything except component_agent_instructions_md
    const converted = convertToCamelCase(tagDefWithoutInstructions);

    // Add componentAgentInstructionsMd back with camelCase key but preserve its keys structure
    if (component_agent_instructions_md !== undefined) {
        (converted as any).componentAgentInstructionsMd = component_agent_instructions_md;
    }

    return converted;
}

/** Escape XML special characters for use in XML text content. */
export function escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type ApiResponse = APIGatewayProxyStructuredResultV2;
