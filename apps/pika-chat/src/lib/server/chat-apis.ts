import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';
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
    CreateSharedSessionRequest,
    CreateSharedSessionResponse,
    DeleteUserWidgetDataResponse,
    GetChatSessionFeedbackResponse,
    GetChatUserPrefsResponse,
    GetPinnedSessionsRequest,
    GetPinnedSessionsResponse,
    GetRecentSharedRequest,
    GetRecentSharedResponse,
    GetUserWidgetDataResponse,
    PinSessionRequest,
    PinSessionResponse,
    RecordOrUndef,
    RecordShareVisitRequest,
    RecordShareVisitResponse,
    RevokeSharedSessionRequest,
    RevokeSharedSessionResponse,
    SearchAllMyMemoryRecordsRequest,
    SearchAllMyMemoryRecordsResponse,
    SetChatUserPrefsResponse,
    SetUserWidgetDataResponse,
    TagDefinitionSearchRequest,
    TagDefinitionSearchResponse,
    UnpinSessionRequest,
    UnpinSessionResponse,
    UnrevokeSharedSessionRequest,
    UnrevokeSharedSessionResponse,
    UserWidgetData,
    UserMemoryStrategy,
    UserPrefs,
    ValidateShareAccessRequest,
    ValidateShareAccessResponse
} from 'pika-shared/types/chatbot/chatbot-types';
import { convertToJwtString } from 'pika-shared/util/jwt';
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
        },
        errorInfo: {
            operation: 'getChatUser',
            resourceName: 'chat user',
            userId
        }
    });

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
        },
        errorInfo: {
            operation: 'searchForUser',
            resourceName: 'user search',
            userId
        }
    });

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
        },
        errorInfo: {
            operation: 'addOrUpdateChatUser',
            resourceName: 'chat user',
            userId: user.userId
        }
    });

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
        },
        errorInfo: {
            operation: 'addChatSessionFeedback',
            resourceName: 'chat session feedback',
            userId: user.userId
        }
    });

    return response.body.feedback;
}

export async function getFeedbackBySessionId(sessionId: string): Promise<ChatSessionFeedback[]> {
    const response = await invokeApi<GetChatSessionFeedbackResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/feedback/${sessionId}`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip'
        },
        errorInfo: {
            operation: 'getChatSessionFeedback',
            resourceName: 'chat session feedback'
        }
    });

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
        },
        errorInfo: {
            operation: 'getChatSessions',
            resourceName: 'chat sessions',
            userId
        }
    });

    return response.body.sessions;
}

export async function getChatMessages(sessionId: string, userId: string, shareId?: string, entityId?: string): Promise<ChatMessagesResponse> {
    const pathPart = shareId ? `/share/${shareId}${entityId ? `/entity/${entityId}` : ''}` : '';
    const response = await invokeApi<ChatMessagesResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/${sessionId}/messages${pathPart}`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        errorInfo: {
            operation: 'getChatMessages',
            resourceName: 'chat messages',
            userId
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
        },
        errorInfo: {
            operation: 'getChatUserPrefs',
            resourceName: 'user preferences',
            userId
        }
    });

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
        },
        errorInfo: {
            operation: 'setChatUserPrefs',
            resourceName: 'user preferences',
            userId
        }
    });

    return response.body.prefs!;
}

export async function getUserWidgetData(userId: string, scope: string, tag: string): Promise<UserWidgetData | undefined> {
    const response = await invokeApi<GetUserWidgetDataResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/widget/${scope}/${tag}/data`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        errorInfo: {
            operation: 'getUserWidgetData',
            resourceName: 'widget data',
            userId
        }
    });

    return response.body.data;
}

export async function setUserWidgetData(userId: string, scope: string, tag: string, data: UserWidgetData, partial: boolean): Promise<UserWidgetData> {
    const response = await invokeApi<SetUserWidgetDataResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/widget/${scope}/${tag}/data`,
        method: 'POST',
        body: { data, partial },
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        errorInfo: {
            operation: 'setUserWidgetData',
            resourceName: 'widget data',
            userId
        }
    });

    return response.body.data;
}

