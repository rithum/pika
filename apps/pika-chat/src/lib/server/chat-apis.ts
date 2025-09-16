import type {
    AddChatSessionFeedbackRequest,
    AddChatSessionFeedbackResponse,
    ChatMessagesResponse,
    ChatSession,
    ChatSessionFeedback,
    ChatSessionFeedbackForCreate,
    ChatSessionsResponse,
    ChatUser,
    ChatUserAddOrUpdateResponse,
    ChatUserLite,
    ChatUserResponse,
    ChatUserSearchResponse,
    GetChatSessionFeedbackResponse,
    GetChatUserPrefsResponse,
    RecordOrUndef,
    SetChatUserPrefsResponse,
    TagDefinitionSearchRequest,
    TagDefinitionSearchResponse,
    UserPrefs,
    UserMemoryStrategy,
    SearchAllMyMemoryRecordsRequest,
    SearchAllMyMemoryRecordsResponse
} from 'pika-shared/types/chatbot/chatbot-types';
import { convertToJwtString } from 'pika-shared/util/jwt';
import { hash } from 'crypto';
import { LRUCache } from 'lru-cache';
import { appConfig } from './config';
import { invokeApi } from './invoke-api';

const tagDefinitionsCache = new LRUCache({
    max: 50,
    maxSize: 25000,
    ttl: 1000 * 60 * 10, // 10 minutes for tag definitions
    ttlAutopurge: true,
    sizeCalculation: (value, key) => {
        return 1;
    }
});

export async function getChatUser<T extends RecordOrUndef = undefined>(userId: string): Promise<ChatUser<T> | undefined> {
    const response = await invokeApi<ChatUserResponse<T>>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/user`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        }
    });

    if (!response.body || !response.body.success) {
        throw new Error(`Error getting user from chat database for userId ${userId} with status code: ${response.statusCode} and error: ${response.body?.error}`);
    }

    return response.body.user;
}

export async function searchForUser(userId: string, partialUserId: string): Promise<ChatUserLite[]> {
    const response = await invokeApi<ChatUserSearchResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/user/search/${partialUserId}`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        }
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error searching for users for userId ${userId} using partialUserId ${partialUserId} with status code: ${response.statusCode} and error: ${response.body?.error}`
        );
    }

    return response.body.users;
}

export async function createChatUser<T extends RecordOrUndef = undefined>(user: ChatUser<T>): Promise<ChatUser<T>> {
    const response = await invokeApi<ChatUserAddOrUpdateResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/user`,
        method: 'POST',
        body: user,
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<T>({ userId: user.userId, customUserData: user.customData }, appConfig.jwtSecret)}`
        }
    });

    if (!response.body || !response.body.success) {
        throw new Error(`Error creating user in chat database for userId ${user.userId} with status code: ${response.statusCode} and error: ${response.body?.error}`);
    }

    return response.body.user as ChatUser<T>;
}

export async function addFeedback<T extends RecordOrUndef = undefined>(user: ChatUser<T>, feedback: ChatSessionFeedbackForCreate): Promise<ChatSessionFeedback> {
    const request: AddChatSessionFeedbackRequest = {
        feedback: feedback
    };
    const response = await invokeApi<AddChatSessionFeedbackResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/feedback`,
        method: 'POST',
        body: request,
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<T>({ userId: user.userId, customUserData: user.customData }, appConfig.jwtSecret)}`
        }
    });

    if (!response.body || !response.body.success) {
        throw new Error(`Error adding feedback for userId ${user.userId} with status code: ${response.statusCode} and error: ${response.body?.error}`);
    }

    return response.body.feedback;
}

export async function getFeedbackBySessionId(sessionId: string): Promise<ChatSessionFeedback[]> {
    const response = await invokeApi<GetChatSessionFeedbackResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/feedback/${sessionId}`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip'
        }
    });

    if (!response.body || !response.body.success) {
        throw new Error(`Error getting feedback for sessionId ${sessionId} with status code: ${response.statusCode} and error: ${response.body?.error}`);
    }

    return response.body.feedback;
}

export async function getChatSessions(userId: string, chatAppId: string): Promise<ChatSession<RecordOrUndef>[]> {
    const response = await invokeApi<ChatSessionsResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/conversations/${chatAppId}`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        }
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error getting sessions from chat database for userId ${userId} and chatAppId ${chatAppId} with status code: ${response.statusCode} and error: ${response.body?.error} and body: ${JSON.stringify(response.body)}`
        );
    }

    return response.body.sessions;
}

export async function getChatMessages(sessionId: string, userId: string): Promise<ChatMessagesResponse> {
    const response = await invokeApi<ChatMessagesResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/${sessionId}/messages`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        }
    });
    return response.body;
}

export async function getUserPrefs(userId: string): Promise<UserPrefs | undefined> {
    const response = await invokeApi<GetChatUserPrefsResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/user/prefs`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        }
    });

    if (!response.body || !response.body.success) {
        throw new Error(`Error getting user prefs for userId ${userId} with status code: ${response.statusCode} and error: ${response.body?.error}`);
    }

    return response.body.prefs;
}

export async function setUserPrefs(userId: string, prefs: UserPrefs, partial: boolean): Promise<UserPrefs> {
    const response = await invokeApi<SetChatUserPrefsResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/user/prefs`,
        method: 'POST',
        body: { prefs, partial },
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        }
    });

    if (!response.body || !response.body.success) {
        throw new Error(`Error setting user prefs for userId ${userId} with status code: ${response.statusCode} and error: ${response.body?.error}`);
    }

    return response.body.prefs!;
}

export async function searchTagDefinitions(userId: string, request: TagDefinitionSearchRequest): Promise<TagDefinitionSearchResponse> {
    // Generate cache key based on request parameters
    const requestHash = hash('sha256', JSON.stringify(request));
    const cacheKey = `search:chat:${requestHash}`;

    // Check if any tag definition has dontCacheThis set to true
    const cachedResponse = tagDefinitionsCache.get(cacheKey) as TagDefinitionSearchResponse | undefined;
    if (cachedResponse && !cachedResponse.tagDefinitions.some((def) => def.dontCacheThis)) {
        return cachedResponse;
    }

    const response = await invokeApi<TagDefinitionSearchResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/tagdef/search`,
        method: 'POST',
        body: request,
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        }
    });

    if (!response.body || !response.body.success) {
        throw new Error(`Error searching tag definitions with status code: ${response.statusCode}`);
    }

    // Cache the response only if no tag definition has dontCacheThis set
    if (!response.body.tagDefinitions.some((def) => def.dontCacheThis)) {
        tagDefinitionsCache.set(cacheKey, response.body);
    }

    return response.body;
}

/**
 * Get user memory records
 */
export async function getUserMemoriesForStrategy(userId: string, strategy: UserMemoryStrategy, nextToken?: string): Promise<SearchAllMyMemoryRecordsResponse> {
    const request: SearchAllMyMemoryRecordsRequest = {
        strategy,
        nextToken
    };

    const response = await invokeApi<SearchAllMyMemoryRecordsResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/memory/record/search`,
        method: 'POST',
        body: request,
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        }
    });

    if (!response.body || !response.body.success) {
        throw new Error(`Error retrieving user memory with status code: ${response.statusCode}`);
    }

    return response.body;
}
