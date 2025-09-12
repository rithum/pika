import type {
    SemanticDirective,
    SemanticDirectiveDataRequest,
    SemanticDirectiveCreateOrUpdateRequest,
    SemanticDirectiveCreateOrUpdateResponse,
    SemanticDirectiveDeleteRequest,
    SemanticDirectiveDeleteResponse,
    SemanticDirectiveForCreateOrUpdate,
    SearchSemanticDirectivesResponse
} from 'pika-shared/types/chatbot/chatbot-types';
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse, CloudFormationCustomResourceResponseCommon, Context, Handler } from 'aws-lambda';
import { createMakeRequestFn, MakeRequestFn, parseSemanticDirectiveCustomResourceProperties, sendCustomResourceResponse } from './util';
import { gunzipBase64EncodedString } from 'pika-shared/util/server-utils';
import { constructScope } from 'pika-shared/util/server-client-utils';

/**
 * This lambda is used to create or update semantic directives in a single operation. You create a custom cloudformation resource
 * that points at this lambda and passes in the semantic directive data as a base64 encoded gzipped string of type SemanticDirectiveDataRequest.
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

        // Handle different CloudFormation operations
        console.log(`Processing ${event.RequestType} request`);

        const makeRequest: MakeRequestFn = createMakeRequestFn(chatAdminApiId, stage, region);

        switch (event.RequestType) {
            case 'Create':
            case 'Update':
                // Only parse semantic directive data for Create/Update operations
                const semanticDirectiveDataGzippedHexEncoded = event.ResourceProperties.SemanticDirectiveData;
                if (!semanticDirectiveDataGzippedHexEncoded) {
                    throw new Error('SemanticDirectiveData is required in ResourceProperties');
                }
                console.log('SemanticDirectiveData length:', semanticDirectiveDataGzippedHexEncoded.length);

                let semanticDirectiveDataStr: string;

                try {
                    semanticDirectiveDataStr = gunzipBase64EncodedString(semanticDirectiveDataGzippedHexEncoded);
                    console.log('Successfully decompressed SemanticDirectiveData, length:', semanticDirectiveDataStr.length);
                } catch (zipErr) {
                    console.error('Failed to gunzip SemanticDirectiveData:', zipErr);
                    throw new Error('Failed to gunzip SemanticDirectiveData: ' + zipErr);
                }

                let semanticDirectiveData = parseSemanticDirectiveCustomResourceProperties(semanticDirectiveDataStr);
                console.log(
                    `Successfully parsed SemanticDirectiveData for ${semanticDirectiveData.semanticDirectives.length} semantic directives on behalf of ${semanticDirectiveData.userId}`
                );
                console.log(
                    `${event.RequestType} request for ${semanticDirectiveData.semanticDirectives.length} semantic directives on behalf of ${semanticDirectiveData.userId} in group ${semanticDirectiveData.groupId}`
                );

                const processedDirectives: string[] = [];
                const deletedDirectives: string[] = [];
                const stackId = event.StackId;
                // The stack name is the part after "stack/" and before the next "/"
                const groupId = stackId.split('/')[1];

                try {
                    // Step 1: Query existing directives by groupId
                    console.log(`Querying existing directives for groupId: ${groupId}`);
                    const existingDirectivesResponse = await makeRequest<SearchSemanticDirectivesResponse>('POST', `/api/chat-admin/semantic-directive/search`, {
                        groupId
                    });
                    const existingDirectives = existingDirectivesResponse?.semanticDirectives || [];
                    console.log(`Found ${existingDirectives.length} existing directives for groupId: ${semanticDirectiveData.groupId}`);

                    // Step 2: Build a map of incoming directives by scope#id for comparison
                    const incomingDirectivesMap = new Map<string, SemanticDirectiveForCreateOrUpdate>();
                    for (const directive of semanticDirectiveData.semanticDirectives) {
                        const scope = constructScope(directive.scopeType, directive.scopeValue);
                        const key = `${scope}#${directive.id}`;

                        // Set the groupId for the incoming directive
                        directive.groupId = groupId;

                        incomingDirectivesMap.set(key, directive);
                    }

                    // Step 3: Determine which existing directives to delete (not in incoming set)
                    for (const existingDirective of existingDirectives) {
                        const key = `${existingDirective.scope}#${existingDirective.id}`;
                        if (!incomingDirectivesMap.has(key)) {
                            console.log(`Deleting semantic directive that no longer exists: ${existingDirective.scope}/${existingDirective.id}`);

                            const deleteRequest: SemanticDirectiveDeleteRequest = {
                                semanticDirective: {
                                    scope: existingDirective.scope,
                                    id: existingDirective.id
                                },
                                userId: semanticDirectiveData.userId
                            };

                            await makeRequest('DELETE', '/api/chat-admin/semantic-directive', deleteRequest);
                            console.log(`Successfully deleted semantic directive: ${existingDirective.scope}/${existingDirective.id}`);
                            deletedDirectives.push(`${existingDirective.scope}/${existingDirective.id}`);
                        }
                    }

                    // Step 4: Create or update each incoming semantic directive
                    for (const directive of semanticDirectiveData.semanticDirectives) {
                        const scope = constructScope(directive.scopeType, directive.scopeValue);
                        console.log(`Processing semantic directive: ${scope}/${directive.id}`);

                        const createOrUpdateRequest: SemanticDirectiveCreateOrUpdateRequest = {
                            semanticDirective: directive,
                            userId: semanticDirectiveData.userId
                        };

                        console.log('Making API request to /api/chat-admin/semantic-directive with payload:', JSON.stringify(createOrUpdateRequest, null, 2));

                        const result = await makeRequest<SemanticDirective>('POST', `/api/chat-admin/semantic-directive`, createOrUpdateRequest);
                        console.log('API response received:', JSON.stringify(result, null, 2));

                        if (result) {
                            console.log(`Successfully created or updated semantic directive ${scope}/${directive.id}`);
                            processedDirectives.push(`${scope}/${directive.id}`);
                        } else {
                            throw new Error(`No result from API call for semantic directive ${scope}/${directive.id}`);
                        }
                    }

                    console.log(`Successfully processed ${processedDirectives.length} semantic directives: ${processedDirectives.join(', ')}`);
                    if (deletedDirectives.length > 0) {
                        console.log(`Successfully deleted ${deletedDirectives.length} semantic directives: ${deletedDirectives.join(', ')}`);
                    }
                } catch (apiError) {
                    console.error('API call failed with error:', apiError);
                    console.error('Error details:', {
                        message: apiError instanceof Error ? apiError.message : String(apiError),
                        stack: apiError instanceof Error ? apiError.stack : undefined,
                        name: apiError instanceof Error ? apiError.name : undefined,
                        processedDirectives,
                        deletedDirectives
                    });
                    throw new Error(
                        `API call failed (processed ${processedDirectives.length} directives, deleted ${deletedDirectives.length}): ${apiError instanceof Error ? apiError.message : String(apiError)}`
                    );
                }

                // Use a unique identifier that represents all processed directives
                responseCommon.PhysicalResourceId = `semantic-directives-${semanticDirectiveData.groupId}-${processedDirectives.length}`;
                break;

            case 'Delete':
                console.log('We do not support deleting semantic directives when the stack is deleted, doing nothing');
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
