import { BedrockActionGroupLambdaEvent, BedrockActionGroupLambdaResponse } from '@pika/shared/types/chatbot/bedrock';
import { RecordOrUndef, SessionDataWithChatUserCustomDataSpreadIn, SessionData } from '@pika/shared/types/chatbot/chatbot-types';
import { convertBedrockParamsToCorrectType, createBedrockLambdaResponse, handleBedrockError, normalizeSessionAttributes } from '@pika/shared/util/bedrock';
import { callOpenMateoApi } from './openmateo-apis';

/**
 * Lambda handler for the Weather API action group.
 */
export async function handler(event: BedrockActionGroupLambdaEvent): Promise<BedrockActionGroupLambdaResponse> {
    console.log('Event received for function:', event.function, 'with params:', JSON.stringify(event.parameters, null, 2));

    let sessionData: SessionDataWithChatUserCustomDataSpreadIn<RecordOrUndef> | undefined;

    try {
        if (!event.function) {
            throw new Error('Missing function name in Bedrock Agent action lambda');
        }

        // Make sure we have the s3 upload bucket name as an environment variable
        const uploadS3BucketName = process.env.UPLOAD_S3_BUCKET;
        if (!uploadS3BucketName) {
            throw new Error('Missing upload S3 bucket name in environment variables');
        } else {
            console.log('Upload S3 bucket name:', uploadS3BucketName);
        }

        const region = process.env.AWS_REGION;
        if (!region) {
            throw new Error('Missing AWS region in environment variables');
        } else {
            console.log('AWS region:', region);
        }

        //TODO: figure out what we are going to do with custom auth data.
        // let authDataGzipHexEncoded = event.promptSessionAttributes?.authDataGzipHexEncoded;
        // if (!authDataGzipHexEncoded) {
        //     throw new Error('Missing authDataGzipHexEncoded in promptSessionAttributes');
        // }
        // let accessToken: string;
        // try {
        //     const authData = JSON.parse(gunzipBase64EncodedString(authDataGzipHexEncoded));
        //     if (authData.accessToken) {
        //         console.log('Access token found in authData:', redactData({ authData }, 'authData'));
        //         accessToken = authData.accessToken;
        //     } else {
        //         throw new Error('Missing accessToken in authData');
        //     }
        // } catch (ex) {
        //     throw new Error(`Failed to parse authData: ${authDataGzipHexEncoded}. Error: ${ex instanceof Error ? ex.message : String(ex)}`);
        // }

        let params = convertBedrockParamsToCorrectType(event.parameters);

        // If the params object has a jsonParams property, parse it and merge it with the params object.
        // AWS only allows at most 5 parameters to be passed to a function.  So we need to use a JSON string
        // to pass additional parameters.
        if (typeof params.jsonParams === 'string') {
            try {
                const jsonParams = JSON.parse(params.jsonParams);
                params = { ...params, ...jsonParams };
            } catch (ex) {
                throw new Error(`Failed to parse jsonParams: ${params.jsonParams}. Error: ${ex instanceof Error ? ex.message : String(ex)}`);
            }
        }

        sessionData = normalizeSessionAttributes(event.sessionAttributes);

        //TODO: get rid of this initSession call.  It's not needed.  We can just use the sessionData object that is passed in.

        // If the function to call is initSession, we need to return the session info so Bedrock will persist it for all subsequent calls in the same session.
        if (event.function === 'initSession') {
            if (sessionData) {
                return createBedrockLambdaResponse('A session is already initialized.', event.actionGroup, event.messageVersion, event.function, event.sessionAttributes);
            } else {
                //TODO: @clint this used to return params as the final arg but now it's sessionData, is this an issue?
                // The params passed in should be a SessionData object. Return them as the sessionAttributes and Bedrock will persist them for all subsequent calls in the same session.
                return createBedrockLambdaResponse('Session initialized.', event.actionGroup, event.messageVersion, event.function, sessionData);
            }
        } else {
            // There had better be a sessionData object since we're performing a real action.
            if (!sessionData) {
                throw new Error('Session is not initialized.  Ask the user for the session attributes and then call `initSession`');
            }

            //TODO: @clint why do we need to add sessionId to the sessionData?
            // Just in case, make sure the sessionId from the event is present in the sessionData
            //sessionData.sessionId = event.sessionId;

            const results = await callOpenMateoApi(event.function, params, sessionData, uploadS3BucketName, region, event.sessionId);
            return createBedrockLambdaResponse(results, event.actionGroup, event.messageVersion, event.function);
        }
    } catch (error) {
        return handleBedrockError(error, event, sessionData);
    }
}
