import { AgentDataRequest, AgentDefinition, ToolDefinition, UserMemoryStrategies, UserMemoryStrategy } from 'pika-shared/types/chatbot/chatbot-types';
import { invokeApi } from '../../lib/invoke-api';
import { CloudFormationCustomResourceResourcePropertiesCommon } from 'aws-lambda';

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

// sendCustomResourceResponse is now imported from ../../lib/custom-resource-util in index.ts
