import { getPinnedSessions } from '$lib/server/chat-apis';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { GetPinnedSessionsRequest } from 'pika-shared/types/chatbot/chatbot-types';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    try {
        const req: GetPinnedSessionsRequest = await request.json();

        // This is a get pinned sessions request
        const result = await getPinnedSessions(user.userId, req.chatAppId, req.limit, req.nextToken);
        return json(result);
    } catch (e) {
        handleApiGatewayError(e, 'handling search pinned session request');
    }
};
