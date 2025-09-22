import { getChatApp } from '$lib/server/chat-admin-apis';
import { searchForUser } from '$lib/server/chat-apis';
import { serializeContentAdminDataToCookies } from '$lib/server/cookies';
import { handleApiGatewayError, isUserContentAdmin } from '$lib/server/utils';
import { error, json, redirect, type RequestHandler } from '@sveltejs/kit';
import type { ContentAdminRequest } from 'pika-shared/types/chatbot/chatbot-types';

export const POST: RequestHandler = async (event) => {
    const { locals, request } = event;

    let user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    if (!isUserContentAdmin(user)) {
        throw error(403, 'You do not have permission to perform this action');
    }

    try {
        const contentAdminReq: ContentAdminRequest = await request.json();

        if (!contentAdminReq.chatAppId) {
            throw error(400, 'chatAppId is required');
        }

        const chatApp = await getChatApp(contentAdminReq.chatAppId);
        if (!chatApp) {
            throw error(404, 'chatApp not found');
        }

        if (contentAdminReq.command === 'viewContentForUser') {
            let viewingContentFor = user.viewingContentFor ?? {};
            viewingContentFor[chatApp.chatAppId] = contentAdminReq.user;

            user.viewingContentFor = viewingContentFor;
            locals.user = user;

            if (locals.keyManager) {
                serializeContentAdminDataToCookies(event, { data: user.viewingContentFor }, locals.keyManager);
            } else {
                throw new Error('KeyManager not available for cookie serialization');
            }
            return json({
                success: true
            });
        } else if (contentAdminReq.command === 'getValuesForAutoComplete') {
            const users = await searchForUser(user.userId, contentAdminReq.valueProvidedByUser);
            return json({
                success: true,
                data: users
            });
        } else if (contentAdminReq.command === 'stopViewingContentForUser') {
            let viewingContentFor = user.viewingContentFor ?? {};
            delete viewingContentFor[chatApp.chatAppId];

            user.viewingContentFor = viewingContentFor;
            locals.user = user;

            if (locals.keyManager) {
                serializeContentAdminDataToCookies(event, { data: user.viewingContentFor }, locals.keyManager);
            } else {
                throw new Error('KeyManager not available for cookie serialization');
            }
            return json({
                success: true
            });
        } else {
            throw error(400, 'Invalid command');
        }
    } catch (e) {
        handleApiGatewayError(e, 'processing content admin request');
    }
};
