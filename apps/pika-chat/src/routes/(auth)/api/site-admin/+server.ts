import { createOrUpdateChatAppOverride, deleteChatAppOverride, getAllChatApps, getChatApp } from '$lib/server/chat-admin-apis';
import { siteFeatures } from '$lib/server/custom-site-features';
import { isUserAllowedToUseEntityAccessControl, isUserAllowedToUseSpecificUserAccessControl, isUserSiteAdmin } from '$lib/server/utils';
import type { SiteAdminRequest } from '@pika/shared/types/chatbot/chatbot-types';
import { json, redirect, type RequestHandler } from '@sveltejs/kit';
import { getValuesForEntityAutoComplete } from './custom-data';
import { searchForUser } from '$lib/server/chat-apis';

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
    } else {
        return new Response('Invalid command', { status: 400 });
    }
};
