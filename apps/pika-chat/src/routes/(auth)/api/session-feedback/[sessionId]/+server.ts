import { getChatSessions, getFeedbackBySessionId } from '$lib/server/chat-apis';
import { getErrorResponse, isUserContentAdmin } from '$lib/server/utils';
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request, params, locals }) => {
    const { sessionId } = params;
    if (!sessionId) {
        return new Response('sessionId is required', { status: 400 });
    }

    const user = locals.user;
    if (!user) {
        return new Response('Unauthorized', { status: 401 });
    }

    //TODO: we will need this back if the API requires that the user passed in is the one who created the feedback
    // let userId: string | undefined;
    // if (locals.user.viewingContentFor && Object.keys(locals.user.viewingContentFor).length > 0) {
    //     if (!isUserContentAdmin(locals.user)) {
    //         throw new Response('Forbidden', { status: 403 });
    //     }
    //     userId = locals.user.viewingContentFor[chatAppId]?.userId;
    // }

    // if (!userId) {
    //     userId = user.userId;
    // }

    try {
        const feedback = await getFeedbackBySessionId(sessionId);
        return json({ success: true, feedback });
    } catch (e) {
        console.error(e);
        return getErrorResponse(500, `Failed to get chat sessions: ${e instanceof Error ? e.message + ' ' + e.stack : e}`);
    }
};
