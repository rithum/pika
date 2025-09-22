import { recordShareVisit } from '$lib/server/chat-apis';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { RecordShareVisitRequest } from 'pika-shared/types/chatbot/chatbot-types';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    try {
        const req: RecordShareVisitRequest = await request.json();
        if (!req.shareId) {
            throw error(400, 'shareId is required');
        }

        const resp = await recordShareVisit(user.userId, req.shareId);
        return json(resp);
    } catch (e) {
        handleApiGatewayError(e, 'recording share visit');
    }
};
