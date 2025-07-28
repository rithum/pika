import { ensureDomainExists } from '../../lib/opensearch/index-initializer';
import { DomainIndices, isDomainIndex } from '../../lib/opensearch/types';
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse, CloudFormationCustomResourceResponseCommon, Context, Handler } from 'aws-lambda';
import { sendCustomResourceResponse } from '../agent-custom-resource/util';

/**
 * This is a lambda function that will be registered as a custom resource in the CloudFormation template.
 * It will be called by CloudFormation when the stack is created, updated, or deleted.
 * It will ensure that the opensearch indices exist and create them if they don't.
 */
export const handler: Handler = async (event: CloudFormationCustomResourceEvent, context: Context): Promise<void> => {
    console.log('DomainIndex Custom Resource Request:', JSON.stringify(event, null, 2));

    const requestType = event.RequestType;
    let response: CloudFormationCustomResourceResponse;
    const baseResponse: CloudFormationCustomResourceResponseCommon = {
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        PhysicalResourceId: context.logGroupName
    };

    try {
        const domainEndpoint = event.ResourceProperties.DomainEndpoint as string | undefined;
        if (!domainEndpoint) {
            throw new Error(`Did not find domainEndpoint in DomainIndex cloudformation custom lambda component: ${JSON.stringify(event)}`);
        }

        console.log(`Setting domainEndpoint to ${domainEndpoint}`);

        // Set the domainEndpoint as an environment variable so it will be found in the opensearch client
        process.env.PIKA_DOMAIN_ENDPOINT = domainEndpoint;

        const domainIndexName = event.ResourceProperties.DomainIndexName as unknown;
        if (!domainIndexName) {
            throw new Error(`Did not find domainIndexName in DomainIndex cloudformation custom lambda component: ${JSON.stringify(event)}`);
        }

        // Validates and narrows domainIndexName to correct type
        if (!isDomainIndex(domainIndexName)) {
            throw new Error(`Expected domainIndexName value ${JSON.stringify(domainIndexName)} to be one of these domain indices: ${DomainIndices.join(', ')}`);
        }

        console.log(`Using domainIndexName ${domainIndexName}`);

        switch (requestType) {
            case 'Create':
                console.log(`Create: making sure the opensearch domain named ${domainIndexName} exists`);
                await ensureDomainExists(domainIndexName);
                baseResponse.PhysicalResourceId = domainIndexName;
                break;
            case 'Update':
                console.log(`Update: making sure the opensearch domain named ${domainIndexName} exists`);
                await ensureDomainExists(domainIndexName);
                baseResponse.PhysicalResourceId = domainIndexName;
                break;
            case 'Delete':
                console.log(`Delete: nothing to do, we don't delete open search domain indices`);
                break;
            default:
                throw new Error(`Unexpected RequestType: ${requestType}`);
        }

        // Success response
        response = {
            ...baseResponse,
            Status: 'SUCCESS',
            Data: {
                domainIndexName,
                Message: `${requestType} operation completed successfully`,
                Timestamp: new Date().toISOString()
            }
        };

        console.log('Operation completed successfully');
    } catch (e) {
        console.error('Error during operation:', e);
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
