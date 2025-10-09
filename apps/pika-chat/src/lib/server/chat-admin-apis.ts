import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';
import {
    ClearSvelteKitCacheTypes,
    type AddChatSessionFeedbackResponse,
    type AgentDefinition,
    type AuthenticatedUser,
    type ChatApp,
    type ChatAppOverride,
    type ChatAppOverrideForCreateOrUpdate,
    type ChatSessionFeedback,
    type ChatSessionFeedbackForCreate,
    type ChatSessionFeedbackForUpdate,
    type ClearSvelteKitCacheType,
    type CreateOrUpdateChatAppOverrideResponse,
    type DeleteChatAppOverrideResponse,
    type GetChatAppsByRulesRequest,
    type GetChatAppsByRulesResponse,
    type GetInstructionsAddedForUserMemoryRequest,
    type GetInstructionsAddedForUserMemoryResponse,
    type InstructionAssistanceConfig,
    type RecordOrUndef,
    type SearchAllMemoryRecordsRequest,
    type SearchAllMemoryRecordsResponse,
    type SearchSemanticDirectivesRequest,
    type SearchSemanticDirectivesResponse,
    type SemanticDirectiveCreateOrUpdateRequest,
    type SemanticDirectiveCreateOrUpdateResponse,
    type SemanticDirectiveDeleteRequest,
    type SemanticDirectiveDeleteResponse,
    type SessionSearchRequest,
    type SessionSearchResponse,
    type TagDefinitionCreateOrUpdateRequest,
    type TagDefinitionCreateOrUpdateResponse,
    type TagDefinitionDeleteRequest,
    type TagDefinitionDeleteResponse,
    type TagDefinitionSearchRequest,
    type TagDefinitionSearchResponse,
    type ToolDefinition,
    type UpdateChatSessionFeedbackResponse,
    type UserChatAppRule,
    type UserMemoryStrategy
} from 'pika-shared/types/chatbot/chatbot-types';
import { getInstructionsAssistanceConfigFromRawSsmParams } from 'pika-shared/util/instruction-assistance-utils';
import { convertToJwtString } from 'pika-shared/util/jwt';
import { appConfig } from './config';
import { KeyManagerFactory } from './encryption/KeyManagerFactory';
import { invokeApi } from './invoke-api';
import { getParametersByPath } from './ssm';

const chatAppCache = new LRUCache({
    max: 100,
    maxSize: 50000,
    ttl: 1000 * 60 * 5, // 5 minutes
    ttlAutopurge: true,
    sizeCalculation: (value, key) => {
        return 1;
    }
});

const tagDefinitionsCache = new LRUCache({
    max: 50,
    maxSize: 25000,
    ttl: 1000 * 60 * 10, // 10 minutes for tag definitions
    ttlAutopurge: true,
    sizeCalculation: (value, key) => {
        return 1;
    }
});

const instructionAssistanceConfigCache = new LRUCache({
    max: 1,
    maxSize: 1,
    ttl: 1000 * 60 * 60 * 1, // 1 hour
    ttlAutopurge: true,
    sizeCalculation: (value, key) => {
        return 1;
    }
});

export async function getAllChatApps(): Promise<ChatApp[]> {
    const response = await invokeApi({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/chat-app`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: 'site-admin', customUserData: undefined }, appConfig.jwtSecret)}`
        },
        errorInfo: {
            operation: 'getAllChatApps',
            resourceName: 'chat apps'
        }
    });

    return response.body.chatApps;
}

export async function getAllAgents(): Promise<AgentDefinition[]> {
    const response = await invokeApi({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/agent`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: 'site-admin', customUserData: undefined }, appConfig.jwtSecret)}`
        },
        errorInfo: {
            operation: 'getAllAgents',
            resourceName: 'agents'
        }
    });

    return response.body.agents;
}

export async function getAllTools(): Promise<ToolDefinition[]> {
    const response = await invokeApi({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/tool`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: 'site-admin', customUserData: undefined }, appConfig.jwtSecret)}`
        },
        errorInfo: {
            operation: 'getAllTools',
            resourceName: 'tools'
        }
    });

    return response.body.tools;
}

export async function getChatApp(chatAppId: string): Promise<ChatApp | undefined> {
    const response = await invokeApi({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/chat-app/${chatAppId}`,
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: chatAppId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        errorInfo: {
            operation: 'getChatApp',
            resourceName: 'chat app'
        }
    });

    return response.body.chatApp;
}

export async function getAgent(agentId: string): Promise<AgentDefinition | undefined> {
    const response = await invokeApi<{ success: boolean; agent?: AgentDefinition; error?: string }>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/agent/${agentId}`,
        method: 'GET',
        errorInfo: {
            operation: 'getAgent',
            resourceName: 'agent'
        }
    });

    return response.body.agent;
}

