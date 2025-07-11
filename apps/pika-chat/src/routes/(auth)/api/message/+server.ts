import { getErrorResponse, getOverridableFeatures, isUserContentAdmin } from '$lib/server/utils';
import type { ChatApp, ConverseRequest, SimpleAuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { invokeConverseFunctionUrl } from '$lib/server/invoke-converse-fn-url';
import { appConfig } from '$lib/server/config';
import { getMatchingChatApps } from '$lib/server/chat-admin-apis';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user.viewingContentFor && Object.keys(locals.user.viewingContentFor).length > 0) {
        if (!isUserContentAdmin(locals.user)) {
            throw new Response('Forbidden', { status: 403 });
        }
        return new Response('You have selected view content for another user and you are not allowed to take action as that user.', { status: 403 });
    }

    try {
        const params: ConverseRequest = await request.json();

        const user = locals.user;
        if (!user) {
            throw redirect(302, '/auth/login');
        }

        if (!params.userId) {
            return new Response('userId is required', { status: 400 });
        }

        if (!params.message) {
            return new Response('message is required', { status: 400 });
        }

        if (!params.agentId) {
            return new Response('agentId is required', { status: 400 });
        }

        if (!params.chatAppId) {
            return new Response('chatAppId is required', { status: 400 });
        }

        if (params.userId !== user.userId) {
            console.log('User ID mismatch:', { userId: params.userId, user: user.userId });
            return new Response('Unauthorized', { status: 401 });
        }

        //TODO: what do we do if an internal user changes the custom data during a chat session?  Do we care?  Will it break anything downstream?
        const simpleUser: SimpleAuthenticatedUser<typeof user.customData> = {
            userId: user.userId,
            customUserData: user.overrideData?.[params.chatAppId] || user.customData
        };

        // Replace the s3Bucket with appConfig.uploadS3Bucket in any files we have
        if (params.files) {
            params.files = params.files?.map((file) => ({
                ...file,
                s3Bucket: appConfig.uploadS3Bucket,
                fileId: file.fileId.replace('REPLACE_ME_SERVER_SIDE', appConfig.uploadS3Bucket)
            }));
        }

        let chatApp: ChatApp | undefined;
        try {
            const authProvider = locals.authProvider;
            let getCustomDataFieldPathToMatchUsersEntity: string | undefined;

            if (authProvider.getCustomDataFieldPathToMatchUsersEntity) {
                getCustomDataFieldPathToMatchUsersEntity = await authProvider.getCustomDataFieldPathToMatchUsersEntity();
            }
            const matchingChatApps = await getMatchingChatApps(locals.user, false, undefined, params.chatAppId, getCustomDataFieldPathToMatchUsersEntity);
            if (matchingChatApps && matchingChatApps.length === 1) {
                chatApp = matchingChatApps[0];
            } else {
                throw error(404, 'Chat app not found');
            }
        } catch (e) {
            if (e instanceof Error && e.message.includes('404')) {
                throw error(404, 'Chat app not found');
            }
            throw e;
        }

        // Don't trust the features passed in the request and don't send traces and chatDisclaimerNotice to the converse function
        const { chatDisclaimerNotice, traces, logout, ...featuresForConverse } = getOverridableFeatures(chatApp, locals.user);
        params.features = featuresForConverse;
        console.log('featuresForConverse', featuresForConverse);

        // Invoke the Lambda Function URL
        const lambdaResponse = await invokeConverseFunctionUrl<typeof user.customData>(params, simpleUser);

        if (!lambdaResponse.body) {
            console.error('Lambda response missing body');
            throw new Error('No response body received from Lambda function');
        }

        // Extract session ID from response headers if present
        const sessionId = lambdaResponse.headers.get('x-chatbot-session-id');

        const responseHeaders: Record<string, string> = {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
        };

        if (sessionId) {
            responseHeaders['x-chatbot-session-id'] = sessionId;
        }

        // Return the streaming response directly
        // Since your Lambda streams plain text, we just pass it through
        return new Response(lambdaResponse.body, {
            status: 200,
            headers: responseHeaders
        });
    } catch (e) {
        console.error('Error in message handler:', e);
        return getErrorResponse(500, `Failed to get answer back from chatbot: ${e instanceof Error ? e.message + ' ' + e.stack : e}`);
    }
};
