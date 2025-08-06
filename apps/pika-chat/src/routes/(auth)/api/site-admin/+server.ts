import {
    addChatSessionFeedback,
    clearChatAppCache,
    createOrUpdateChatAppOverride,
    deleteChatAppOverride,
    getAllChatApps,
    getChatApp,
    searchForSessions,
    updateChatSessionFeedback
} from '$lib/server/chat-admin-apis';
import { searchForUser } from '$lib/server/chat-apis';
import { siteFeatures } from '$lib/server/custom-site-features';
import { invokeConverseFunctionUrl } from '$lib/server/invoke-converse-fn-url';
import { isUserAllowedToUseEntityAccessControl, isUserAllowedToUseSpecificUserAccessControl, isUserSiteAdmin } from '$lib/server/utils';
import type { ConverseRequestWithCommand, SimpleAuthenticatedUser, SiteAdminRequest } from '@pika/shared/types/chatbot/chatbot-types';
import { json, redirect, type RequestHandler } from '@sveltejs/kit';
import { getValuesForEntityAutoComplete } from './custom-data';

export const POST: RequestHandler = async (event) => {
    const { locals, request } = event;

    let user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    if (!isUserSiteAdmin(user)) {
        return new Response('User is not site admin', { status: 403 });
    }

    const siteAdminReq: SiteAdminRequest = await request.json();

    if (siteAdminReq.command === 'getInitialData') {
        const chatApps = await getAllChatApps();

        return json({
            success: true,
            chatApps,
            siteFeatures
        });
    } else if (siteAdminReq.command === 'getValuesForEntityAutoComplete') {
        if (!isUserAllowedToUseEntityAccessControl(user)) {
            return new Response('User is not allowed to use entity access control', { status: 403 });
        }

        if (!('chatAppId' in siteAdminReq)) {
            return new Response('chatAppId is required', { status: 400 });
        }

        if (!('type' in siteAdminReq)) {
            return new Response('type is required', { status: 400 });
        }

        if (!('valueProvidedByUser' in siteAdminReq)) {
            return new Response('valueProvidedByUser is required', { status: 400 });
        }

        const valuesForAutoComplete = await getValuesForEntityAutoComplete(siteAdminReq.type, siteAdminReq.valueProvidedByUser, user, siteAdminReq.chatAppId);

        return json({
            success: true,
            data: valuesForAutoComplete
        });
    } else if (siteAdminReq.command === 'getValuesForUserAutoComplete') {
        if (!isUserAllowedToUseSpecificUserAccessControl(user)) {
            return new Response('User is not allowed to use specific user access control', { status: 403 });
        }

        const users = await searchForUser(user.userId, siteAdminReq.valueProvidedByUser);
        return json({
            success: true,
            data: users
        });
    } else if (siteAdminReq.command === 'refreshChatApp') {
        const chatAppId = siteAdminReq.chatAppId;
        if (!chatAppId) {
            return new Response('chatAppId is required', { status: 400 });
        }

        const chatApp = await getChatApp(chatAppId);
        if (!chatApp) {
            return new Response('chatApp not found', { status: 404 });
        }

        return json({
            success: true,
            chatApp
        });
    } else if (siteAdminReq.command === 'clearChatAppCache') {
        const chatAppId = siteAdminReq.chatAppId;
        if (!chatAppId) {
            return new Response('chatAppId is required', { status: 400 });
        }

        const agentId = siteAdminReq.agentId;
        if (!agentId) {
            return new Response('agentId is required', { status: 400 });
        }

        await clearChatAppCache(chatAppId);

        try {
            // Create simpleUser from user
            const simpleUser: SimpleAuthenticatedUser<typeof user.customData> = {
                userId: user.userId,
                customUserData: user.customData
            };

            // Create a command request to clear the cache
            const clearCacheRequest: ConverseRequestWithCommand = {
                userId: simpleUser.userId,
                chatAppId: chatAppId,
                agentId: agentId,
                command: 'clearChatAppCache'
            };

            // Invoke the converse function with the command
            const response = await invokeConverseFunctionUrl(clearCacheRequest, simpleUser);

            // Read the response from the stream
            const reader = response.body?.getReader();
            if (reader) {
                const result = await reader.read();
                const commandResponse = JSON.parse(new TextDecoder().decode(result.value));
                console.log('Cache clear command response:', commandResponse);
            }
        } catch (error) {
            console.error('Error clearing chat app cache:', error);
            return new Response('Failed to clear cache', { status: 500 });
        }

        return json({
            success: true
        });
    } else if (siteAdminReq.command === 'createOrUpdateChatAppOverride') {
        if (!('chatAppId' in siteAdminReq)) {
            return new Response('chatAppId is required', { status: 400 });
        }

        if (!siteAdminReq.override) {
            return new Response('override is required', { status: 400 });
        }

        const chatAppOverride = await createOrUpdateChatAppOverride(user.userId, siteAdminReq.chatAppId, siteAdminReq.override);

        return json({
            success: true,
            chatAppOverride
        });
    } else if (siteAdminReq.command === 'deleteChatAppOverride') {
        if (!('chatAppId' in siteAdminReq)) {
            return new Response('chatAppId is required', { status: 400 });
        }

        const users = await deleteChatAppOverride(user.userId, siteAdminReq.chatAppId);
        return json({
            success: true
        });
    } else if (siteAdminReq.command === 'addChatSessionFeedback') {
        if (!('feedback' in siteAdminReq)) {
            return new Response('feedback is required', { status: 400 });
        }

        const feedback = await addChatSessionFeedback(siteAdminReq.feedback);

        return json({
            success: true,
            feedback
        });
    } else if (siteAdminReq.command === 'updateChatSessionFeedback') {
        if (!('feedback' in siteAdminReq)) {
            return new Response('feedback is required', { status: 400 });
        }

        const feedback = await updateChatSessionFeedback(siteAdminReq.feedback);

        return json({
            success: true,
            feedback
        });
    } else if (siteAdminReq.command === 'sessionSearch') {
        if (!('search' in siteAdminReq)) {
            return new Response('search is required', { status: 400 });
        }

        const search = await searchForSessions(siteAdminReq.search);
        return json({ ...search });
    } else {
        return new Response('Invalid command', { status: 400 });
    }
};
