import { getUserMemoriesForStrategy } from '$lib/server/chat-apis';
import { json, redirect, type RequestHandler } from '@sveltejs/kit';
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

    const params: SearchAllMyMemoryRecordsRequest = await request.json();

    if (!params.strategy) {
        return new Response('strategy is required', { status: 400 });
    }

    if (!UserMemoryStrategies.includes(params.strategy)) {
        return new Response('Invalid strategy', { status: 400 });
    }

    const response = await getUserMemoriesForStrategy(user.userId, params.strategy, params.nextToken);

    return json({
        success: true,
        data: response
    });
};
