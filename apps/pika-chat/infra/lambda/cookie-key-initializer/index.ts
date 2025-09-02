import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import type { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse, CloudFormationCustomResourceResponseCommon, Context, Handler } from 'aws-lambda';
import { InfrastructureManager } from '../../../src/lib/server/encryption/InfrastructureManager';
import { rotateKeys } from '../../../src/lib/server/encryption/KeyRotationUtils';
import { KMSProvider } from '../../../src/lib/server/encryption/KMSProvider';
import { SSMKeyProvider } from '../../../src/lib/server/encryption/SSMKeyProvider';
import type { InfrastructureConfig } from '../../../src/lib/server/encryption/types';
import { pikaConfig } from '../../build/pika-config.js';
import { sendCustomResourceResponse } from './util';

let awsAccountId: string;

async function getConfigFromEnvironment(): Promise<InfrastructureConfig> {
    // Extract configuration from environment variables set by CDK
    const stage = process.env.STAGE;
    const ssmParameterPrefix = process.env.SSM_PARAMETER_PREFIX;
    const kmsKeyAlias = process.env.KMS_KEY_ALIAS;
    const maxKeyVersionsString = process.env.MAX_KEY_VERSIONS;

    if (!stage) throw new Error('STAGE environment variable is required');
    if (!ssmParameterPrefix) throw new Error('SSM_PARAMETER_PREFIX environment variable is required');
    if (!kmsKeyAlias) throw new Error('KMS_KEY_ALIAS environment variable is required');
    if (!maxKeyVersionsString) throw new Error('MAX_KEY_VERSIONS environment variable is required');

    const maxKeyVersions = parseInt(maxKeyVersionsString);
    if (isNaN(maxKeyVersions)) {
        throw new Error('MAX_KEY_VERSIONS is not a number');
    }

    const region = process.env.AWS_REGION || 'us-east-1';
    const projNameKebabCase = pikaConfig.pikaChat.projNameKebabCase as string;

    if (!projNameKebabCase) throw new Error('Did not find project name kabab case in pika config');

    if (!awsAccountId) {
        const stsClient = new STSClient({});
        const command = new GetCallerIdentityCommand({});
        const response = await stsClient.send(command);
        if (!response.Account) {
            throw new Error('No account ID found');
        }
        awsAccountId = response.Account;
    }

    return {
        region,
        stage,
        awsAccountId,
        projNameKebabCase,
        ssmParameterPrefix,
        kmsKeyAlias,
        maxKeyVersions: maxKeyVersions
    };
}

/**
 * Custom CloudFormation resource to manage KMS key infrastructure for cookie encryption.
 * Creates KMS keys and aliases on Create/Update, then invokes rotation function for key initialization.
 * Cleans up infrastructure on Delete.
 */
export const handler: Handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
    console.log('Cookie Key Initializer Event:', JSON.stringify(event, null, 2));
    console.log('Context:', JSON.stringify(context, null, 2));

    let response: CloudFormationCustomResourceResponse;
    let responseCommon: CloudFormationCustomResourceResponseCommon = {
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        PhysicalResourceId: context.logStreamName
    };

    try {
        console.log(`Processing ${event.RequestType} request`);

        const config = await getConfigFromEnvironment();
        const kmsProvider = new KMSProvider(config.kmsKeyAlias, config.region);
        const ssmKeyProvider = new SSMKeyProvider(config.ssmParameterPrefix, config.region, config.kmsKeyAlias);
        const infraManager = new InfrastructureManager(config, kmsProvider, ssmKeyProvider);

        switch (event.RequestType) {
            case 'Create':
            case 'Update':
                console.log(`${event.RequestType} request - creating KMS infrastructure if needed`);

                // Create KMS key infrastructure (but not encryption keys) if needed
                await infraManager.createInfrastructure();

                const result = await rotateKeys(ssmKeyProvider, kmsProvider, config.maxKeyVersions, false, context.awsRequestId);

                console.log(`Key ${result.isInitialization ? 'initialization' : 'rotation'} completed: ${result.oldVersion} -> ${result.newVersion}`);

                responseCommon.PhysicalResourceId = `cookie-kms-infrastructure-${config.stage}-${Date.now()}`;
                console.log('KMS infrastructure creation and key initialization completed successfully');
                break;

            case 'Delete':
                console.log('Delete request - cleaning up KMS infrastructure');
                responseCommon.PhysicalResourceId = event.PhysicalResourceId ?? context.logStreamName;

                // We aren't going to go ahead and delete the infrastructure just to be safe.  It's not a lot
                // of infra left over, just a kms key and alias and a few ssm parameters.
                //await kmsManager.deleteInfrastructure();
                console.log('KMS infrastructure cleanup completed: did not delete infrastructure, left up to the user to delete manually');
                break;
        }

        // Success response
        response = {
            ...responseCommon,
            Status: 'SUCCESS',
            Data: {
                Message: `${event.RequestType} operation completed successfully`,
                Timestamp: new Date().toISOString(),
                Stage: config.stage,
                KMSKeyAlias: config.kmsKeyAlias,
                SSMParameterPrefix: config.ssmParameterPrefix
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