export async function clearChatAppCache(chatAppId: string): Promise<void> {
    chatAppCache.delete(`chatApp:${chatAppId}`);
}

export async function clearSvelteKitCache(cacheType: ClearSvelteKitCacheType, chatAppId?: string): Promise<{ clearedCount: number; cacheType: string }> {
    let clearedCount = 0;

    if (!ClearSvelteKitCacheTypes.includes(cacheType)) {
        throw new Error(`Invalid cache type: ${cacheType}`);
    }

    if (cacheType === 'chatAppCache' || cacheType === 'all') {
        if (chatAppId) {
            // Clear specific chat app from chatAppCache
            const hasKey = chatAppCache.has(`chatApp:${chatAppId}`);
            if (hasKey) {
                chatAppCache.delete(`chatApp:${chatAppId}`);
                clearedCount++;
            }
        } else {
            // Clear all chatAppCache entries
            clearedCount += chatAppCache.size;
            chatAppCache.clear();
        }
    }

    if (cacheType === 'tagDefinitionsCache' || cacheType === 'all') {
        clearedCount += tagDefinitionsCache.size;
        tagDefinitionsCache.clear();
    }

    if (cacheType === 'instructionAssistanceConfigCache' || cacheType === 'all') {
        clearedCount += instructionAssistanceConfigCache.size;
        instructionAssistanceConfigCache.clear();
    }

    if (cacheType === 'encryptionKeysCache' || cacheType === 'all') {
        try {
            if (KeyManagerFactory.hasInstance()) {
                const keyManager = KeyManagerFactory.getInstance();
                const refreshSuccess = await keyManager.forceRefresh();
                if (refreshSuccess) {
                    clearedCount++;
                }
            }
        } catch (error) {
            console.error('[clearSvelteKitCache] Failed to refresh encryption keys:', error);
            throw new Error(`Failed to refresh encryption keys: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return {
        clearedCount,
        cacheType: cacheType === 'all' ? 'all caches' : cacheType
    };
}

/**
 * We use this to find all the chat apps that a user is allowed to access and also to try to retrieve the one
 * ChatApp that the user is trying to access.  In the first case, we will have a set of rules to match against.
 * In the second case, we will craft a rule to make sure that the user will only be able to access the app
 * if it and they are internal/external user: internal may access both types of chat apps, external may only access external chat apps.
 *
 * Note that there are additional rules that may cause chat apps to not be accessible.
 * @see ChatAppOverride type in shared/types/chatbot/chatbot-types.ts
 *
 * @param userId
 * @param chatAppsForHomePage If true, then we will return the list of apps that the user is allowed to see on the home page.
 *        Note that this could be different than the list of apps that the user is allowed to access
 *        if they don't want to show a given app on the home page.
 * @param homePageFilterRules These will only be present if we are getting the chat apps to show on the home page.
 * @param chatAppId This will be present when we want to get this one chat app and make sure the user is allowed to access it.
 * @returns
 */
export async function getMatchingChatApps(
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatAppsForHomePage: boolean,
    homePageFilterRules?: UserChatAppRule[],
    chatAppId?: string,
    customDataFieldPathToMatchUsersEntity?: string
): Promise<ChatApp[]> {
    const request: GetChatAppsByRulesRequest = {
        userId: user.userId,
        chatAppsForHomePage,
        homePageFilterRules: homePageFilterRules,
        chatAppId,
        customDataFieldPathToMatchUsersEntity
    };

    // console.log('getMatchingChatApps called with:', {
    //     userId: user.userId,
    //     userType: user.userType,
    //     userRoles: user.roles,
    //     chatAppsForHomePage,
    //     homePageFilterRules,
    //     chatAppId,
    //     customDataFieldPathToMatchUsersEntity,
    //     userCustomData: user.customData
    // });

    // Hash the request and see if it is in the cache
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const cachedResponse = chatAppCache.get(requestHash);
    if (cachedResponse) {
        const chatAppIds = cachedResponse as string[];
        const allAreCached = chatAppIds.every((chatAppId) => chatAppCache.has(`chatApp:${chatAppId}`));
        if (allAreCached) {
            const chatApps = (await Promise.all(chatAppIds.map((chatAppId) => getChatApp(chatAppId)))) as ChatApp[];
            // console.log(
            //     'getMatchingChatApps returning cached result:',
            //     chatApps.map((app) => ({ chatAppId: app.chatAppId, title: app.title }))
            // );
            return chatApps;
        }
    }

    // console.log('Making API call to chat-admin/chat-app-by-rules with request:', request);

    const response = await invokeApi<GetChatAppsByRulesResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/chat-app-by-rules`,
        method: 'POST',
        body: request,
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: user.userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        errorInfo: {
            operation: 'getMatchingChatApps',
            resourceName: 'chat apps',
            userId: user.userId
        }
    });

    // console.log(
    //     'Chat apps received from API:',
    //     response.body.chatApps.map((app) => ({
    //         chatAppId: app.chatAppId,
    //         title: app.title,
    //         enabled: app.enabled,
    //         userTypes: app.userTypes,
    //         userRoles: app.userRoles,
    //         agentId: app.agentId
    //     }))
    // );

    if (response.body.chatApps.length > 0) {
        response.body.chatApps.forEach((chatApp) => {
            if (!chatApp.dontCacheThis) {
                chatAppCache.set(`chatApp:${chatApp.chatAppId}`, chatApp.chatAppId);
            }
        });

        chatAppCache.set(
            requestHash,
            response.body.chatApps.map((chatApp) => chatApp.chatAppId)
        );
    }

    // console.log(
    //     'getMatchingChatApps final result:',
    //     response.body.chatApps.map((app) => ({ chatAppId: app.chatAppId, title: app.title }))
    // );
    return response.body.chatApps;
}

export async function createOrUpdateChatAppOverride(userId: string, chatAppId: string, override: ChatAppOverrideForCreateOrUpdate): Promise<ChatAppOverride> {
    const response = await invokeApi<CreateOrUpdateChatAppOverrideResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/chat-app/${chatAppId}/override`,
        method: 'POST',
        body: { override, userId },
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        errorInfo: {
            operation: 'createOrUpdateChatAppOverride',
            resourceName: 'chat app override'
        }
    });

    return response.body.chatAppOverride;
}

export async function deleteChatAppOverride(userId: string, chatAppId: string): Promise<void> {
    await invokeApi<DeleteChatAppOverrideResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/chat-app/${chatAppId}/override`,
        method: 'DELETE',
        headers: {
            'Accept-Encoding': 'gzip',
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`
        },
        errorInfo: {
            operation: 'deleteChatAppOverride',
            resourceName: 'chat app override',
            userId
        }
    });
}

export async function addChatSessionFeedback(feedback: ChatSessionFeedbackForCreate): Promise<ChatSessionFeedback> {
    const response = await invokeApi<AddChatSessionFeedbackResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/session/feedback`,
        method: 'POST',
        body: { feedback },
        headers: {
            'Accept-Encoding': 'gzip'
        },
        errorInfo: {
            operation: 'addChatSessionFeedback',
            resourceName: 'chat session feedback'
        }
    });

    return response.body.feedback;
}

