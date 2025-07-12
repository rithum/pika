import { getChatApp } from '$lib/server/chat-admin-apis';
import { searchForUser } from '$lib/server/chat-apis';
import { appConfig } from '$lib/server/config';
import { serializeContentAdminDataToCookies } from '$lib/server/cookies';
import { isUserContentAdmin } from '$lib/server/utils';
import type { ContentAdminRequest } from '@pika/shared/types/chatbot/chatbot-types';
import { json, redirect, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
    const { locals, request } = event;

    let user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    if (!isUserContentAdmin(user)) {
        return new Response('User is not content admin', { status: 403 });
    }

    const contentAdminReq: ContentAdminRequest = await request.json();

    if (!contentAdminReq.chatAppId) {
        return new Response('chatAppId is required', { status: 400 });
    }

    const chatApp = await getChatApp(contentAdminReq.chatAppId);
    if (!chatApp) {
        return new Response('chatApp not found', { status: 404 });
    }

    if (contentAdminReq.command === 'viewContentForUser') {
        let viewingContentFor = user.viewingContentFor ?? {};
        viewingContentFor[chatApp.chatAppId] = contentAdminReq.user;

        user.viewingContentFor = viewingContentFor;
        locals.user = user;

        serializeContentAdminDataToCookies(
            event,
            { data: user.viewingContentFor },
            appConfig.masterCookieKey,
            appConfig.masterCookieInitVector
        );
        return json({
            success: true,
        });
    } else if (contentAdminReq.command === 'getValuesForAutoComplete') {
        const users = await searchForUser(user.userId, contentAdminReq.valueProvidedByUser);
        return json({
            success: true,
            data: users,
        });
    } else if (contentAdminReq.command === 'stopViewingContentForUser') {
        let viewingContentFor = user.viewingContentFor ?? {};
        delete viewingContentFor[chatApp.chatAppId];

        user.viewingContentFor = viewingContentFor;
        locals.user = user;

        serializeContentAdminDataToCookies(
            event,
            { data: user.viewingContentFor },
            appConfig.masterCookieKey,
            appConfig.masterCookieInitVector
        );
        return json({
            success: true,
        });
    } else {
        return new Response('Invalid command', { status: 400 });
    }
};
