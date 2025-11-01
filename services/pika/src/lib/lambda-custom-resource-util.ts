import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse } from 'aws-lambda';
import pRetry, { AbortError } from 'p-retry';

// Type conversion regexes for CloudFormation properties
const numberRegex = /^\d+(?:\.\d*)?$/;
const boolRegex = /^(?:false|true)$/i;
const nullRegex = /^null$/;
const undefinedRegex = /^undefined$/;

/**
 * Fixes the types of values in CloudFormation ResourceProperties.
 * CloudFormation passes all properties as strings, but APIs often need proper types.
 * This recursively converts string values to their appropriate types (number, boolean, null, undefined).
 *
 * @param node - The property value to fix (can be any type)
 * @returns The value with proper typing
 */
export function fixTypes(node: any): any {
    const type = typeof node;
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
            node[i] = fixTypes(node[i]);
        }
    } else if (type === 'object' && node !== null) {
        Object.keys(node).forEach((key) => {
            node[key] = fixTypes(node[key]);
        });
    } else if (type === 'string') {
        if (numberRegex.test(node)) {
            return parseFloat(node);
        } else if (boolRegex.test(node)) {
            return node.toLowerCase() === 'true';
        } else if (nullRegex.test(node)) {
            return null;
        } else if (undefinedRegex.test(node)) {
            return undefined;
        }
    }

    return node;
}

/**
 * Validates a CloudFormation custom resource response before sending it.
 * Throws an AbortError if validation fails.
 */
export function validateCustomResourceResponse(response: CloudFormationCustomResourceResponse): void {
    const required = ['Status', 'StackId', 'RequestId', 'LogicalResourceId', 'PhysicalResourceId'];

    for (const field of required) {
        if (!response[field as keyof CloudFormationCustomResourceResponse]) {
            throw new AbortError(`Missing required field: ${field}`);
        }
    }

    if (!['SUCCESS', 'FAILED'].includes(response.Status)) {
        throw new AbortError('Status must be SUCCESS or FAILED');
    }

    // CloudFormation requires Reason field when Status is FAILED
    if (response.Status === 'FAILED' && !response.Reason) {
        throw new AbortError('Response Reason is required when Status is FAILED');
    }

    const responseSize = JSON.stringify(response).length;
    if (responseSize > 4096) {
        console.warn(`Response size ${responseSize} bytes exceeds CloudFormation 4KB limit`);
        // Don't abort, but warn - CloudFormation might still accept it
    }
}

/**
 * Sends a response to CloudFormation with retry logic.
 * Handles timeouts, network errors, and validates the response before sending.
 *
 * @param event - The CloudFormation custom resource event
 * @param response - The response to send back to CloudFormation
 * @param allowMockResponse - If true, allows mock response URLs (for testing)
 */
export async function sendCustomResourceResponse(
    event: CloudFormationCustomResourceEvent,
    response: CloudFormationCustomResourceResponse,
    allowMockResponse: boolean = false
): Promise<void> {
    const responseUrl = event.ResponseURL;

    if (!responseUrl) {
        throw new Error('ResponseURL is missing from the event');
    }

    // Check if this is a direct invocation (not from CloudFormation)
    if (allowMockResponse && responseUrl.includes('mock-response-url.local')) {
        console.log('Direct invocation detected (mock ResponseURL). Skipping CloudFormation callback.');
        console.log('Operation completed successfully:', {
            status: response.Status,
            physicalResourceId: response.PhysicalResourceId
        });
        return;
    }

    // Validate the response before attempting to send
    validateCustomResourceResponse(response);

    const responseBody = JSON.stringify(response);

    // Configuration constants
    const REQUEST_TIMEOUT_MS = 15000; // 15 seconds per attempt
    const MAX_RETRIES = 5;
    const MIN_RETRY_DELAY_MS = 1000;
    const MAX_RETRY_DELAY_MS = 10000;

    console.log('Sending response to CloudFormation:', {
        url: responseUrl,
        status: response.Status,
        physicalResourceId: response.PhysicalResourceId,
        responseBodyLength: responseBody.length
    });

    await pRetry(
        async (attemptNumber) => {
            console.log(`Attempt ${attemptNumber} to send CloudFormation response`);

            // Create AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, REQUEST_TIMEOUT_MS);

            try {
                const fetchResponse = await fetch(responseUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': '', // CloudFormation expects empty content-type
                        'Content-Length': responseBody.length.toString()
                    },
                    body: responseBody,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!fetchResponse.ok) {
                    const errorText = await fetchResponse.text().catch(() => 'Unable to read error response');

                    // Distinguish between retryable and non-retryable HTTP errors
                    if (fetchResponse.status >= 400 && fetchResponse.status < 500) {
                        // 4xx errors are client errors - don't retry
                        throw new AbortError(`HTTP ${fetchResponse.status}: ${fetchResponse.statusText}. Response: ${errorText}`);
                    } else {
                        // 5xx errors are server errors - can be retried
                        throw new Error(`HTTP ${fetchResponse.status}: ${fetchResponse.statusText}. Response: ${errorText}`);
                    }
                }

                // Read response to ensure complete transfer
                const responseText = await fetchResponse.text();

                console.log('Successfully sent response to CloudFormation', {
                    status: fetchResponse.status,
                    statusText: fetchResponse.statusText,
                    responseLength: responseText.length
                });

                return responseText;
            } catch (e) {
                clearTimeout(timeoutId);

                // Handle different error types appropriately
                if (e instanceof TypeError && e.message.includes('fetch')) {
                    throw new AbortError(`Network error: ${e.message}`);
                }

                // Handle timeout from AbortController
                if (e instanceof Error && e.name === 'AbortError') {
                    console.warn(`Request timeout after ${REQUEST_TIMEOUT_MS / 1000} seconds (attempt ${attemptNumber})`);
                    throw new Error(`Request timeout after ${REQUEST_TIMEOUT_MS / 1000} seconds`); // Retryable
                }

                // If it's already an AbortError from our HTTP error handling, don't retry
                if (e instanceof AbortError) {
                    throw e;
                }

                // Let p-retry handle other errors
                throw e;
            }
        },
        {
            retries: MAX_RETRIES, // Total of 6 attempts (initial + 5 retries)
            factor: 2, // Exponential backoff factor
            minTimeout: MIN_RETRY_DELAY_MS, // Start with 1 second delay
            maxTimeout: MAX_RETRY_DELAY_MS, // Cap at 10 seconds
            randomize: true, // Add jitter to prevent thundering herd
            onFailedAttempt: (error) => {
                console.warn(`Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`, {
                    error: error.message,
                    attemptNumber: error.attemptNumber,
                    retriesLeft: error.retriesLeft
                });
            }
        }
    );

    console.log('CloudFormation response sent successfully after retries');
}

