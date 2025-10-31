import { ChatApp, ChatAppDataRequest } from 'pika-shared/types/chatbot/chatbot-types';
import { invokeApi } from '../../lib/invoke-api';

export function parseChatAppCustomResourceProperties(str: string): ChatAppDataRequest {
    let chatAppData: unknown;
    try {
        chatAppData = JSON.parse(str) as unknown;
    } catch (e) {
        throw new Error('Failed to JSON parse ChatAppData: ' + (e instanceof Error ? e.message : String(e)));
    }

    if (typeof chatAppData !== 'object' || chatAppData === null) {
        throw new Error('ChatAppData property when ungzipped and hex decoded is not an object');
    }

    const chatAppDataObj = chatAppData as ChatAppDataRequest;

    if (!chatAppDataObj.chatApp) {
        throw new Error('ChatAppData is missing the chatApp property');
    }

    if (!chatAppDataObj.userId) {
        throw new Error('ChatAppData is missing the userId property');
    }

    if (!chatAppDataObj.chatApp.chatAppId) {
        throw new Error('ChatAppData.chatApp.chatAppId is missing: chatAppId must be provided for idempotent create/update');
    }

    return chatAppDataObj;
}

export type MakeRequestFn = <T = ChatApp | undefined>(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', path: string, body?: any) => Promise<T | undefined>;

export function createMakeRequestFn(apiId: string, stage: string, region: string): MakeRequestFn {
    return async <T = ChatApp | undefined>(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', path: string, body?: any): Promise<T | undefined> => {
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
                    if ('chatApp' in response.body) {
                        result = response.body.chatApp as T;
                    } else {
                        failureCode = response.statusCode;
                        failureMessage = "Response body doesn't have a chatApp property";
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
