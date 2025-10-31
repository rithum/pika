import {
    TAG_DEFINITION_STATUSES,
    TAG_DEFINITION_USAGE_MODES,
    TAG_DEFINITION_WIDGET_TYPES,
    TagDefinitionCreateOrUpdateResponse,
    TagDefinitionDeleteResponse,
    TagDefinitionForCreateOrUpdate,
    TagDefinitionWidgetForCreateOrUpdate
} from 'pika-shared/types/chatbot/chatbot-types';
import { invokeApi } from '../../lib/invoke-api';
import pRetry, { AbortError } from 'p-retry';

export function parseTagDefinitionCustomResourceProperties(str: string): TagDefinitionForCreateOrUpdate<TagDefinitionWidgetForCreateOrUpdate> {
    let tagDefData: unknown;
    try {
        tagDefData = JSON.parse(str) as unknown;
    } catch (e) {
        throw new Error('Failed to JSON parse TagDefData: ' + (e instanceof Error ? e.message : String(e)));
    }

    if (typeof tagDefData !== 'object' || tagDefData === null) {
        throw new Error('TagDefData property when ungzipped and hex decoded is not an object');
    }

    const tagDefDataObj = tagDefData as TagDefinitionForCreateOrUpdate<TagDefinitionWidgetForCreateOrUpdate>;

    if (!tagDefDataObj.tag) {
        throw new Error('TagDefData is missing the tag property');
    }

    if (!tagDefDataObj.scope) {
        throw new Error('TagDefData is missing the scope property');
    }

    if (!tagDefDataObj.widget) {
        throw new Error('TagDefData is missing the widget property');
    }

    const widgetType = tagDefDataObj.widget.type;
    if (!TAG_DEFINITION_WIDGET_TYPES.includes(widgetType)) {
        throw new Error(`TagDefData.widget.type must be one of: ${TAG_DEFINITION_WIDGET_TYPES.join(', ')}, got: ${widgetType}`);
    }

    const status = tagDefDataObj.status;

    if (!status) {
        tagDefDataObj.status = 'enabled';
        console.log('Status not provided, defaulting to "enabled"');
    }

    // Validate status
    if (!TAG_DEFINITION_STATUSES.includes(tagDefDataObj.status)) {
        throw new Error(
            `Tag definition status must be one of: ${TAG_DEFINITION_STATUSES.join(', ')}. ` + `Got: ${tagDefDataObj.status}. ` + `Tag: ${tagDefDataObj.scope}.${tagDefDataObj.tag}`
        );
    }

    // Default and validate usageMode
    if (!tagDefDataObj.usageMode) {
        tagDefDataObj.usageMode = 'chat-app';
        console.log('usageMode not provided, defaulting to "chat-app"');
    }

    if (!TAG_DEFINITION_USAGE_MODES.includes(tagDefDataObj.usageMode)) {
        throw new Error(
            `Tag definition usageMode must be one of: ${TAG_DEFINITION_USAGE_MODES.join(', ')}. ` +
                `Got: ${tagDefDataObj.usageMode}. ` +
                `Tag: ${tagDefDataObj.scope}.${tagDefDataObj.tag}`
        );
    }

    console.log('Tag definition validation passed:', {
        tag: `${tagDefDataObj.scope}.${tagDefDataObj.tag}`,
        usageMode: tagDefDataObj.usageMode,
        status: tagDefDataObj.status,
        widgetType: tagDefDataObj.widget.type
    });

    return tagDefDataObj;
}

export type MakeRequestFn = <T = TagDefinitionCreateOrUpdateResponse | TagDefinitionDeleteResponse | undefined>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: any
) => Promise<T | undefined>;

export function createMakeRequestFn(apiId: string, stage: string, region: string): MakeRequestFn {
    return async <T = TagDefinitionCreateOrUpdateResponse | TagDefinitionDeleteResponse | undefined>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
        path: string,
        body?: any
    ): Promise<T | undefined> => {
        console.log(`Making ${method} request to ${path}`);

        // Configuration constants
        const MAX_RETRIES = 3;
        const MIN_RETRY_DELAY_MS = 1000;
        const MAX_RETRY_DELAY_MS = 5000;

        const result = await pRetry(
            async (attemptNumber) => {
                console.log(`Attempt ${attemptNumber} for ${method} ${path}`);

                try {
                    const response = await invokeApi<T>({
                        apiId,
                        region,
                        stage,
                        method,
                        path,
                        body
                    });

                    console.log(`Request ${method} ${path} succeeded on attempt ${attemptNumber}`);
                    return response;
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    console.error(`Request ${method} ${path} failed on attempt ${attemptNumber}:`, errorMsg);

                    // Check if this is a retryable error
                    if (error instanceof Error) {
                        // 4xx errors are typically not retryable (client errors)
                        if (error.message.includes('400') || error.message.includes('401') || error.message.includes('403') || error.message.includes('404')) {
                            throw new AbortError(`Non-retryable error: ${errorMsg}`);
                        }

                        // 5xx errors are typically retryable (server errors)
                        if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503') || error.message.includes('504')) {
                            throw error; // This will be retried
                        }
                    }

                    // For unknown errors, attempt retry
                    throw error;
                }
            },
            {
                retries: MAX_RETRIES,
                minTimeout: MIN_RETRY_DELAY_MS,
                maxTimeout: MAX_RETRY_DELAY_MS,
                factor: 2,
                onFailedAttempt: (error) => {
                    console.warn(`Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left. Error: ${error.message}`);
                }
            }
        );

        return result.body;
    };
}

// sendCustomResourceResponse is now imported from ../../lib/custom-resource-util in index.ts
// Note: tag-definition-resource uses allowMockResponse=true to support direct invocation for testing

export function getStackNameFromStackId(stackId: string): string {
    // Check if it's a valid CloudFormation stack ARN
    if (!stackId.includes(':stack/')) {
        throw new Error(`Invalid CloudFormation stack ID format: ${stackId}`);
    }

    const parts = stackId.split('/');

    // Should have exactly 3 parts after splitting: [..., 'stack', 'stack-name', 'unique-id']
    if (parts.length !== 3 || !stackId.includes('arn:aws:cloudformation:')) {
        throw new Error(`Invalid CloudFormation stack ID format: ${stackId}`);
    }

    return parts[1]; // The stack name
}
