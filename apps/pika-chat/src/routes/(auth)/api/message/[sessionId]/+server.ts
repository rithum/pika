import { getChatMessages } from '$lib/server/chat-apis';
import { json, redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals }) => {
    const { sessionId } = params;
    if (!sessionId) {
        return new Response('sessionId is required', { status: 400 });
    }

    const user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    const messages = await getChatMessages(sessionId, user.userId);

    return json(messages);
};
