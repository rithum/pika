import { getFeedbackBySessionId } from '$lib/server/chat-apis';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request, params, locals }) => {
    const { sessionId } = params;
    if (!sessionId) {
        throw error(400, 'sessionId is required');
    }

    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    //TODO: we will need this back if the API requires that the user passed in is the one who created the feedback
    // let userId: string | undefined;
    // if (locals.user.viewingContentFor && Object.keys(locals.user.viewingContentFor).length > 0) {
    //     if (!isUserContentAdmin(locals.user)) {
    //         throw error(403, 'Forbidden');
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
        handleApiGatewayError(e, 'getting session feedback');
    }
};
