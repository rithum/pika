import type { ChatApp, ChatAppDataRequest, ChatAppDataResponse, CreateChatAppRequest, UpdateChatAppRequest } from '@pika/shared/types/chatbot/chatbot-types';
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse, CloudFormationCustomResourceResponseCommon, Context, Handler } from 'aws-lambda';
import { createMakeRequestFn, MakeRequestFn, parseChatAppCustomResourceProperties, sendCustomResourceResponse } from './util';
import { gunzipBase64EncodedString } from '@pika/shared/util/server-utils';

/**
 * This lambda is used to create or update a chat app in a single operation. You create a custom cloudformation resource
 * that points at this lambda and passes in the chat app data as a base64 encoded gzipped string of type ChatAppDataRequest.
 *
 * @param event
 * @param context
 */
export const handler: Handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log('Context:', JSON.stringify(context, null, 2));

    let response: CloudFormationCustomResourceResponse;
    let responseCommon: CloudFormationCustomResourceResponseCommon = {
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        PhysicalResourceId: context.logStreamName
    };

    try {
        // Validate required environment variables first
        const chatAdminApiId = process.env.CHAT_ADMIN_API_ID;
        if (!chatAdminApiId) {
            throw new Error('CHAT_ADMIN_API_ID environment variable not found');
        }
        console.log('CHAT_ADMIN_API_ID:', chatAdminApiId);

        const region = process.env.AWS_REGION;
        if (!region) {
            throw new Error('AWS_REGION environment variable not found');
        }
        console.log('AWS_REGION:', region);

        const stageFromEnv = process.env.STAGE;
        if (!stageFromEnv) {
            throw new Error('STAGE environment variable not found');
        }
        console.log('STAGE from environment:', stageFromEnv);

        // Validate required event properties
        const stage = event.ResourceProperties.Stage ?? stageFromEnv;
        if (!stage) {
            throw new Error('Stage is required in ResourceProperties');
        }
        console.log('Stage from ResourceProperties:', stage);

        if (stage !== stageFromEnv) {
            throw new Error('Stage from ResourceProperties does not match STAGE environment variable');
        }

        const chatAppDataGzippedHexEncoded = event.ResourceProperties.ChatAppData;
        if (!chatAppDataGzippedHexEncoded) {
            throw new Error('ChatAppData is required in ResourceProperties');
        }
        console.log('ChatAppData length:', chatAppDataGzippedHexEncoded.length);

        let chatAppDataStr: string;

        try {
            chatAppDataStr = gunzipBase64EncodedString(chatAppDataGzippedHexEncoded);
            console.log('Successfully decompressed ChatAppData, length:', chatAppDataStr.length);
        } catch (zipErr) {
            console.error('Failed to gunzip ChatAppData:', zipErr);
            throw new Error('Failed to gunzip ChatAppData: ' + zipErr);
        }

        let chatAppData = parseChatAppCustomResourceProperties(chatAppDataStr);
        console.log('Successfully parsed ChatAppData for chat app:', chatAppData.chatApp.chatAppId);

        // Handle different CloudFormation operations
        console.log(`Processing ${event.RequestType} request`);

        const makeRequest: MakeRequestFn = createMakeRequestFn(chatAdminApiId, stage, region);

        switch (event.RequestType) {
            case 'Create':
                console.log(`${event.RequestType} request for chat app ${chatAppData.chatApp.chatAppId} on behalf of ${chatAppData.userId}`);

                try {
                    const createRequest: ChatAppDataRequest = {
                        chatApp: chatAppData.chatApp,
                        userId: chatAppData.userId
                    };
                    console.log('Making API request to /api/chat-admin/chat-app with payload:', JSON.stringify(createRequest, null, 2));
                    const result = await makeRequest<ChatAppDataResponse>('POST', `/api/chat-admin/chat-app-data`, createRequest);
                    console.log('API response received:', JSON.stringify(result, null, 2));

                    if (result) {
                        console.log(`Successfully created chat app ${chatAppData.chatApp.chatAppId}`);
                    } else {
                        throw new Error('No result from API call');
                    }
                } catch (apiError) {
                    console.error('API call failed with error:', apiError);
                    console.error('Error details:', {
                        message: apiError instanceof Error ? apiError.message : String(apiError),
                        stack: apiError instanceof Error ? apiError.stack : undefined,
                        name: apiError instanceof Error ? apiError.name : undefined
                    });
                    throw new Error(`API call failed: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
                }

                responseCommon.PhysicalResourceId = chatAppData.chatApp.chatAppId;
                break;

            case 'Update':
                console.log(`${event.RequestType} request for chat app ${chatAppData.chatApp.chatAppId} on behalf of ${chatAppData.userId}`);

                try {
                    const updateRequest: UpdateChatAppRequest = {
                        chatApp: chatAppData.chatApp,
                        userId: chatAppData.userId
                    };
                    console.log('Making API request to /api/chat-admin/chat-app/{chatAppId} with payload:', JSON.stringify(updateRequest, null, 2));
                    const result = await makeRequest<ChatApp>('PUT', `/api/chat-admin/chat-app/${chatAppData.chatApp.chatAppId}`, updateRequest);
                    console.log('API response received:', JSON.stringify(result, null, 2));

                    if (result) {
                        console.log(`Successfully updated chat app ${chatAppData.chatApp.chatAppId}`);
                    } else {
                        throw new Error('No result from API call');
                    }
                } catch (apiError) {
                    console.error('API call failed with error:', apiError);
                    console.error('Error details:', {
                        message: apiError instanceof Error ? apiError.message : String(apiError),
                        stack: apiError instanceof Error ? apiError.stack : undefined,
                        name: apiError instanceof Error ? apiError.name : undefined
                    });
                    throw new Error(`API call failed: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
                }

                responseCommon.PhysicalResourceId = chatAppData.chatApp.chatAppId;
                break;

            case 'Delete':
                console.log('We do not support deleting chat apps when the stack is deleted, doing nothing');
                responseCommon.PhysicalResourceId = event.PhysicalResourceId ?? context.logStreamName;
                break;
        }

        // Success response
        response = {
            ...responseCommon,
            Status: 'SUCCESS',
            Data: {
                Message: `${event.RequestType} operation completed successfully`,
                Timestamp: new Date().toISOString()
            }
        };

        console.log('Operation completed successfully');
    } catch (e) {
        console.error('Error during operation:', e);
        let errorMsg = e instanceof Error ? e.message + ' ' + e.stack : String(e);
        errorMsg = errorMsg.length > 300 ? errorMsg.substring(0, 300) + '...' : errorMsg;

        response = {
            ...responseCommon,
            Status: 'FAILED',
            Reason: e instanceof Error ? e.message : 'Unknown error',
            Data: {
                error: errorMsg
            }
        };
    }

    try {
        console.log('Sending response to CloudFormation...');
        await sendCustomResourceResponse(event, response);
        console.log('CloudFormation response sent successfully');
    } catch (e) {
        // This is a critical failure - CloudFormation will hang without a response
        console.error('CRITICAL: Failed to send response to CloudFormation:', e);

        // Log everything we can for debugging
        console.error('Event that failed:', JSON.stringify(event, null, 2));
        console.error('Response that failed:', JSON.stringify(response, null, 2));

        // Re-throw to ensure Lambda fails and gets retried/alerted
        throw new Error(`Critical failure: CloudFormation response not sent. Stack will hang. Error: ${e instanceof Error ? e.message : String(e)}`);
    }
};
