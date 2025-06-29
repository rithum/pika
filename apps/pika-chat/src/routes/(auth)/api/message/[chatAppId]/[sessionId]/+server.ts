import { getChatMessages } from '$lib/server/chat-apis';
import { isUserContentAdmin } from '$lib/server/utils';
import { json, redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals }) => {
    const user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    const { chatAppId } = params;
    if (!chatAppId) {
        return new Response('chatAppId is required', { status: 400 });
    }

    const { sessionId } = params;
    if (!sessionId) {
        return new Response('sessionId is required', { status: 400 });
    }

    let userId: string | undefined;
    if (locals.user.viewingContentFor && Object.keys(locals.user.viewingContentFor).length > 0) {
        if (!isUserContentAdmin(locals.user)) {
            throw new Response('Forbidden', { status: 403 });
        }
        userId = locals.user.viewingContentFor[chatAppId]?.userId;
    }

    if (!userId) {
        userId = user.userId;
    }

    const messages = await getChatMessages(sessionId, userId);

    return json(messages);
};
