import { CognitoIdentityClient, GetCredentialsForIdentityCommand } from '@aws-sdk/client-cognito-identity';
import type { UserAwsCredentials, UserCognitoIdentity } from 'pika-shared/types/chatbot/chatbot-types';
import { appConfig } from './config';

let client: CognitoIdentityClient | undefined;

function getClient(): CognitoIdentityClient {
    if (!client) {
        client = new CognitoIdentityClient({ region: appConfig.awsRegion });
    }
    return client;
}

export async function getAwsCredentials(identity: UserCognitoIdentity): Promise<UserAwsCredentials> {
    // console.log('getting aws credentials');
    const command = new GetCredentialsForIdentityCommand({
        IdentityId: identity.cognitoIdentityId,
        Logins: {
            'cognito-identity.amazonaws.com': identity.cognitoAccessToken
        }
    });
    // console.log('command', command);
    const response = await getClient().send(command);
    if (!response.Credentials || !response.Credentials.AccessKeyId || !response.Credentials.SecretKey || !response.Credentials.SessionToken || !response.Credentials.Expiration) {
        throw new Error('No credentials found');
    }
    // console.log('response', response);
    return {
        accessKeyId: response.Credentials.AccessKeyId,
        secretKey: response.Credentials.SecretKey,
        sessionToken: response.Credentials.SessionToken,
        expiration: response.Credentials.Expiration.toISOString()
    };
}
