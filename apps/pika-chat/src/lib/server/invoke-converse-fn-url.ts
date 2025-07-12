import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { appConfig } from './config';
import type {
    ChatAppOverridableFeatures,
    ConverseRequest,
    RecordOrUndef,
    SimpleAuthenticatedUser,
} from '@pika/shared/types/chatbot/chatbot-types';
import { convertToJwtString } from '@pika/shared/util/jwt';
import { handler } from '../../../../../services/pika/src/lambda/converse';
import { PassThrough } from 'stream';

interface ConverseFunctionResponse {
    body: ReadableStream<Uint8Array> | null;
    headers: Headers;
    ok: boolean;
    status: number;
    statusText: string;
}

/**
 * Invokes the Lambda Function URL for the converse function with IAM authentication.
 * Returns the streaming response body for real-time processing.
 *
 * @param request The converse request parameters
 * @returns Promise<ConverseFunctionResponse> with streaming body
 */
export async function invokeConverseFunctionUrl<T extends RecordOrUndef = undefined>(
    request: ConverseRequest,
    simpleUser: SimpleAuthenticatedUser<T>
): Promise<ConverseFunctionResponse> {
    const functionUrl = appConfig.converseFnUrl;
    const region = appConfig.awsRegion;

    // Parse the Function URL to get hostname and path
    const url = new URL(functionUrl);

    const xChatAuthToken = `Bearer ${convertToJwtString<T>(simpleUser, appConfig.jwtSecret)}`;
    console.log('xChatAuthToken Length', xChatAuthToken.length);

    // Prepare the request object for signing
    const requestToSign = {
        method: 'POST',
        hostname: url.hostname,
        path: url.pathname + url.search,
        protocol: url.protocol,
        headers: {
            Host: url.hostname,
            'Content-Type': 'application/json',
            'x-chat-auth': xChatAuthToken,
        } as Record<string, string>,
        body: JSON.stringify(request),
    };

    // Create a SignatureV4 signer instance for Lambda service
    const signer = new SignatureV4({
        credentials: defaultProvider(),
        region: region,
        service: 'lambda', // Lambda Function URLs use 'lambda' service for signing
        sha256: Sha256,
    });

    // Sign the request
    const signedRequest = (await signer.sign(requestToSign as any)) as unknown as {
        method: string;
        headers: Record<string, string>;
        body: string;
    };

    // Make the fetch call using the signed request details
    let response: Response;
    try {
        if (appConfig.isLocal) {
            let name = appConfig.pikaServiceProjNameKebabCase;
            let stage = appConfig.stage;
            process.env.AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
            process.env.STAGE = stage;
            process.env.CHAT_APP_TABLE = `chat-app-${name}-${stage}`;

            process.env.AGENT_DEFINITIONS_TABLE = `agent-definitions-${name}-${stage}`;
            process.env.CHAT_ADMIN_API_ID = appConfig.chatApiId;
            process.env.CHAT_MESSAGES_TABLE = `chat-message-${name}-${stage}`;
            process.env.CHAT_SESSION_TABLE = `chat-session-${name}-${stage}`;
            process.env.CHAT_USER_TABLE = `chat-user-${name}-${stage}`;
            process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE = name;
            process.env.TOOL_DEFINITIONS_TABLE = `tool-definitions-${name}-${stage}`;
            process.env.UPLOAD_S3_BUCKET = `file-uploads-${name}-${stage}`;

            let r1: any, r2: any;
            let firstBytePromise: Promise<void> & {
                finished: boolean;
                resolve: () => void;
                reject(e: Error): void;
            } = new Promise(function (resolve, reject) {
                r1 = resolve;
                r2 = reject;
            }).finally(function () {
                firstBytePromise.finished = true;
            }) as any;
            firstBytePromise.resolve = r1;
            firstBytePromise.reject = r2;
            let passThrough: PassThrough & { set: (key: string, value: string) => void } = Object.assign(
                new PassThrough(),
                {
                    set: (key: string, value: string) => {
                        if (!firstBytePromise.finished) {
                            firstBytePromise.resolve();
                        }
                        response.headers.set(key, value);
                    },
                }
            );
            response = new Response(passThrough as any);
            handler(
                {
                    body: request,
                    headers: signedRequest.headers,

                    requestContext: {
                        authorizer: {
                            iam: await defaultProvider()(),
                        },
                    },
                } as any,
                { responseStream: passThrough } as any
            )!
                .then(() => {
                    passThrough.end();
                })
                .catch((e: any) => {
                    passThrough.emit('error', e);
                });
            await firstBytePromise;
        } else {
            response = await fetch(functionUrl, {
                method: signedRequest.method,
                headers: signedRequest.headers,
                body: signedRequest.body,
            });
        }
    } catch (error) {
        console.error('Failed to invoke converse function URL:', error);
        throw new Error(
            `Network error or failed to fetch from Lambda Function URL: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    // Check if the response was successful
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Lambda Function URL request failed with status ${response.status}:`, errorText);
        throw new Error(
            `Lambda Function URL request failed with status ${response.status}: ${response.statusText}. Response: ${errorText}`
        );
    }

    return {
        body: response.body,
        headers: response.headers,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
    };
}