export async function updateChatSessionFeedback(feedback: ChatSessionFeedbackForUpdate): Promise<ChatSessionFeedback> {
    const response = await invokeApi<UpdateChatSessionFeedbackResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/session/feedback`,
        method: 'PUT',
        body: { feedback },
        headers: {
            'Accept-Encoding': 'gzip'
        },
        errorInfo: {
            operation: 'updateChatSessionFeedback',
            resourceName: 'chat session feedback'
        }
    });

    return response.body.feedback;
}

export async function searchForSessions(search: SessionSearchRequest<RecordOrUndef>): Promise<SessionSearchResponse<RecordOrUndef>> {
    const response = await invokeApi<SessionSearchResponse<RecordOrUndef>>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/session/search`,
        method: 'POST',
        body: search,
        headers: {
            'Accept-Encoding': 'gzip'
        },
        errorInfo: {
            operation: 'searchForSessions',
            resourceName: 'session search'
        }
    });

    return response.body;
}

export async function createOrUpdateTagDefinition(request: TagDefinitionCreateOrUpdateRequest): Promise<TagDefinitionCreateOrUpdateResponse> {
    const response = await invokeApi<TagDefinitionCreateOrUpdateResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/tagdef`,
        method: 'POST',
        body: request,
        headers: {
            'Accept-Encoding': 'gzip'
        },
        errorInfo: {
            operation: 'createOrUpdateTagDefinition',
            resourceName: 'tag definition'
        }
    });

    // Invalidate cache for this tag definition
    const cacheKey = `${request.tagDefinition.scope}:${request.tagDefinition.tag}`;
    tagDefinitionsCache.delete(cacheKey);

    // Also clear general search cache entries that might contain this tag
    for (const key of tagDefinitionsCache.keys()) {
        if (typeof key === 'string' && key.startsWith('search:')) {
            tagDefinitionsCache.delete(key);
        }
    }

    return response.body;
}

export async function deleteTagDefinition(request: TagDefinitionDeleteRequest): Promise<TagDefinitionDeleteResponse> {
    const response = await invokeApi<TagDefinitionDeleteResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/tagdef`,
        method: 'DELETE',
        body: request,
        headers: {
            'Accept-Encoding': 'gzip'
        },
        errorInfo: {
            operation: 'deleteTagDefinition',
            resourceName: 'tag definition'
        }
    });

    // Invalidate cache for this tag definition
    const cacheKey = `${request.tagDefinition.scope}:${request.tagDefinition.tag}`;
    tagDefinitionsCache.delete(cacheKey);

    // Also clear general search cache entries that might contain this tag
    for (const key of tagDefinitionsCache.keys()) {
        if (typeof key === 'string' && key.startsWith('search:')) {
            tagDefinitionsCache.delete(key);
        }
    }

    return response.body;
}

