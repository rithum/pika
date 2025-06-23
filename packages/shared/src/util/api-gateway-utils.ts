/**
 * Utility functions and types for AWS API Gateway Lambda integration.
 * This module provides type-safe wrappers and helpers for handling
 * API Gateway events and responses in AWS Lambda functions.
 */
import {
    APIGatewayEventRequestContextV2,
    APIGatewayProxyEventV2WithRequestContext,
    APIGatewayProxyHandlerV2,
    APIGatewayProxyResultV2,
    APIGatewayProxyStructuredResultV2,
    Context,
    APIGatewayProxyEvent,
    LambdaFunctionURLEvent
} from 'aws-lambda';

/**
 * Extends the standard Error interface to include an optional HTTP status code.
 * This allows for standardized error handling with appropriate HTTP responses.
 */
export interface HttpError extends Error {
    statusCode?: number;
}

/**
 * A type that enhances the standard API Gateway event by replacing the body property
 * with a strongly-typed version rather than the default string representation.
 *
 * @template TRequestBody - The type of the request body after parsing
 * @template TRequestContext - The type of the request context
 */
interface APIGatewayProxyEventPikaWithRequestContext<TRequestBody, TRequestContext> extends Omit<APIGatewayProxyEventV2WithRequestContext<TRequestContext>, 'body'> {
    body: TRequestBody;
}

/**
 * A specialized API Gateway event type that includes:
 * 1. A strongly-typed request body
 * 2. The standard API Gateway request context
 * 3. Additional path and httpMethod properties for routing
 *
 * @template TRequestBody - The type of the parsed request body (defaults to never if not provided)
 */
export type APIGatewayProxyEventPika<TRequestBody = never> = APIGatewayProxyEventPikaWithRequestContext<TRequestBody, APIGatewayEventRequestContextV2> & {
    path: string;
    httpMethod: string;
    resource: string;
};

/**
 * A generic handler type for AWS Lambda functions.
 *
 * @template TEvent - The event type (input) for the handler
 * @template TResult - The result type (output) returned by the handler
 * @returns Either void or a Promise containing the result
 */
export type HandlerPika<TEvent = unknown, TResult = unknown> = (event: TEvent, context: Context) => void | Promise<TResult>;

/**
 * A specialized handler type for API Gateway Lambda integrations with typed request and response.
 *
 * @template B - The request body type (defaults to never if not provided)
 * @template T - The response type (defaults to never if not provided)
 */
export type APIGatewayProxyHandlerPika<B = never, T = never> = HandlerPika<APIGatewayProxyEventPika<B>, APIGatewayProxyResultV2<T>>;

/**
 * Type guard function that determines if the provided data is a structured API Gateway response.
 * A structured response must be an object containing either 'statusCode' or 'body' properties.
 *
 * @template TResponse - The expected response type
 * @param data - The data to check
 * @returns A type predicate indicating if the data is a structured API Gateway response
 */
function isObjectResponse<TResponse>(data: undefined | void | APIGatewayProxyResultV2<TResponse>): data is APIGatewayProxyStructuredResultV2 {
    return data !== null && data !== undefined && typeof data === 'object' && ('statusCode' in data || 'body' in data);
}

/**
 * A higher-order function that wraps a typed Lambda handler to provide:
 * 1. Automatic JSON parsing of the request body
 * 2. Error handling with appropriate status codes
 * 3. Consistent response formatting
 *
 * @template TRequestBody - The expected type of the request body after parsing
 * @template TResponse - The expected type of the response
 * @param fn - The Lambda handler function to wrap
 * @returns A standard API Gateway Lambda handler with error handling and type safety
 */
