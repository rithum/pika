import { getChatSessions } from '$lib/server/chat-apis';
import { getPresignedUploadResponse } from '$lib/server/s3';
import { getErrorResponse, isUserContentAdmin } from '$lib/server/utils';
import type { PresignedUrlUploadRequest } from '@pika/shared/types/upload-types';
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request, params, locals }) => {
    const { chatAppId } = params;
    if (!chatAppId) {
        return new Response('chatAppId is required', { status: 400 });
    }

    const user = locals.user;
    if (!user) {
        return new Response('Unauthorized', { status: 401 });
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

    try {
        const sessions = await getChatSessions(userId, chatAppId);
        return json({ success: true, sessions });
    } catch (e) {
        console.error(e);
        return getErrorResponse(500, `Failed to get chat sessions: ${e instanceof Error ? e.message + ' ' + e.stack : e}`);
    }

    // try {

    //     const messages = await getChatMessages(sessionId);

    //     const params: PresignedUrlUploadRequest = await request.json();

    //     if (!params.s3Key) {
    //         return new Response('s3Key is required', { status: 400 });
    //     }

    //     if (!params.fileMimeType) {
    //         return new Response('fileMimeType is required', { status: 400 });
    //     }

    //     if (!params.fileSize) {
    //         return new Response('fileSize is required', { status: 400 });
    //     }
    //     const response = await getPresignedUploadResponse(params);
    //     return json(response);
    // } catch (e) {
    //     console.error(e);
    //     return getErrorResponse(
    //         500,
    //         `Failed to get presigned upload response url: ${e instanceof Error ? e.message + ' ' + e.stack : e}`
    //     );
    // }
};

// export const POST: RequestHandler = async ({ request, params }) => {
//     try {
//         const sessionId = params.sessionId;
//         if (!sessionId) {
//             return new Response('sessionId is required', { status: 400 });
//         }

//         const messages = await getChatMessages(sessionId);

//         const params: PresignedUrlUploadRequest = await request.json();

//         if (!params.s3Key) {
//             return new Response('s3Key is required', { status: 400 });
//         }

//         if (!params.fileMimeType) {
//             return new Response('fileMimeType is required', { status: 400 });
//         }

//         if (!params.fileSize) {
//             return new Response('fileSize is required', { status: 400 });
//         }
//         const response = await getPresignedUploadResponse(params);
//         return json(response);
//     } catch (e) {
//         console.error(e);
//         return getErrorResponse(
//             500,
//             `Failed to get presigned upload response url: ${e instanceof Error ? e.message + ' ' + e.stack : e}`
//         );
//     }
// };
