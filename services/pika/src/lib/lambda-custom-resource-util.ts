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
