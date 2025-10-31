import { AgentDataRequest, AgentDefinition, ToolDefinition } from 'pika-shared/types/chatbot/chatbot-types';
import { invokeApi } from '../../lib/invoke-api';

export function parseAgentCustomResourceProperties(str: string): AgentDataRequest {
    let agentData: unknown;
    try {
        agentData = JSON.parse(str) as unknown;
    } catch (e) {
        throw new Error('Failed to JSON parse AgentData: ' + (e instanceof Error ? e.message : String(e)));
    }

    if (typeof agentData !== 'object' || agentData === null) {
        throw new Error('AgentData property when ungzipped and hex decoded is not an object');
    }

    const agentDataObj = agentData as AgentDataRequest;

    if (!agentDataObj.agent) {
        throw new Error('AgentData is missing the agent property');
    }

    if (!agentDataObj.userId) {
        throw new Error('AgentData is missing the userId property');
    }

    if (!agentDataObj.agent.agentId) {
        throw new Error('AgentData.agent.agentId is missing: agentId must be provided for idempotent create/update');
    }

    const tools = agentDataObj.tools;
    if (tools) {
        if (!Array.isArray(tools)) {
            throw new Error('AgentData.agent.tools must be an array');
        }

        for (let i = 0; i < tools.length; i++) {
            const tool = tools[i];
            if (!tool.toolId) {
                throw new Error(`AgentData.agent.tools[${i}].toolId is missing: toolId must be provided for idempotent create/update`);
            }
        }
    }

    return agentDataObj;
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
