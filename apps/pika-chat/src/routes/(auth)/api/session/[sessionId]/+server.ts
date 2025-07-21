import { getChatSession } from '$lib/server/chat-apis';
import { getPresignedUploadResponse } from '$lib/server/s3';
import { getErrorResponse, isUserContentAdmin } from '$lib/server/utils';
import type { PresignedUrlUploadRequest } from '@pika/shared/types/upload-types';
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request, params, locals }) => {
    const { chatAppId, sessionId, userId } = params;
    const user = locals.user;
    if (!user || user.userType != 'internal-user') {
        return new Response('Unauthorized', { status: 401 });
    }

    if (!sessionId) {
        return new Response('sessionId is required', { status: 400 });
    }
    if (!userId) {
        return new Response('userId is required', { status: 400 });
    }



    try {
        const session = await getChatSession(userId, sessionId);
        session.reports = session.reports?.map((r: any) => JSON.parse(r)) ?? [];
        return json({ success: true, session });
    } catch (e) {
        console.error(e);
        return getErrorResponse(500, `Failed to get chat sessions: ${e instanceof Error ? e.message + ' ' + e.stack : e}`);
    }

};
