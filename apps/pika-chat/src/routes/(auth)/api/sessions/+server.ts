import { invoke } from '$lib/server/chat-admin-apis';
import { getPresignedUploadResponse } from '$lib/server/s3';
import { getErrorResponse, isUserContentAdmin } from '$lib/server/utils';
import type { PresignedUrlUploadRequest } from '@pika/shared/types/upload-types';
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request, params, locals }) => {

    const user = locals.user;
    if (!user) {
        return new Response('Unauthorized', { status: 401 });
    }

    let userId: string | undefined;

    if (!userId) {
        userId = user.userId;
    }

    try {
        const sessions = await invoke("GET", "conversations");
        return json({ success: true, sessions });
    } catch (e) {
        console.error(e);
        return getErrorResponse(500, `Failed to get chat sessions: ${e instanceof Error ? e.message + ' ' + e.stack : e}`);
    }
};
