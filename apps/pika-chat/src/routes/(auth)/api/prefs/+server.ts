import { getUserPrefs, setUserPrefs } from '$lib/server/chat-apis';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { SetChatUserPrefsRequest } from 'pika-shared/types/chatbot/chatbot-types';

export const GET: RequestHandler = async ({ request, params, locals }) => {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    let userId = user.userId;

    try {
        const prefs = await getUserPrefs(userId);
        return json({ success: true, prefs });
    } catch (e) {
        handleApiGatewayError(e, 'getting user preferences');
    }
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    try {
        const reqParams: SetChatUserPrefsRequest = await request.json();
        const userId = user.userId;

        if (!reqParams.prefs) {
            throw error(400, 'Prefs are required');
        }

        if (typeof reqParams.prefs !== 'object') {
            throw error(400, 'Prefs must be an object');
        }

        if (typeof reqParams.partial !== 'boolean') {
            throw error(400, 'Partial must be a boolean');
        }

        const prefs = await setUserPrefs(userId, reqParams.prefs, reqParams.partial ?? false);
        return json({ success: true, prefs });
    } catch (e) {
        handleApiGatewayError(e, 'setting user preferences');
    }
};
