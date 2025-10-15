import { getAwsCredentials } from '$lib/server/cognito';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { UserCognitoIdentity } from 'pika-shared/types/chatbot/chatbot-types';

export const GET: RequestHandler = async ({ locals }) => {
    try {
        const user = locals.user;
        if (!user) {
            throw error(401, 'Unauthorized');
        }

        let identity: UserCognitoIdentity | undefined;

        if (locals.authProvider.getUserCognitoIdentity) {
            identity = await locals.authProvider.getUserCognitoIdentity(user);
        }

        console.log('identity', identity);
        if (!identity || !identity.cognitoIdentityId || !identity.cognitoAccessToken) {
            throw error(400, 'Cognito Identity entity ID and token were not provided by the auth provider');
        }

        const awsCredentials = await getAwsCredentials(identity);

        return json({
            success: true,
            awsCredentials
        });
    } catch (e: any) {
        // Check if this is a token expiration error from Cognito
        if (e?.name === 'NotAuthorizedException' && e?.message?.includes('expired')) {
            console.warn('[AWS Creds API] Cognito token expired, client should re-authenticate');
            return json(
                {
                    success: false,
                    error: 'TOKEN_EXPIRED',
                    message: 'Your session has expired. Please refresh the page to re-authenticate.',
                    requiresReauth: true
                },
                { status: 401 }
            );
        }

        handleApiGatewayError(e, 'getting AWS credentials');
    }
};
