import { getUserMemoriesForStrategy } from '$lib/server/chat-apis';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, redirect, type RequestHandler } from '@sveltejs/kit';
import { UserMemoryStrategies, type SearchAllMyMemoryRecordsRequest } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Get all memory records for a user given a strategy.
 */
export const POST: RequestHandler = async (event) => {
    const { locals, request } = event;

    let user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    try {
        const params: SearchAllMyMemoryRecordsRequest = await request.json();

        // Early validation with specific SvelteKit errors
        if (!params.strategy) {
            throw error(400, 'strategy is required');
        }

        if (!UserMemoryStrategies.includes(params.strategy)) {
            throw error(400, 'Invalid strategy');
        }

        const response = await getUserMemoriesForStrategy(user.userId, params.strategy, params.nextToken);

        return json({
            success: true,
            data: response
        });
    } catch (e) {
        // Use utility that preserves status codes and logs detailed errors
        handleApiGatewayError(e, 'retrieving user memory records');
    }
};
