import { getMatchingChatApps } from '$lib/server/chat-admin-apis';
import { appConfig } from '$lib/server/config';
import { siteFeatures } from '$lib/server/custom-site-features';
import { invokeConverseFunctionUrl } from '$lib/server/invoke-converse-fn-url';
import { handleApiGatewayError, isUserContentAdmin } from '$lib/server/utils';
import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import type { ChatApp, ConverseRequest, SimpleAuthenticatedUser } from 'pika-shared/types/chatbot/chatbot-types';
import { getOverridableFeatures } from 'pika-shared/util/server-utils';
import { transformCustomUserData } from '$lib/custom/server-hooks';

/** Max time (ms) to wait for the server hook before falling back to original data */
const SERVER_HOOK_TIMEOUT_MS = 5000;

export const POST: RequestHandler = async ({ request, locals }) => {
    if (locals.user.viewingContentFor && Object.keys(locals.user.viewingContentFor).length > 0) {
        if (!isUserContentAdmin(locals.user)) {
            throw error(403, 'Forbidden');
        }
        throw error(403, 'You have selected view content for another user and you are not allowed to take action as that user.');
    }

    try {
        const params: ConverseRequest = await request.json();

        const user = locals.user;
        if (!user) {
            throw redirect(302, '/auth/login');
        }

        if (!params.userId) {
            throw error(400, 'userId is required');
        }

        if (!params.message) {
            throw error(400, 'message is required');
        }

        if (!params.agentId) {
            throw error(400, 'agentId is required');
        }

        if (!params.chatAppId) {
            throw error(400, 'chatAppId is required');
        }

        if (params.userId !== user.userId) {
            console.log('User ID mismatch:', { userId: params.userId, user: user.userId });
            throw error(401, 'Unauthorized');
        }

        //TODO: what do we do if an internal user changes the custom data during a chat session?  Do we care?  Will it break anything downstream?
        const rawCustomUserData = user.overrideData?.[params.chatAppId] || user.customData;

        // Allow consumer to transform customUserData before it reaches the agent
        let resolvedCustomUserData = rawCustomUserData;
        if (transformCustomUserData) {
            try {
                const hookResult = await Promise.race([
                    transformCustomUserData(rawCustomUserData, {
                        userId: user.userId,
                        chatAppId: params.chatAppId
                    }),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error(`transformCustomUserData timed out after ${SERVER_HOOK_TIMEOUT_MS}ms`)), SERVER_HOOK_TIMEOUT_MS)
                    )
                ]);

                // Guard against hooks that accidentally return undefined when data existed
                if (hookResult === undefined && rawCustomUserData !== undefined) {
                    console.warn('[server-hooks] transformCustomUserData returned undefined; using original data');
                } else {
                    resolvedCustomUserData = hookResult;
                }
            } catch (e) {
                console.warn('[server-hooks] transformCustomUserData threw an error, falling back to original data:', e instanceof Error ? e.message : String(e));
            }
        }

        const simpleUser: SimpleAuthenticatedUser<typeof user.customData> = {
            userId: user.userId,
            customUserData: resolvedCustomUserData
        };

        // Replace the s3Bucket with appConfig.pikaS3Bucket in any files we have
        if (params.files) {
            params.files = params.files?.map((file) => ({
                ...file,
                s3Bucket: appConfig.pikaS3Bucket,
                fileId: file.fileId.replace('REPLACE_ME_SERVER_SIDE', appConfig.pikaS3Bucket)
            }));
        }

        let chatApp: ChatApp | undefined;
        let customDataFieldPathToMatchUsersEntity: string | undefined;
        try {
            if (siteFeatures?.entity?.enabled && siteFeatures.entity.attributeName) {
                customDataFieldPathToMatchUsersEntity = siteFeatures.entity.attributeName;
            }

            const matchingChatApps = await getMatchingChatApps(locals.user, false, undefined, params.chatAppId, customDataFieldPathToMatchUsersEntity);
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

        // Don't trust the features passed in the request and don't send UI-only features to the converse function
        const { chatDisclaimerNotice, traces, logout, fileUpload, suggestions, promptInputFieldLabel, uiCustomization, ...featuresForConverse } = getOverridableFeatures(
            siteFeatures ?? {},
            chatApp,
            locals.user
        );
        params.features = featuresForConverse;
        // console.log('featuresForConverse', featuresForConverse);

        if (customDataFieldPathToMatchUsersEntity) {
            params.entityAttributeNameInUserCustomData = customDataFieldPathToMatchUsersEntity;
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
        handleApiGatewayError(e, 'getting answer back from chatbot');
    }
};
