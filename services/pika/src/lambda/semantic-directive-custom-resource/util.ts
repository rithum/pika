import { SemanticDirective, SemanticDirectiveDataRequest } from 'pika-shared/types/chatbot/chatbot-types';
import { constructScope } from 'pika-shared/util/server-client-utils';
import { invokeApi } from '../../lib/invoke-api';

export function parseSemanticDirectiveCustomResourceProperties(str: string): SemanticDirectiveDataRequest {
    let semanticDirectiveData: unknown;
    try {
        semanticDirectiveData = JSON.parse(str) as unknown;
    } catch (e) {
        throw new Error('Failed to JSON parse SemanticDirectiveData: ' + (e instanceof Error ? e.message : String(e)));
    }

    if (typeof semanticDirectiveData !== 'object' || semanticDirectiveData === null) {
        throw new Error('SemanticDirectiveData property when ungzipped and hex decoded is not an object');
    }

    const semanticDirectiveDataObj = semanticDirectiveData as SemanticDirectiveDataRequest;

    if (!semanticDirectiveDataObj.userId) {
        throw new Error('SemanticDirectiveData is missing the userId property');
    }

    if (!semanticDirectiveDataObj.semanticDirectives) {
        throw new Error('SemanticDirectiveData is missing the semanticDirectives property');
    }

    if (!Array.isArray(semanticDirectiveDataObj.semanticDirectives)) {
        throw new Error('SemanticDirectiveData.semanticDirectives must be an array');
    }

    // Validate each semantic directive
    for (let i = 0; i < semanticDirectiveDataObj.semanticDirectives.length; i++) {
        const directive = semanticDirectiveDataObj.semanticDirectives[i];

        if (!directive.scopeType) {
            throw new Error(`SemanticDirectiveData.semanticDirectives[${i}].scopeType is missing: scopeType must be provided for idempotent create/update`);
        }

        if (directive.scopeValue === undefined || directive.scopeValue === null) {
            throw new Error(`SemanticDirectiveData.semanticDirectives[${i}].scopeValue is missing: scopeValue must be provided for idempotent create/update`);
        }

        if (!directive.id) {
            throw new Error(`SemanticDirectiveData.semanticDirectives[${i}].id is missing: id must be provided for idempotent create/update`);
        }

        // Validate that the scopeType and scopeValue can be used to construct a valid scope
        // This will also validate that scopeValues don't contain '#' and agent-entity structure is correct
        try {
            constructScope(directive.scopeType, directive.scopeValue);
        } catch (error) {
            throw new Error(`SemanticDirectiveData.semanticDirectives[${i}] has invalid scopeType/scopeValue: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return semanticDirectiveDataObj;
}

export type MakeRequestFn = <T = SemanticDirective | undefined>(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', path: string, body?: any) => Promise<T | undefined>;

export function createMakeRequestFn(apiId: string, stage: string, region: string): MakeRequestFn {
    return async <T = SemanticDirective | undefined>(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', path: string, body?: any): Promise<T | undefined> => {
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
                    if ('semanticDirective' in response.body) {
                        result = response.body.semanticDirective as T;
                    } else if ('semanticDirectives' in response.body) {
                        // Handle search API response which returns an array in semanticDirectives property
                        result = response.body as T;
                    } else if (method === 'DELETE') {
                        // Delete operations may not return a directive
                        result = undefined;
                    } else {
                        failureCode = response.statusCode;
                        failureMessage = "Response body doesn't have a semanticDirective or semanticDirectives property";
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
