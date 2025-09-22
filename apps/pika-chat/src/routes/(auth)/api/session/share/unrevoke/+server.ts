import { unrevokeSharedSession } from '$lib/server/chat-apis';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { UnrevokeSharedSessionRequest } from 'pika-shared/types/chatbot/chatbot-types';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    try {
        const req: UnrevokeSharedSessionRequest = await request.json();

        if (!req.shareId) {
            throw error(400, 'shareId is required');
        }

        const resp = await unrevokeSharedSession(user, req);
        return json(resp);
    } catch (e) {
        handleApiGatewayError(e, 'unrevoking shared session');
    }
};
