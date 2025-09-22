import { getRecentSharedSessions } from '$lib/server/chat-apis';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { GetRecentSharedRequest } from 'pika-shared/types/chatbot/chatbot-types';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    try {
        const req: GetRecentSharedRequest = await request.json();

        if (!req.chatAppId) {
            throw error(400, 'chatAppId is required');
        }

        const resp = await getRecentSharedSessions(user.userId, req.chatAppId, req.limit || 5);
        return json(resp);
    } catch (e) {
        handleApiGatewayError(e, 'getting recent shared sessions');
    }
};
