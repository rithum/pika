import { getChatMessages } from '$lib/server/chat-apis';
import { handleApiGatewayError, isUserContentAdmin } from '$lib/server/utils';
import { error, json, redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    const { chatAppId } = params;
    if (!chatAppId) {
        throw error(400, 'chatAppId is required');
    }

    const { sessionId } = params;
    if (!sessionId) {
        throw error(400, 'sessionId is required');
    }

    let userId: string | undefined;
    if (locals.user.viewingContentFor && Object.keys(locals.user.viewingContentFor).length > 0) {
        if (!isUserContentAdmin(locals.user)) {
            throw error(403, 'Forbidden');
        }
        userId = locals.user.viewingContentFor[chatAppId]?.userId;
    }

    if (!userId) {
        userId = user.userId;
    }

    try {
        const messages = await getChatMessages(sessionId, userId);
        return json(messages);
    } catch (e) {
        handleApiGatewayError(e, 'getting chat messages');
    }
};