/**
 * Parse stack tags from environment variables.
 * Stack tags are passed as a JSON string in the STACK_TAGS environment variable.
 *
 * @returns Stack tags object, or undefined if not configured
 */
export function getStackTagsFromEnv(): Record<string, string> | undefined {
    const stackTagsJson = process.env.STACK_TAGS;
    if (!stackTagsJson) {
        return undefined;
    }

    try {
        const tags = JSON.parse(stackTagsJson);
        if (typeof tags !== 'object' || tags === null || Array.isArray(tags)) {
            console.warn('STACK_TAGS is not a valid object, ignoring');
            return undefined;
        }
        return tags;
    } catch (e) {
        console.warn('Failed to parse STACK_TAGS environment variable:', e);
        return undefined;
    }
}

/**
 * Parse component tag names from environment variables.
 * Component tag names are passed as a JSON array in the COMPONENT_TAG_NAMES environment variable.
 *
 * @returns Array of component tag names, or undefined if not configured
 */
export function getComponentTagNamesFromEnv(): string[] | undefined {
    const componentTagNamesJson = process.env.COMPONENT_TAG_NAMES;
    if (!componentTagNamesJson) {
        return undefined;
    }

    try {
        const tagNames = JSON.parse(componentTagNamesJson);
        if (!Array.isArray(tagNames)) {
            console.warn('COMPONENT_TAG_NAMES is not a valid array, ignoring');
            return undefined;
        }
        return tagNames;
    } catch (e) {
        console.warn('Failed to parse COMPONENT_TAG_NAMES environment variable:', e);
        return undefined;
    }
}

/**
 * Create component tags based on component tag names from environment variables.
 * If no component tag names are configured, returns an empty object.
 *
 * @param componentValue - The value to use for all component tag keys (e.g., 'MyInferenceProfile')
 * @returns Object with component tags, or empty object if not configured
 */
export function createComponentTags(componentValue: string): Record<string, string> {
    const componentTagNames = getComponentTagNamesFromEnv();
    if (!componentTagNames || componentTagNames.length === 0) {
        return {};
    }

    const tags: Record<string, string> = {};
    for (const tagName of componentTagNames) {
        tags[tagName] = componentValue;
    }
    return tags;
}

/**
 * Merge stack tags with component tags.
 * Component tags take precedence if there's a naming conflict.
 *
 * @param stackTags - General stack tags (from STACK_TAGS env var)
 * @param componentTags - Component-specific tags (from createComponentTags)
 * @returns Merged tags object
 */
export function mergeTagsWithComponentTags(stackTags?: Record<string, string>, componentTags?: Record<string, string>): Record<string, string> {
    return {
        ...(stackTags || {}),
        ...(componentTags || {})
    };
}

/**
 * Get all tags (stack + component) for a resource.
 * Convenience method that combines getStackTagsFromEnv() and createComponentTags().
 *
 * @param componentValue - The component identifier (e.g., 'MyInferenceProfile')
 * @returns Merged tags ready to apply to a resource
 *
 * @example
 * const tags = getAllTagsForResource('MyInferenceProfile');
 * // Returns: { env: 'dev', component: 'MyInferenceProfile', ... }
 */
export function getAllTagsForResource(componentValue: string): Record<string, string> {
    const stackTags = getStackTagsFromEnv();
    const componentTags = createComponentTags(componentValue);
    return mergeTagsWithComponentTags(stackTags, componentTags);
}

/**
 * Convert tags object to AWS Bedrock tag format.
 * Bedrock uses an array of {key, value} objects instead of a flat object.
 * All values are converted to strings since Bedrock requires string tag values.
 *
 * @param tags - Tags object with key-value pairs
 * @returns Array of tag objects in Bedrock format
 *
 * @example
 * const tags = { env: 'dev', component: 'MyProfile' };
 * const bedrockTags = convertTagsToBedrockFormat(tags);
 * // Returns: [{ key: 'env', value: 'dev' }, { key: 'component', value: 'MyProfile' }]
 */
export function convertTagsToBedrockFormat(tags: Record<string, string>): Array<{ key: string; value: string }> {
    return Object.entries(tags).map(([key, value]) => ({ key, value: String(value) }));
}
