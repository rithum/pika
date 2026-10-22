import { getPinnedSessions } from '$lib/server/chat-apis';
import { scopePinnedResultsToAccount } from '$lib/custom/session-account-context';
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
        // Pinned sessions are keyed on user alone too.
        return json({ ...result, results: scopePinnedResultsToAccount(result.results, user, req.chatAppId) });
    } catch (e) {
        handleApiGatewayError(e, 'handling search pinned session request');
    }
};
