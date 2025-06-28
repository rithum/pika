import { getErrorResponse } from '$lib/server/utils';
import type { ConverseRequest, SimpleAuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
import { redirect, type RequestHandler } from '@sveltejs/kit';
import { invokeConverseFunctionUrl } from '$lib/server/invoke-converse-fn-url';
import { appConfig } from '$lib/server/config';

export const POST: RequestHandler = async ({ request, locals }) => {
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

        const simpleUser: SimpleAuthenticatedUser<typeof user.customData> = {
            userId: user.userId,
            customUserData: user.customData,
        };

        // Replace the s3Bucket with appConfig.uploadS3Bucket in any files we have
        if (params.files) {
            params.files = params.files?.map((file) => ({
                ...file,
                s3Bucket: appConfig.uploadS3Bucket,
                fileId: file.fileId.replace('REPLACE_ME_SERVER_SIDE', appConfig.uploadS3Bucket),
            }));
        }

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
            Connection: 'keep-alive',
        };

        if (sessionId) {
            responseHeaders['x-chatbot-session-id'] = sessionId;
        }

        // Return the streaming response directly
        // Since your Lambda streams plain text, we just pass it through
        return new Response(lambdaResponse.body, {
            status: 200,
            headers: responseHeaders,
        });
    } catch (e) {
        console.error('Error in message handler:', e);
        return getErrorResponse(
            500,
            `Failed to get answer back from chatbot: ${e instanceof Error ? e.message + ' ' + e.stack : e}`
        );
    }
};
