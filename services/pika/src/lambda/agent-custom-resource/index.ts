import type { AgentAndTools, AgentDataRequest, AgentDataResponse, ToolIdToLambdaArnMap } from '@pika/shared/types/chatbot/chatbot-types';
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse, CloudFormationCustomResourceResponseCommon, Context, Handler } from 'aws-lambda';
import { createMakeRequestFn, MakeRequestFn, parseAgentCustomResourceProperties, sendCustomResourceResponse } from './util';
import { gunzipBase64EncodedString } from '@pika/shared/util/server-utils';

/**
 * This lambda is used to create or update an agent and its tools in a single operation.  You create a custom cloudformation resource
 * that points at this lambda and passes in the agent data as a base64 encoded gzipped string of type AgentDataRequest.
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

        const agentDataGzippedHexEncoded = event.ResourceProperties.AgentData;
        if (!agentDataGzippedHexEncoded) {
            throw new Error('AgentData is required in ResourceProperties');
        }
        console.log('AgentData length:', agentDataGzippedHexEncoded.length);

        let agentDataStr: string;

        try {
            agentDataStr = gunzipBase64EncodedString(agentDataGzippedHexEncoded);
            console.log('Successfully decompressed AgentData, length:', agentDataStr.length);
        } catch (zipErr) {
            console.error('Failed to gunzip AgentData:', zipErr);
            throw new Error('Failed to gunzip AgentData: ' + zipErr);
        }

        let agentData = parseAgentCustomResourceProperties(agentDataStr);
        console.log('Successfully parsed AgentData for agent:', agentData.agent.agentId);
        
        // If the toolIdToLambdaArnMap is provided, then we need to replace the lambdaArn with the actual arn of the lambda function
        let toolIdToLambdaArnMap = event.ResourceProperties.ToolIdToLambdaArnMap as ToolIdToLambdaArnMap | undefined;
        if (toolIdToLambdaArnMap) {
            console.log('ToolIdToLambdaArnMap provided, replacing lambdaArns with actual arns', toolIdToLambdaArnMap);
            agentData.tools?.forEach((tool) => {
                if (toolIdToLambdaArnMap[tool.toolId]) {
                    console.log(`Replacing lambdaArn for tool ${tool.toolId} from ${tool.lambdaArn} to ${toolIdToLambdaArnMap[tool.toolId]}`);
                    tool.lambdaArn = toolIdToLambdaArnMap[tool.toolId];
                }
            });
        }

        // Log the lambda ARN to verify it's resolved correctly
        if (agentData.tools && agentData.tools.length > 0) {
            agentData.tools.forEach((tool, index) => {
                console.log(`Tool ${index} (${tool.toolId}) lambdaArn:`, tool.lambdaArn);
                // Validate that the ARN looks correct
                if (tool.lambdaArn && tool.lambdaArn.includes('${Token[')) {
                    throw new Error(`Tool ${tool.toolId} has unresolved CDK token in lambdaArn: ${tool.lambdaArn}`);
                }
            });
        }

        // Handle different CloudFormation operations
        console.log(`Processing ${event.RequestType} request`);

        const makeRequest: MakeRequestFn = createMakeRequestFn(chatAdminApiId, stage, region);

        switch (event.RequestType) {
            case 'Create':
            case 'Update':
                console.log(`${event.RequestType} request for agent ${agentData.agent.agentId} on behalf of ${agentData.userId}`);

                try {
                    console.log('Making API request to /api/chat-admin/agent-data with payload:', JSON.stringify(agentData, null, 2));
                    const result = await makeRequest<AgentAndTools>('POST', `/api/chat-admin/agent-data`, agentData);
                    console.log('API response received:', JSON.stringify(result, null, 2));
                    
                    if (result) {
                        const toolsList = result.tools?.map((tool) => tool.toolId).join(', ') ?? 'none';
                        console.log(`Successfully created or updated agent ${agentData.agent.agentId}, tools: ${toolsList}`);
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

                responseCommon.PhysicalResourceId = agentData.agent.agentId;
                break;

            case 'Delete':
                console.log('We do not support deleting agents when the stack is deleted, doing nothing');
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
