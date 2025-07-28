import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse, CloudFormationCustomResourceResponseCommon, Context, Handler } from 'aws-lambda';
import { sendCustomResourceResponse } from '../agent-custom-resource/util';

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

/**
 * This lambda function is triggered as a CloudFormation custom resource.
 * It sends an initial message to the session insights runner queue to bootstrap the continuous processing.
 */
export const handler: Handler = async (event: CloudFormationCustomResourceEvent, context: Context): Promise<void> => {
    console.log('Session Insights Initial Trigger Custom Resource Request:', JSON.stringify(event, null, 2));

    const requestType = event.RequestType;
    let response: CloudFormationCustomResourceResponse;
    const baseResponse: CloudFormationCustomResourceResponseCommon = {
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        PhysicalResourceId: context.logGroupName
    };

    try {
        const queueUrl = event.ResourceProperties.QueueUrl as string | undefined;
        if (!queueUrl) {
            throw new Error(`Did not find QueueUrl in Session Insights Initial Trigger cloudformation custom lambda component: ${JSON.stringify(event)}`);
        }

        console.log(`Using queue URL: ${queueUrl}`);

        switch (requestType) {
            case 'Create':
                console.log('Create: Sending initial message to session insights runner queue');
                await sqsClient.send(
                    new SendMessageCommand({
                        QueueUrl: queueUrl,
                        MessageBody: JSON.stringify({
                            trigger: 'initial-deployment',
                            timestamp: new Date().toISOString()
                        })
                    })
                );
                baseResponse.PhysicalResourceId = `session-insights-initial-trigger-${Date.now()}`;
                break;
            case 'Update':
                console.log('Update: No action needed for session insights runner queue');
                break;
            case 'Delete':
                console.log('Delete: No action needed for session insights runner queue');
                break;
            default:
                throw new Error(`Unexpected RequestType: ${requestType}`);
        }

        // Success response
        response = {
            ...baseResponse,
            Status: 'SUCCESS',
            Data: {
                queueUrl,
                Message: `${requestType} operation completed successfully`,
                Timestamp: new Date().toISOString()
            }
        };

        console.log('Session insights initial trigger completed successfully');
    } catch (e) {
        console.error('Error during session insights initial trigger:', e);
        let errorMsg = e instanceof Error ? e.message + ' ' + e.stack : String(e);
        errorMsg = errorMsg.length > 300 ? errorMsg.substring(0, 300) + '...' : errorMsg;

        response = {
            ...baseResponse,
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
