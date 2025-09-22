import { createSharedSession, revokeSharedSession } from '$lib/server/chat-apis';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { CreateSharedSessionRequest, RevokeSharedSessionRequest } from 'pika-shared/types/chatbot/chatbot-types';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    try {
        const req: CreateSharedSessionRequest = await request.json();

        if (!req.chatAppId) {
            throw error(400, 'chatAppId is required');
        }

        if (!req.sessionId) {
            throw error(400, 'sessionId is required');
        }

        if (!req.sessionUserId) {
            throw error(400, 'sessionUserId is required');
        }

        const result = await createSharedSession(user, req);
        return json(result);
    } catch (e) {
        handleApiGatewayError(e, 'creating shared session');
    }
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    try {
        const req: RevokeSharedSessionRequest = await request.json();

        if (!req.shareId) {
            throw error(400, 'shareId is required');
        }

        const resp = await revokeSharedSession(user, req);
        return json(resp);
    } catch (e) {
        handleApiGatewayError(e, 'revoking shared session');
    }
};
