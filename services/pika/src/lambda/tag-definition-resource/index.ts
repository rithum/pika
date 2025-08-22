import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse, CloudFormationCustomResourceResponseCommon, Context, Handler } from 'aws-lambda';
import type {
    TagDefinitionCreateOrUpdateRequest,
    TagDefinitionCreateOrUpdateResponse,
    TagDefinitionDeleteRequest,
    TagDefinitionDeleteResponse
} from 'pika-shared/types/chatbot/chatbot-types';
import { gunzipBase64EncodedString } from 'pika-shared/util/server-utils';
import { createMakeRequestFn, getStackNameFromStackId, MakeRequestFn, parseTagDefinitionCustomResourceProperties, sendCustomResourceResponse } from './util';

/**
 * This lambda is used to create, update, or delete tag definitions in a single operation.  You create a custom cloudformation resource
 * that points at this lambda and passes in the tag definition data as a gzipped hex encoded string.
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

        const tagDefDataGzippedHexEncoded = event.ResourceProperties.TagDefData;
        if (!tagDefDataGzippedHexEncoded) {
            throw new Error('TagDefData is required in ResourceProperties');
        }
        console.log('TagDefData length:', tagDefDataGzippedHexEncoded.length);

        let tagDefDataStr: string;

        try {
            tagDefDataStr = gunzipBase64EncodedString(tagDefDataGzippedHexEncoded);
            console.log('Successfully decompressed TagDefData, length:', tagDefDataStr.length);
        } catch (zipErr) {
            console.error('Failed to gunzip TagDefData:', zipErr);
            throw new Error('Failed to gunzip TagDefData: ' + zipErr);
        }

        let tagDefData = parseTagDefinitionCustomResourceProperties(tagDefDataStr);
        console.log('Successfully parsed TagDefData for tag:', tagDefData.tag, 'scope:', tagDefData.scope);

        // Handle different CloudFormation operations
        console.log(`Processing ${event.RequestType} request`);

        const makeRequest: MakeRequestFn = createMakeRequestFn(chatAdminApiId, stage, region);
        const userId = `stack-${getStackNameFromStackId(event.StackId)}`;

        switch (event.RequestType) {
            case 'Create':
            case 'Update':
                console.log(`${event.RequestType} request for tag definition ${tagDefData.scope}.${tagDefData.tag}`);

                try {
                    const createOrUpdateRequest: TagDefinitionCreateOrUpdateRequest = {
                        tagDefinition: {
                            ...tagDefData
                        },
                        userId
                    };

                    console.log('Making API request to /api/chat-admin/tagdef with payload:', JSON.stringify(createOrUpdateRequest, null, 2));
                    const result = await makeRequest<TagDefinitionCreateOrUpdateResponse>('POST', `/api/chat-admin/tagdef`, createOrUpdateRequest);
                    console.log('API response received:', JSON.stringify(result, null, 2));

                    if (result) {
                        console.log(`Successfully created or updated tag definition ${tagDefData.scope}.${tagDefData.tag}`);
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

                responseCommon.PhysicalResourceId = `${tagDefData.scope}.${tagDefData.tag}`;
                break;

            case 'Delete':
                console.log(`Delete request for tag definition ${tagDefData.scope}.${tagDefData.tag}`);

                try {
                    const deleteRequest: TagDefinitionDeleteRequest = {
                        tagDefinition: {
                            scope: tagDefData.scope,
                            tag: tagDefData.tag
                        },
                        userId
                    };

                    console.log('Making API request to /api/chat-admin/tagdef (DELETE) with payload:', JSON.stringify(deleteRequest, null, 2));
                    const result = await makeRequest<TagDefinitionDeleteResponse>('DELETE', `/api/chat-admin/tagdef`, deleteRequest);
                    console.log('API response received:', JSON.stringify(result, null, 2));

                    if (result) {
                        console.log(`Successfully deleted tag definition ${tagDefData.scope}.${tagDefData.tag}`);
                    } else {
                        console.log(`Tag definition ${tagDefData.scope}.${tagDefData.tag} was not found or already deleted`);
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
