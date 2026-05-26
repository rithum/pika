import { getChatSessions } from '$lib/server/chat-apis';
import { transformSessionAccountContext } from '$lib/custom/session-account-context';
import { handleApiGatewayError, isUserContentAdmin } from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request, params, locals }) => {
    const { chatAppId } = params;
    if (!chatAppId) {
        throw error(400, 'chatAppId is required');
    }

    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    let userId: string | undefined;
    if (locals.user.viewingContentFor && Object.keys(locals.user.viewingContentFor).length > 0) {
        if (!isUserContentAdmin(locals.user)) {
            throw error(403, 'Forbidden');
        }
        userId = locals.user.viewingContentFor[chatAppId]?.userId;
    }

    if (!userId) {
        userId = user.userId;
    }

    try {
        const sessions = await getChatSessions(userId, chatAppId);
        const enrichedSessions = sessions.map((s) => transformSessionAccountContext(s, locals.user));
        return json({ success: true, sessions: enrichedSessions });
    } catch (e) {
        handleApiGatewayError(e, 'getting chat sessions');
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