export async function searchTagDefinitions(request: TagDefinitionSearchRequest): Promise<TagDefinitionSearchResponse> {
    // Generate cache key based on request parameters
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const cacheKey = `search:admin:${requestHash}`;

    // Check if any tag definition has dontCacheThis set to true
    const cachedResponse = tagDefinitionsCache.get(cacheKey) as TagDefinitionSearchResponse | undefined;
    if (cachedResponse && !cachedResponse.tagDefinitions.some((def) => def.dontCacheThis)) {
        return cachedResponse;
    }

    const response = await invokeApi<TagDefinitionSearchResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/tagdef/search`,
        method: 'POST',
        body: request,
        headers: {
            'Accept-Encoding': 'gzip'
        },
        errorInfo: {
            operation: 'searchTagDefinitions',
            resourceName: 'tag definitions'
        }
    });

    // Cache the response only if no tag definition has dontCacheThis set
    if (!response.body.tagDefinitions.some((def) => def.dontCacheThis)) {
        tagDefinitionsCache.set(cacheKey, response.body);
    }

    return response.body;
}

export async function getInstructionAssistanceConfigFromSsm(): Promise<InstructionAssistanceConfig> {
    const cachedResponse = instructionAssistanceConfigCache.get('instruction-assistance-config') as InstructionAssistanceConfig | undefined;
    if (cachedResponse) {
        return cachedResponse;
    }

    const response = await getParametersByPath(`/stack/${appConfig.pikaServiceProjNameKebabCase}/${appConfig.stage}/instruction-assistance/`);
    const config = getInstructionsAssistanceConfigFromRawSsmParams(response);
    instructionAssistanceConfigCache.set('instruction-assistance-config', config);

    return config;
}

export async function createOrUpdateSemanticDirective(request: SemanticDirectiveCreateOrUpdateRequest): Promise<SemanticDirectiveCreateOrUpdateResponse> {
    const response = await invokeApi<SemanticDirectiveCreateOrUpdateResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/semantic-directive`,
        method: 'POST',
        body: request,
        headers: {
            'Accept-Encoding': 'gzip'
        },
        errorInfo: {
            operation: 'createOrUpdateSemanticDirective',
            resourceName: 'semantic directive'
        }
    });

    return response.body;
}

export async function deleteSemanticDirective(request: SemanticDirectiveDeleteRequest): Promise<SemanticDirectiveDeleteResponse> {
    const response = await invokeApi<SemanticDirectiveDeleteResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/semantic-directive`,
        method: 'DELETE',
        body: request,
        headers: {
            'Accept-Encoding': 'gzip'
        },
        errorInfo: {
            operation: 'deleteSemanticDirective',
            resourceName: 'semantic directive'
        }
    });

    return response.body;
}

export async function searchSemanticDirectives(request: SearchSemanticDirectivesRequest): Promise<SearchSemanticDirectivesResponse> {
    const response = await invokeApi<SearchSemanticDirectivesResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/semantic-directive/search`,
        method: 'POST',
        body: request,
        headers: {
            'Accept-Encoding': 'gzip'
        },
        errorInfo: {
            operation: 'searchSemanticDirectives',
            resourceName: 'semantic directives'
        }
    });

    return response.body;
}

/**
 * Get user memory records
 */
export async function getUserMemoriesForStrategy(userId: string, strategy: UserMemoryStrategy, nextToken?: string): Promise<SearchAllMemoryRecordsResponse> {
    const request: SearchAllMemoryRecordsRequest = {
        userId,
        strategy,
        nextToken
    };

    const response = await invokeApi<SearchAllMemoryRecordsResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/memory/record/search`,
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

export async function getInstructionsAddedForUserMemory(request: GetInstructionsAddedForUserMemoryRequest): Promise<GetInstructionsAddedForUserMemoryResponse> {
    const response = await invokeApi<GetInstructionsAddedForUserMemoryResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/memory/instructions`,
        method: 'POST',
        body: request,
        errorInfo: {
            operation: 'getInstructionsAddedForUserMemory',
            resourceName: 'user memory instructions'
        }
    });

    return response.body;
}
