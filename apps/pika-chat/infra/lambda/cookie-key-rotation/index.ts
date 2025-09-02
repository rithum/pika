import { Context, ScheduledEvent } from 'aws-lambda';
import { rotateKeys } from '../../../src/lib/server/encryption/KeyRotationUtils';
import { KMSProvider } from '../../../src/lib/server/encryption/KMSProvider';
import { SSMKeyProvider } from '../../../src/lib/server/encryption/SSMKeyProvider';

interface RotationEvent {
    // Manual invocation that will force the keys to be immediately rotated.
    forceRotation?: boolean;
}

/**
 * This lambda is used to rotate the cookie encryption keys and is called on a scheduled basis by EventBridge (currently 12 hours).
 * The core functionality used to do the rotation is also used by the key initialization lambda to ensure that on
 * stack deploy the keys are initialized and loaded into SSM Parameter Store.
 *
 * Note you can manually invoke this lambda with the forceRotation event to force a rotation.
 *
 * @param event - When invoked by EventBridge, this event is not present, but you can manually invoke this lambda with this event to force a rotation.
 * @param context - The context object containing the AWS request ID.
 * @returns A promise that resolves to the response object.
 */
export const handler = async (event: ScheduledEvent | RotationEvent, context: Context) => {
    console.log('Cookie key rotation lambda invoked:', JSON.stringify(event, null, 2));

    try {
        // Validate required environment variables
        const missingEnvVars: string[] = [];
        const stage = process.env.STAGE;
        if (!stage) missingEnvVars.push('STAGE');

        const region = process.env.AWS_REGION as string;
        if (!region) missingEnvVars.push('AWS_REGION');

        const ssmParameterPrefix = process.env.SSM_PARAMETER_PREFIX as string;
        if (!ssmParameterPrefix) missingEnvVars.push('SSM_PARAMETER_PREFIX');

        const kmsKeyAlias = process.env.KMS_KEY_ALIAS as string;
        if (!kmsKeyAlias) missingEnvVars.push('KMS_KEY_ALIAS');

        const maxKeyVersionsString = process.env.MAX_KEY_VERSIONS as string;
        if (!maxKeyVersionsString) missingEnvVars.push('MAX_KEY_VERSIONS');

        if (missingEnvVars.length > 0) {
            throw new Error('Missing required env vars: ' + missingEnvVars.join(', '));
        }

        const maxKeyVersions = parseInt(maxKeyVersionsString);
        if (isNaN(maxKeyVersions)) {
            throw new Error('MAX_KEY_VERSIONS is not a number');
        }

        const rotationEvent = event as RotationEvent;
        const forceRotation = !rotationEvent ? false : rotationEvent.forceRotation === true || String(rotationEvent.forceRotation) === 'true';

        console.log('Configuration:', { stage, ssmParameterPrefix, kmsKeyAlias, maxKeyVersions, forceRotation });

        const ssmKeyProvider = new SSMKeyProvider(ssmParameterPrefix, region, kmsKeyAlias);
        const kmsProvider = new KMSProvider(kmsKeyAlias, region);
        const result = await rotateKeys(ssmKeyProvider, kmsProvider, maxKeyVersions, forceRotation, context.awsRequestId);

        console.log(`Key ${result.isInitialization ? 'initialization' : 'rotation'} completed: ${result.oldVersion} -> ${result.newVersion}`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Key ${result.isInitialization ? 'initialization' : 'rotation'} completed successfully`,
                oldVersion: result.oldVersion,
                newVersion: result.newVersion,
                activeVersions: result.activeVersions,
                isInitialization: result.isInitialization
            })
        };
    } catch (error) {
        console.error('Cookie key rotation failed:', error);

        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Cookie key rotation failed',
                error: errorMessage
            })
        };
    }
};
