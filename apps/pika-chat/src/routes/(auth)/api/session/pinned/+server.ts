import { pinSession, unpinSession } from '$lib/server/chat-apis';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { PinSessionRequest, UnpinSessionRequest } from 'pika-shared/types/chatbot/chatbot-types';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    try {
        const req: PinSessionRequest = await request.json();

        if (!('sessionId' in req.pinnedSession || 'shareId' in req.pinnedSession)) {
            throw error(400, 'sessionId or shareId is required');
        }

        req.pinnedSession.userId = user.userId;

        if (!req.pinnedSession.pinnedAt) {
            req.pinnedSession.pinnedAt = new Date().toISOString();
        }

        // Check if this is a pin request or a get pinned sessions request
        // This is a pin request
        const resp = await pinSession(user, req);
        return json(resp);
    } catch (e) {
        handleApiGatewayError(e, 'handling pinned session request');
    }
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    try {
        const req: UnpinSessionRequest = await request.json();
        const resp = await unpinSession(user, req);
        return json(resp);
    } catch (e) {
        handleApiGatewayError(e, 'unpinning session');
    }
};
