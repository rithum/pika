import { BedrockActionGroupLambdaEvent, BedrockActionGroupLambdaResponse, Parameter } from "../types/chatbot/bedrock";
import { BedrockLambdaError } from "../types/chatbot/bedrock-lambda-error";

/**
 * Handles an error and returns a BedrockLambdaResponse object.
 * 
 * If the error is an instance of BedrockLambdaError, it will be returned as is.
 * Otherwise, it will be converted to a string and returned as a BedrockLambdaError.
 * 
 * @param error The error to handle.
 * @returns A BedrockLambdaResponse object.
 */
export function handleBedrockError<T extends Record<string, any>>(error: unknown, event: BedrockActionGroupLambdaEvent, sessionAttributes?: T): BedrockActionGroupLambdaResponse {
    if (error instanceof BedrockLambdaError) {
        return createBedrockLambdaResponse(error.message, event.actionGroup, event.messageVersion, event.function ?? 'NoFunctionNameSpecified', sessionAttributes);
    } else {
        console.error('Unexpected error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return createBedrockLambdaResponse(errorMessage, event.actionGroup, event.messageVersion, event.function ?? 'NoFunctionNameSpecified', sessionAttributes, true);
    }
}

/**
 * Converter functions for Bedrock parameters.
 */
export const converters: Record<string, (v: string) => any> = {
    defaultPassThrough: (v: string) => v,
    number: (v: string) => parseFloat(v),
    boolean: (v: string) => v === 'true',
    integer: (v: string) => parseInt(v),
    array: (v: string) => {
        try {
            // First try to parse as valid JSON
            return JSON.parse(v);
        } catch {
            /* 
                TODO: is this a good idea?  Why did Bedrock give me a param that was invalid JSON for the array?

                {
                    "name": "s3Keys",
                    "type": "array",
                    "value": "[uploads/2fbbf97a-070d-48ca-9d5e-fc9bcc88e570/019735c5-b0f0-7419-94d5-093b4202977a_sample-data.csv]"
                }
            */
            // If JSON.parse fails, try to handle array with unquoted strings
            // Remove brackets and split by comma, then trim whitespace
            if (v.startsWith('[') && v.endsWith(']')) {
                const content = v.slice(1, -1).trim();
                if (content === '') {
                    return [];
                }
                return content.split(',').map(item => item.trim());
            }
            // If it doesn't look like an array format, return as single-item array
            return [v];
        }
    }
};

/**
 * Converts Bedrock parameters to the correct type.
 * @param params - The parameters to convert.
 * @returns A record of parameter names and their converted values.
 */
export function convertBedrockParamsToCorrectType(params?: Parameter[]): Record<string, any> {
    return (
        params?.reduce(
            (acc, param) => {
                acc[param.name] = converters[param.type]
                    ? converters[param.type](param.value)
                    : converters.defaultPassThrough(param.value);
                return acc;
            },
            {} as Record<string, any>
        ) ?? {}
    );
}

/**
 * Normalizes the session attributes, converting the type to T.  An empty sessionAttributes object is the
 * same as undefined.
 * 
 * Type T is the type of the session attributes.
 * 
 * @param sessionAttributes The session attributes.
 * @returns The normalized session attributes.
 */
export function normalizeSessionAttributes<T>(
    sessionAttributes?: Record<string, any> | undefined
): T | undefined {
    if (!sessionAttributes || Object.keys(sessionAttributes).length === 0) {
        return undefined;
    }

    return sessionAttributes as T;
}

/**
 * Creates a BedrockLambdaResponse object.
 * 
 * Type T is the type of the session attributes.  By including the sessionAttributes
 * parameter, we are telling Bedrock to persist the session attributes for the
 * duration of the session and they will be passed in on all subsequent calls
 * using the event.sessionAttributes parameter.
 * 
 * @param body The body of the response.
 * @param actionGroup The action group.
 * @param messageVersion The message version.
 * @param functionName The function name.
 * @param sessionAttributes The session attributes.
 * @param failed Whether the response is a failure.
 * @returns A BedrockLambdaResponse object.
 */
export function createBedrockLambdaResponse<T extends Record<string, any>>(
    body: string | Record<string, any>,
    actionGroup: string,
    messageVersion: string,
    functionName: string,
    sessionAttributes?: T,
    failed?: boolean
): BedrockActionGroupLambdaResponse {
    return {
        messageVersion,
        response: {
            actionGroup,
            function: functionName,
            functionResponse: {
                ...(failed ? { responseState: "FAILURE" } : {}),
                responseBody: {
                    TEXT: {
                        body: typeof body === 'string' ? body : JSON.stringify(body)
                    }
                }
            }
        },
        sessionAttributes
    };
}
