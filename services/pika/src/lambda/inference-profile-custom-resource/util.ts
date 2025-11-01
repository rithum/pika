import { BedrockClient, CreateInferenceProfileCommand, GetInferenceProfileCommand, TagResourceCommand } from '@aws-sdk/client-bedrock';
import { getAllTagsForResource, convertTagsToBedrockFormat } from '../../lib/lambda-custom-resource-util';

export interface InferenceProfileProperties {
    modelSource: {
        copyFrom: string;
    };
    inferenceProfileName: string;
    description?: string;
    tags?: Array<{ key: string; value: string }>;
}

/**
 * Parses and validates the inference profile custom resource properties
 */
export function parseInferenceProfileCustomResourceProperties(obj: Record<string, any>): InferenceProfileProperties {
    if (!obj.modelSource) {
        throw new Error('InferenceProfileProperties is missing the modelSource property');
    }

    if (typeof obj.modelSource !== 'object' || obj.modelSource === null) {
        throw new Error('InferenceProfileProperties.modelSource must be an object');
    }

    if (!obj.modelSource.copyFrom) {
        throw new Error('InferenceProfileProperties.modelSource is missing the copyFrom property');
    }

    if (!obj.inferenceProfileName) {
        throw new Error('InferenceProfileProperties is missing the inferenceProfileName property');
    }

    return {
        modelSource: {
            copyFrom: obj.modelSource.copyFrom
        },
        inferenceProfileName: obj.inferenceProfileName,
        description: obj.description,
        tags: obj.tags
    };
}

/**
 * Creates a new inference profile using AWS Bedrock
 * This function is idempotent - checks if profile exists first
 */
export async function createInferenceProfile(client: BedrockClient, properties: InferenceProfileProperties): Promise<string> {
    console.log('Creating inference profile with properties:', JSON.stringify(properties, null, 2));

    // Merge tags from environment variables with tags from properties
    // Use the inference profile name as the component identifier for component tags
    const envTags = getAllTagsForResource(properties.inferenceProfileName);
    const envBedrockTags = convertTagsToBedrockFormat(envTags);

    // Merge with any existing tags from properties (properties take precedence)
    // Deduplicate by key to avoid Bedrock rejecting the request
    const existingTags = properties.tags || [];
    const tagMap = new Map<string, string>();

    // Add environment tags first
    for (const tag of envBedrockTags) {
        tagMap.set(tag.key, String(tag.value));
    }

    // Properties tags override environment tags (take precedence)
    for (const tag of existingTags) {
        tagMap.set(tag.key, String(tag.value));
    }

    // Convert back to array - ensure all values are strings for Bedrock API
    const mergedTags = Array.from(tagMap.entries()).map(([key, value]) => ({ key, value: String(value) }));

    // Update properties with merged tags
    const propertiesWithTags = {
        ...properties,
        tags: mergedTags.length > 0 ? mergedTags : undefined
    };

    console.log('Merged tags for inference profile:', JSON.stringify(mergedTags, null, 2));

    // First, check if the profile already exists (idempotency)
    try {
        console.log(`Checking if inference profile already exists: ${properties.inferenceProfileName}`);
        const getResponse = await client.send(
            new GetInferenceProfileCommand({
                inferenceProfileIdentifier: properties.inferenceProfileName
            })
        );

        if (getResponse.inferenceProfileArn) {
            console.log(`Inference profile already exists: ${getResponse.inferenceProfileArn}`);

            // Try to update tags if provided
            if (mergedTags.length > 0) {
                console.log(`Attempting to update tags on existing profile...`);
                try {
                    await client.send(
                        new TagResourceCommand({
                            resourceARN: getResponse.inferenceProfileArn,
                            tags: mergedTags
                        })
                    );
                    console.log(`Successfully updated tags on existing profile`);
                } catch (tagError: any) {
                    // If we can't update tags due to system tags, log warning but don't fail
                    if (tagError.message?.includes('cannot change or delete a system tag') || tagError.message?.includes('system tag') || tagError.name === 'ValidationException') {
                        console.warn(`Warning: Could not update tags (likely due to system tags): ${tagError.message}`);
                    } else {
                        // Other tag errors - log but don't fail the operation
                        console.warn(`Warning: Failed to update tags: ${tagError.message}`);
                    }
                }
            }

            console.log('Using existing profile (idempotent operation)');
            return getResponse.inferenceProfileArn;
        }
    } catch (e: any) {
        // ResourceNotFoundException means it doesn't exist yet - that's expected
        if (e.name === 'ResourceNotFoundException' || e.message?.includes('not found')) {
            console.log('Inference profile does not exist yet, will create it');
        } else {
            // Some other error checking if it exists - log warning but continue to create
            console.warn('Warning: Could not check if profile exists, attempting to create:', e.message);
        }
    }

    // Profile doesn't exist, create it
    try {
        console.log('Creating new inference profile...');
        const createResponse = await client.send(new CreateInferenceProfileCommand(propertiesWithTags));
        console.log('CreateInferenceProfile response:', JSON.stringify(createResponse, null, 2));

        if (!createResponse.inferenceProfileArn) {
            throw new Error('CreateInferenceProfile response is missing inferenceProfileArn');
        }

        console.log(`Successfully created inference profile: ${createResponse.inferenceProfileArn}`);
        return createResponse.inferenceProfileArn;
    } catch (e: any) {
        // Handle edge case where profile was created between our check and create (race condition)
        if (e.name === 'ConflictException' || e.message?.includes('already exists')) {
            const expectedArn = `arn:aws:bedrock:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:application-inference-profile/${properties.inferenceProfileName}`;
            console.log(`Profile was created concurrently. Using: ${expectedArn}`);
            return expectedArn;
        }

        // If we can't update tags, log a warning but don't fail
        if (e.message?.includes('cannot change or delete a system tag') || e.message?.includes('tag')) {
            console.warn('Warning: Tag operation failed, but profile may have been created:', e.message);
            const expectedArn = `arn:aws:bedrock:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:application-inference-profile/${properties.inferenceProfileName}`;
            return expectedArn;
        }

        throw e;
    }
}

/**
 * Handles deletion of an inference profile
 * Note: We don't actually delete the profile - we just log the event.
 * This preserves the profile for reuse across stack deletions/recreations.
 */
export async function deleteInferenceProfile(client: BedrockClient, inferenceProfileIdentifier: string): Promise<void> {
    console.log('CloudFormation Delete event received for inference profile:', inferenceProfileIdentifier);
    console.log('Skipping actual deletion to preserve inference profile for future use');
    console.log('If you need to delete this profile, do so manually via AWS Console or CLI');
}
