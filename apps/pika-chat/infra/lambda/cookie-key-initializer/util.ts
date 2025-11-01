import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse } from 'aws-lambda';

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
 * Returns tags in KMS format (array of {TagKey, TagValue} objects).
 * If no component tag names are configured, returns an empty array.
 *
 * @param componentValue - The value to use for all component tag keys (e.g., 'CookieEncryptionKey')
 * @returns Array of KMS tag objects
 */
export function createComponentTagsForKMS(componentValue: string): Array<{ TagKey: string; TagValue: string }> {
    const componentTagNames = getComponentTagNamesFromEnv();
    if (!componentTagNames || componentTagNames.length === 0) {
        return [];
    }

    return componentTagNames.map((tagName) => ({
        TagKey: tagName,
        TagValue: componentValue
    }));
}

export async function sendCustomResourceResponse(event: CloudFormationCustomResourceEvent, response: CloudFormationCustomResourceResponse): Promise<void> {
    const responseUrl = event.ResponseURL;

    if (!responseUrl) {
        throw new Error('ResponseURL is missing from the event');
    }

    // Validate the response before attempting to send
    validateResponse(response);

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

    // Try multiple times with exponential backoff
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            console.log(`Attempt ${attempt} to send CloudFormation response`);

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
                        throw new Error(`HTTP ${fetchResponse.status}: ${fetchResponse.statusText}. Response: ${errorText}`);
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

                return; // Success - exit the function
            } catch (e) {
                clearTimeout(timeoutId);

                // Handle different error types appropriately
                if (e instanceof TypeError && e.message.includes('fetch')) {
                    throw new Error(`Network error: ${e.message}`);
                }

                // Handle timeout from AbortController
                if (e instanceof Error && e.name === 'AbortError') {
                    console.warn(`Request timeout after ${REQUEST_TIMEOUT_MS / 1000} seconds (attempt ${attempt})`);
                    throw new Error(`Request timeout after ${REQUEST_TIMEOUT_MS / 1000} seconds`); // Retryable
                }

                throw e;
            }
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));

            // If it's a 4xx error, don't retry
            if (lastError.message.includes('HTTP 4')) {
                console.error('Non-retryable client error:', lastError.message);
                throw lastError;
            }

            if (attempt <= MAX_RETRIES) {
                // Calculate exponential backoff delay
                const baseDelay = Math.min(MIN_RETRY_DELAY_MS * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS);
                const jitterDelay = baseDelay + Math.random() * 1000; // Add jitter

                console.warn(`Attempt ${attempt} failed. Retrying in ${jitterDelay.toFixed(0)}ms. Error: ${lastError.message}`);

                await new Promise((resolve) => setTimeout(resolve, jitterDelay));
            }
        }
    }

    // If we get here, all retries failed
    if (lastError) {
        throw new Error(`Failed to send CloudFormation response after ${MAX_RETRIES + 1} attempts. Last error: ${lastError.message}`);
    } else {
        throw new Error(`Failed to send CloudFormation response after ${MAX_RETRIES + 1} attempts for unknown reasons`);
    }
}

function validateResponse(response: CloudFormationCustomResourceResponse): void {
    const required = ['Status', 'StackId', 'RequestId', 'LogicalResourceId', 'PhysicalResourceId'];

    for (const field of required) {
        if (!response[field as keyof CloudFormationCustomResourceResponse]) {
            throw new Error(`Missing required field: ${field}`);
        }
    }

    if (!['SUCCESS', 'FAILED'].includes(response.Status)) {
        throw new Error('Status must be SUCCESS or FAILED');
    }

    const responseSize = JSON.stringify(response).length;
    if (responseSize > 4096) {
        console.warn(`Response size ${responseSize} bytes exceeds CloudFormation 4KB limit`);
        // Don't abort, but warn - CloudFormation might still accept it
    }
}
