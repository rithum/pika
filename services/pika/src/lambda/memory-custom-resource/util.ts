import { AgentDataRequest, AgentDefinition, ToolDefinition, UserMemoryStrategies, UserMemoryStrategy } from 'pika-shared/types/chatbot/chatbot-types';
import { invokeApi } from '../../lib/invoke-api';
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResourcePropertiesCommon, CloudFormationCustomResourceResponse } from 'aws-lambda';
import pRetry, { AbortError } from 'p-retry';

export interface MemoryCustomResourceProperties {
    MemoryName: string;
    Stage: string;
    ProjNameKebabCase: string;
    EventExpiryDuration: number;
    Strategies: string[];
}

export function parseMemoryCustomResourceProperties(obj: CloudFormationCustomResourceResourcePropertiesCommon): MemoryCustomResourceProperties {
    const rawObj = obj as unknown as Record<string, any>;

    if (!rawObj.MemoryName) {
        throw new Error('MemoryCustomResourceProperties is missing the MemoryName property');
    }

    if (!rawObj.Stage) {
        throw new Error('MemoryCustomResourceProperties is missing the Stage property');
    }

    if (!rawObj.ProjNameKebabCase) {
        throw new Error('MemoryCustomResourceProperties is missing the ProjNameKebabCase property');
    }
    if (rawObj.EventExpiryDuration === undefined || rawObj.EventExpiryDuration === null) {
        throw new Error('MemoryCustomResourceProperties is missing the EventExpiryDuration property');
    }
    if (!rawObj.Strategies) {
        throw new Error('MemoryCustomResourceProperties is missing the Strategies property');
    }

    // Convert EventExpiryDuration from string to number since CloudFormation passes all properties as strings
    const eventExpiryDuration = typeof rawObj.EventExpiryDuration === 'string' ? parseInt(rawObj.EventExpiryDuration, 10) : rawObj.EventExpiryDuration;

    if (isNaN(eventExpiryDuration)) {
        throw new Error(`EventExpiryDuration must be a valid number, received: ${rawObj.EventExpiryDuration}`);
    }

    const strategies = rawObj.Strategies;
    if (strategies) {
        if (!Array.isArray(strategies)) {
            throw new Error('MemoryCustomResourceProperties.Strategies must be an array');
        }

        for (const strategy of strategies) {
            if (!UserMemoryStrategies.includes(strategy as UserMemoryStrategy)) {
                throw new Error(`MemoryCustomResourceProperties.Strategies contains an invalid strategy: ${strategy}`);
            }
        }
    }

    return {
        MemoryName: rawObj.MemoryName,
        Stage: rawObj.Stage,
        ProjNameKebabCase: rawObj.ProjNameKebabCase,
        EventExpiryDuration: eventExpiryDuration,
        Strategies: rawObj.Strategies
    };
}

export type MakeRequestFn = <T = AgentDefinition | ToolDefinition | ToolDefinition[] | undefined>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: any
) => Promise<T | undefined>;

export function createMakeRequestFn(apiId: string, stage: string, region: string): MakeRequestFn {
    return async <T = AgentDefinition | ToolDefinition | ToolDefinition[] | undefined>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
        path: string,
        body?: any
    ): Promise<T | undefined> => {
        let failureCode: number | undefined;
        let failureMessage: string | undefined;
        let result: T | undefined;

        try {
            const response = await invokeApi({
                apiId,
                stage,
                path,
                method,
                body,
                region
            });

            console.log('API response received with code:', response.statusCode, 'and body:', JSON.stringify(response.body, null, 2));

            if (!response.body) {
                failureCode = response.statusCode;
                failureMessage = 'No response body';
            } else if (response.statusCode >= 200 && response.statusCode < 300) {
                if (typeof response.body === 'object' && 'success' in response.body && response.body.success) {
                    if ('agent' in response.body && 'tools' in response.body) {
                        result = {
                            agent: response.body.agent as AgentDefinition,
                            tools: response.body.tools as ToolDefinition[]
                        } as T;
                    } else if ('agent' in response.body) {
                        result = response.body.agent as T;
                    } else if ('tool' in response.body) {
                        result = response.body.tool as T;
                    } else if ('tools' in response.body) {
                        result = response.body.tools as T;
                    } else {
                        failureCode = response.statusCode;
                        failureMessage = "Response body doesn't have an agent or tool property";
                    }
                } else {
                    failureCode = response.statusCode;
                    failureMessage = "Response body either doesn't have a success property or the success property is not true";
                }
            } else {
                failureCode = response.statusCode;
                failureMessage = response.body ?? 'Unknown error';
            }
        } catch (error) {
            console.error(`Request to ${path} failed for ${method}:`, error);
            throw error;
        }

        if (failureCode && failureMessage) {
            throw new Error(`Request to ${path} failed for ${method} with status code ${failureCode}: ${failureMessage}`);
        } else {
            console.log(`Request to ${path} completed successfully for ${method}`);
            return result;
        }
    };
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

function validateResponse(response: CloudFormationCustomResourceResponse): void {
    const required = ['Status', 'StackId', 'RequestId', 'LogicalResourceId', 'PhysicalResourceId'];

    for (const field of required) {
        if (!response[field as keyof CloudFormationCustomResourceResponse]) {
            throw new AbortError(`Missing required field: ${field}`);
        }
    }

    if (!['SUCCESS', 'FAILED'].includes(response.Status)) {
        throw new AbortError('Status must be SUCCESS or FAILED');
    }

    const responseSize = JSON.stringify(response).length;
    if (responseSize > 4096) {
        console.warn(`Response size ${responseSize} bytes exceeds CloudFormation 4KB limit`);
        // Don't abort, but warn - CloudFormation might still accept it
    }
}
