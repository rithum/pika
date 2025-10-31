import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse, CloudFormationCustomResourceResponseCommon, Context, Handler } from 'aws-lambda';
import { BedrockClient } from '@aws-sdk/client-bedrock';
import { createInferenceProfile, deleteInferenceProfile, parseInferenceProfileCustomResourceProperties } from './util';
import { sendCustomResourceResponse, fixTypes } from '../../lib/lambda-custom-resource-util';

/**
 * Custom resource handler for creating/updating/deleting AWS Bedrock inference profiles.
 * This allows tracking costs in a fine-grained way by creating copied inference models.
 *
 * Input Properties:
 * - modelSource: { copyFrom: string } - The ARN of the model to copy from
 * - inferenceProfileName: string - The name for the inference profile
 * - description?: string - Optional description
 * - tags?: Array<{ key: string, value: string }> - Optional tags
 *
 * Output:
 * - PhysicalResourceId: The ARN of the created inference profile
 *
 * @param event - CloudFormation custom resource event
 * @param context - Lambda context
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
        // Validate required environment variables
        const region = process.env.AWS_REGION;
        if (!region) {
            throw new Error('AWS_REGION environment variable not found');
        }
        console.log('AWS_REGION:', region);

        // Initialize Bedrock client
        const client = new BedrockClient({ region });

        // Handle different CloudFormation operations
        console.log(`Processing ${event.RequestType} request`);

        switch (event.RequestType) {
            case 'Create': {
                console.log('Creating new inference profile');

                // Fix types from CloudFormation strings to proper types, then parse and validate
                const properties = parseInferenceProfileCustomResourceProperties(fixTypes(event.ResourceProperties));

                // Create the inference profile
                const inferenceProfileArn = await createInferenceProfile(client, properties);

                // Set the ARN as the physical resource ID
                responseCommon.PhysicalResourceId = inferenceProfileArn;
                console.log('Successfully created inference profile:', inferenceProfileArn);

                break;
            }

            case 'Update': {
                console.log('Update requires delete and recreate for inference profiles');

                // Fix types from CloudFormation strings to proper types, then parse and validate
                const properties = parseInferenceProfileCustomResourceProperties(fixTypes(event.ResourceProperties));

                // Delete the old inference profile if it exists
                if (event.PhysicalResourceId && event.PhysicalResourceId !== context.logStreamName) {
                    console.log('Deleting old inference profile:', event.PhysicalResourceId);
                    await deleteInferenceProfile(client, event.PhysicalResourceId);
                }

                // Create the new inference profile
                const inferenceProfileArn = await createInferenceProfile(client, properties);

                // Set the new ARN as the physical resource ID
                responseCommon.PhysicalResourceId = inferenceProfileArn;
                console.log('Successfully recreated inference profile:', inferenceProfileArn);

                break;
            }

            case 'Delete': {
                console.log('Deleting inference profile');

                // Only attempt to delete if we have a valid physical resource ID
                if (event.PhysicalResourceId && event.PhysicalResourceId !== context.logStreamName) {
                    await deleteInferenceProfile(client, event.PhysicalResourceId);
                    console.log('Successfully deleted inference profile:', event.PhysicalResourceId);
                } else {
                    console.log('No inference profile to delete (invalid PhysicalResourceId)');
                }

                // Use the existing physical resource ID for delete operations
                responseCommon.PhysicalResourceId = event.PhysicalResourceId ?? context.logStreamName;

                break;
            }
        }

        // Success response
        response = {
            ...responseCommon,
            Status: 'SUCCESS',
            Data: {
                Message: `${event.RequestType} operation completed successfully`,
                Timestamp: new Date().toISOString(),
                InferenceProfileArn: responseCommon.PhysicalResourceId
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
