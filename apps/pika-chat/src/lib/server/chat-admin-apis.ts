import type {
    AuthenticatedUser,
    ChatApp,
    ChatAppOverride,
    ChatAppOverrideForCreateOrUpdate,
    ChatUserAddOrUpdateResponse,
    CreateOrUpdateChatAppOverrideResponse,
    DeleteChatAppOverrideResponse,
    GetChatAppsByRulesRequest,
    GetChatAppsByRulesResponse,
    RecordOrUndef,
    UserChatAppRule,
} from '@pika/shared/types/chatbot/chatbot-types';
import { convertToJwtString } from '@pika/shared/util/jwt';
import { LRUCache } from 'lru-cache';
import { hash } from 'node:crypto';
import { appConfig } from './config';
import { invokeApi } from './invoke-api';

const lruCache = new LRUCache({
    max: 100,
    maxSize: 50000,
    ttl: 1000 * 60 * 5, // 5 minutes
    ttlAutopurge: true,
    sizeCalculation: (value, key) => {
        return 1;
    },
});

export async function getAllChatApps(): Promise<ChatApp[]> {
    const response = await invokeApi({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/chat-app`,
        method: 'GET',
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: 'site-admin', customUserData: undefined }, appConfig.jwtSecret)}`,
        },
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error getting all chat apps from chat database with status code: ${response.statusCode} and error: ${response.body?.error}`
        );
    }

    return response.body.chatApps;
}

export async function getChatApp(chatAppId: string): Promise<ChatApp | undefined> {
    const response = await invokeApi({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/chat-app/${chatAppId}`,
        method: 'GET',
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: chatAppId, customUserData: undefined }, appConfig.jwtSecret)}`,
        },
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error getting chat app from chat database for chatAppId ${chatAppId} with status code: ${response.statusCode} and error: ${response.body?.error}`
        );
    }

    return response.body.chatApp;
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
        customDataFieldPathToMatchUsersEntity,
    };

    // Hash the request and see if it is in the cache
    const requestHash = hash('sha256', JSON.stringify(request));
    const cachedResponse = lruCache.get(requestHash);
    if (cachedResponse) {
        const chatAppIds = cachedResponse as string[];
        const allAreCached = chatAppIds.every((chatAppId) => lruCache.has(`chatApp:${chatAppId}`));
        if (allAreCached) {
            const chatApps = (await Promise.all(chatAppIds.map((chatAppId) => getChatApp(chatAppId)))) as ChatApp[];
            return chatApps;
        }
    }

    const response = await invokeApi<GetChatAppsByRulesResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/chat-app-by-rules`,
        method: 'POST',
        body: request,
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId: user.userId, customUserData: undefined }, appConfig.jwtSecret)}`,
        },
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error getting matching chat apps for userId ${user.userId} with status code: ${response.statusCode} and error: ${response.body?.error}`
        );
    }

    if (response.body.chatApps.length > 0) {
        response.body.chatApps.forEach((chatApp) => {
            if (!chatApp.dontCacheThis) {
                lruCache.set(`chatApp:${chatApp.chatAppId}`, chatApp.chatAppId);
            }
        });

        lruCache.set(
            requestHash,
            response.body.chatApps.map((chatApp) => chatApp.chatAppId)
        );
    }

    return response.body.chatApps;
}

export async function createOrUpdateChatAppOverride(
    userId: string,
    chatAppId: string,
    override: ChatAppOverrideForCreateOrUpdate
): Promise<ChatAppOverride> {
    const response = await invokeApi<CreateOrUpdateChatAppOverrideResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/chat-app/${chatAppId}/override`,
        method: 'POST',
        body: override,
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`,
        },
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error creating or updating chat app override for userId ${userId} and chatAppId ${chatAppId} with status code: ${response.statusCode} and error: ${response.body?.error}`
        );
    }

    return response.body.chatAppOverride;
}

export async function deleteChatAppOverride(userId: string, chatAppId: string): Promise<void> {
    const response = await invokeApi<DeleteChatAppOverrideResponse>({
        apiId: appConfig.chatAdminApiId,
        path: `${appConfig.stage}/api/chat-admin/chat-app/${chatAppId}/override`,
        method: 'DELETE',
        headers: {
            'x-chat-auth': `Bearer ${convertToJwtString<undefined>({ userId, customUserData: undefined }, appConfig.jwtSecret)}`,
        },
    });

    if (!response.body || !response.body.success) {
        throw new Error(
            `Error deleting chat app override for userId ${userId} and chatAppId ${chatAppId} with status code: ${response.statusCode} and error: ${response.body?.error}`
        );
    }
}
