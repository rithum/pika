import { getChatSessions, getUserPrefs, setUserPrefs } from '$lib/server/chat-apis';
import { getErrorResponse, isUserContentAdmin } from '$lib/server/utils';
import type { SetChatUserPrefsRequest } from '@pika/shared/types/chatbot/chatbot-types';
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request, params, locals }) => {
    const user = locals.user;
    if (!user) {
        return new Response('Unauthorized', { status: 401 });
    }

    let userId = user.userId;

    try {
        const prefs = await getUserPrefs(userId);
        return json({ success: true, prefs });
    } catch (e) {
        console.error(e);
        return getErrorResponse(500, `Failed to get user prefs: ${e instanceof Error ? e.message + ' ' + e.stack : e}`);
    }
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
    try {
        const params: SetChatUserPrefsRequest = await request.json();
        const user = locals.user;
        if (!user) {
            return new Response('Unauthorized', { status: 401 });
        }

        const userId = user.userId;

        if (!params.prefs) {
            return new Response('Prefs are required', { status: 400 });
        }

        if (typeof params.prefs !== 'object') {
            return new Response('Prefs must be an object', { status: 400 });
        }

        if (typeof params.partial !== 'boolean') {
            return new Response('Partial must be a boolean', { status: 400 });
        }

        const prefs = await setUserPrefs(userId, params.prefs, params.partial ?? false);
        return json({ success: true, prefs });
    } catch (e) {
        console.error(e);
        return getErrorResponse(500, `Failed to set user prefs: ${e instanceof Error ? e.message + ' ' + e.stack : e}`);
    }
};