export async function deleteUserWidgetData(userId: string, scope: string, tag: string): Promise<void> {
    await invokeApi<DeleteUserWidgetDataResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/widget/${scope}/${tag}/data`,
        method: 'DELETE',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        errorInfo: {
            operation: 'deleteUserWidgetData',
            resourceName: 'widget data',
            userId
        }
    });
}

export async function searchTagDefinitions(userId: string, request: TagDefinitionSearchRequest): Promise<TagDefinitionSearchResponse> {
    // Generate cache key based on request parameters
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
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
        },
        errorInfo: {
            operation: 'searchTagDefinitions',
            resourceName: 'tag definitions',
            userId
        }
    });

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
        },
        errorInfo: {
            operation: 'getUserMemoriesForStrategy',
            resourceName: 'user memory records',
            userId
        }
    });

    return response.body;
}

// === SHARING-RELATED FUNCTIONS ===

export async function createSharedSession(user: ChatUser<RecordOrUndef>, request: CreateSharedSessionRequest): Promise<CreateSharedSessionResponse> {
    const response = await invokeApi<CreateSharedSessionResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/session/share`,
        method: 'POST',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: user.userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        body: request,
        errorInfo: {
            operation: 'createSharedSession',
            resourceName: 'shared session',
            userId: user.userId
        }
    });

    return response.body;
}

export async function revokeSharedSession(user: ChatUser<RecordOrUndef>, request: RevokeSharedSessionRequest): Promise<RevokeSharedSessionResponse> {
    const response = await invokeApi<RevokeSharedSessionResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/session/share`,
        method: 'DELETE',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: user.userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        body: request,
        errorInfo: {
            operation: 'revokeSharedSession',
            resourceName: 'shared session',
            userId: user.userId
        }
    });

    return response.body;
}

export async function unrevokeSharedSession(user: ChatUser<RecordOrUndef>, request: UnrevokeSharedSessionRequest): Promise<UnrevokeSharedSessionResponse> {
    const response = await invokeApi<UnrevokeSharedSessionResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/session/share/unrevoke`,
        method: 'POST',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: user.userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        body: request,
        errorInfo: {
            operation: 'unrevokeSharedSession',
            resourceName: 'shared session',
            userId: user.userId
        }
    });

    return response.body;
}
export async function getRecentSharedSessions(userId: string, chatAppId: string, entityId?: string, limit?: number): Promise<GetRecentSharedResponse> {
    const body: GetRecentSharedRequest = { chatAppId, limit, entityId };
    const response = await invokeApi<GetRecentSharedResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/session/share/recent`,
        method: 'POST',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        body,
        errorInfo: {
            operation: 'getRecentSharedSessions',
            resourceName: 'shared sessions',
            userId
        }
    });

    return response.body;
}

export async function getPinnedSessions(userId: string, chatAppId: string, limit?: number, nextToken?: string): Promise<GetPinnedSessionsResponse> {
    const body: GetPinnedSessionsRequest = { chatAppId, limit, nextToken };

    if (!body.limit) {
        body.limit = 20;
    }

    const response = await invokeApi<GetPinnedSessionsResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/session/pinned/search`,
        method: 'POST',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        body,
        errorInfo: {
            operation: 'getPinnedSessions',
            resourceName: 'pinned sessions',
            userId
        }
    });

    return response.body;
}

export async function pinSession(user: ChatUser<RecordOrUndef>, request: PinSessionRequest): Promise<PinSessionResponse> {
    const response = await invokeApi<PinSessionResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/session/pinned`,
        method: 'POST',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: user.userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        body: request,
        errorInfo: {
            operation: 'pinSession',
            resourceName: 'pinned session',
            userId: user.userId
        }
    });

    return response.body;
}

export async function unpinSession(user: ChatUser<RecordOrUndef>, request: UnpinSessionRequest): Promise<UnpinSessionResponse> {
    const response = await invokeApi<UnpinSessionResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/session/pinned`,
        method: 'DELETE',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: user.userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        body: request,
        errorInfo: {
            operation: 'unpinSession',
            resourceName: 'pinned session',
            userId: user.userId
        }
    });

    return response.body;
}

export async function validateShareAccess(user: ChatUser<RecordOrUndef>, shareId: string, chatAppId: string, entityId?: string): Promise<ValidateShareAccessResponse> {
    const body: ValidateShareAccessRequest = { shareId, chatAppId, entityId };
    const response = await invokeApi<ValidateShareAccessResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/session/share/access`,
        method: 'POST',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<RecordOrUndef>({ userId: user.userId, customUserData: user.customData }, appConfig.jwtSecret)}`
        },
        body,
        errorInfo: {
            operation: 'validateShareAccess',
            resourceName: 'shared session',
            userId: user.userId
        }
    });

    return response.body;
}

export async function recordShareVisit(userId: string, shareId: string): Promise<RecordShareVisitResponse> {
    const body: RecordShareVisitRequest = { shareId };
    const response = await invokeApi<RecordShareVisitResponse>({
        apiId: appConfig.chatApiId,
        path: `${appConfig.stage}/api/chat/session/share/visit`,
        method: 'POST',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        body,
        errorInfo: {
            operation: 'recordShareVisit',
            resourceName: 'shared session',
            userId
        }
    });

    return response.body;
}