export function apiGatewayFunctionDecorator<TRequestBody, TResponse>(fn: APIGatewayProxyHandlerPika<TRequestBody, TResponse>): APIGatewayProxyHandlerV2<TResponse> {
    return async (event, context) => {
        let error: HttpError | undefined;
        let response: undefined | void | APIGatewayProxyResultV2<TResponse>;

        // Just in case, add another version of the headers with all lowercase keys;
        // helps when running locally.  Seems APIGateway automatically converts to lowercase
        Object.keys(event.headers).forEach((k) => {
            let lowerK = k.toLowerCase();
            if (!event.headers[lowerK]) {
                event.headers[lowerK] = event.headers[k];
            }
        });
        try {
            // Parse the request body if present and create a typed event object
            const eventWithType: APIGatewayProxyEventPika<TRequestBody> = {
                ...(event as any),
                body: event.body ? JSON.parse(event.body) : undefined
            };

            // Call the handler with the typed event
            response = await fn(eventWithType, context);
        } catch (err) {
            // Capture any errors that occur during processing
            error = err as HttpError;
        }

        // Handle errors by returning an appropriate error response
        if (error) {
            console.error(error);
            return toResponse(typeof error === 'string' ? error : error.message, error.statusCode ?? 500);
        }

        // Return resource not found if the response is undefined
        if (response === undefined) {
            return toResponse(
                {
                    message: 'Resource not found',
                    code: 'RESOURCE_NOT_FOUND'
                },
                404
            );
        }

        // Either return the structured response directly or wrap the result in a standard response
        return isObjectResponse(response) ? response : toResponse(response, 200);
    };
}

/**
 * Creates a standardized API Gateway response object.
 * Handles both string and non-string body types by automatically stringifying as needed.
 *
 * @template T - The type of the response body
 * @param body - The response body to send
 * @param statusCode - The HTTP status code (defaults to 200 OK)
 * @returns A properly formatted API Gateway response object
 */
export function toResponse<T>(body: T, statusCode = 200): APIGatewayProxyStructuredResultV2 {
    return {
        body: typeof body === 'string' ? body : JSON.stringify(body),
        statusCode
    };
}

/**
 * Type definition for Lambda Function URL events with additional IAM authorization details.
 * Extends the standard API Gateway event with specific requestContext properties for
 * Function URL integration patterns.
 *
 * @template T - The request body type
 */
export type LambdaFunctionUrlProxyEventPika<T = never> = APIGatewayProxyEventPika<T> & {
    requestContext: {
        authorizer?: {
            iam: {
                cognitoIdentity?: string;
                cognitoIdentityId?: string;
                userId?: string;
                user?: string;
                callerId?: string;
                caller?: string;
                accessKey?: string;
                principalOrgId?: string;
                accountId?: string;
                userArn?: string;
                [key: string]: any;
            };
        };
        identity?: {
            cognitoIdentity?: string;
            cognitoIdentityId?: string;
            user?: string;
            userId?: string;
            caller?: string;
            callerId?: string;
            accessKey?: string;
            principalOrgId?: string;
            accountId?: string;
            userArn?: string;
            [key: string]: any;
        };
    };
};

/**
 * Converts a Lambda Function URL event into a standardized API Gateway event.
 * This function ensures that IAM authorization details are properly mapped
 * from the authorizer to the identity property for consistent access patterns.
 *
 * Also, parses the body string into the generic type T if it exists and is a string
 *
 * This exists because the Lambda Function URL event has a different structure
 * than the API Gateway event and we almost never use Lambdas that are Function URL based
 * and so it's easier to just convert the event to a standard API Gateway event than
 * to handle the different event types.
 *
 * @template T - The request body type
 * @param event - The Lambda Function URL event to convert
 * @returns A standardized API Gateway event
 */
export function convertFunctionUrlEventToStandardApiGatewayEvent<T>(event: LambdaFunctionUrlProxyEventPika<T>): APIGatewayProxyEventPika<T> {
    if (event.requestContext.identity == null && event.requestContext.authorizer?.iam != null) {
        event.requestContext.identity = event.requestContext.authorizer.iam;
        event.requestContext.authorizer.iam.cognitoIdentityId = event.headers['cognito-identity-id'];
        event.requestContext.authorizer.iam.user = event.requestContext.authorizer.iam.userId;
        event.requestContext.authorizer.iam.caller = event.requestContext.authorizer.iam.callerId;
    }

    // Parse the body string into the generic type T if it exists and is a string
    if (event.body && typeof event.body === 'string') {
        try {
            // If content-type is not application/json, don't attempt to parse
            const contentType = event.headers['content-type'] || event.headers['Content-Type'];
            if (contentType && contentType.includes('application/json')) {
                event.body = JSON.parse(event.body) as T;
            }
        } catch (error) {
            console.error('Error parsing request body as JSON:', {
                body: event.body,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    return event;
}
