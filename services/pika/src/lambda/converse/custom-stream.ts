import type { Callback, Context, LambdaFunctionURLEvent, LambdaFunctionURLResult } from 'aws-lambda';
import { streamifyResponse as originalStreamifyResponse, ResponseStream } from 'lambda-stream';
import type { EnhancedResponseStream } from './EnhancedResponseStream';
import { UnauthorizedError } from '../../lib/unauthorized-error';
import { sanitizeAndStringifyError } from '../../lib/utils';
import { HttpStatusError } from '@pika/shared/util/http-status-error';

/**
 * Custom wrapper for streamifyResponse that uses EnhancedResponseStream instead of the default ResponseStream
 */
export type EnhancedStreamingHandler<TEvent = LambdaFunctionURLEvent, TResult = LambdaFunctionURLResult> = (
    ev: TEvent,
    responseStream: EnhancedResponseStream,
    ctx?: Context,
    callback?: Callback<TResult>
) => TResult | Promise<TResult>;

/**
 * Creates an enhanced stream using a Proxy to intercept writes and add custom functionality
 */
function createEnhancedStream(originalStream: ResponseStream): EnhancedResponseStream {
    let hasWritten = false;

    const handler: ProxyHandler<ResponseStream> = {
        get(target, prop, receiver) {
            // Handle our custom properties first
            if (prop === 'hasWritten') {
                return hasWritten;
            }

            // Handle our custom handleError method
            if (prop === 'handleError') {
                return function (error: unknown) {
                    hasWritten = true;

                    let statusCode: number = 500;
                    let isUnauthorizedError: boolean = false;
                    let errorMessage: string;
                    if (error instanceof UnauthorizedError) {
                        statusCode = 401;
                        isUnauthorizedError = true;
                        errorMessage = 'Unauthorized';
                    } else if (error instanceof HttpStatusError) {
                        statusCode = error.statusCode;
                        errorMessage = sanitizeAndStringifyError(error);
                    } else {
                        statusCode = 500;
                        errorMessage = sanitizeAndStringifyError(error);
                    }

                    const metadata = {
                        statusCode: statusCode,
                        headers: {
                            'Content-Type': isUnauthorizedError ? 'text/plain' : 'application/json'
                        }
                    };

                    // Convert this stream to an HttpResponseStream with proper status code
                    // Use 'target' here to ensure we're using the original stream
                    const httpResponseStream = awslambda.HttpResponseStream.from(target, metadata);

                    // Write the error message to the stream
                    httpResponseStream.write(errorMessage);
                };
            }

            // Get the original value
            const original = Reflect.get(target, prop, target);

            // Intercept write methods to track hasWritten
            if ((prop === '_write' || prop === 'write') && typeof original === 'function') {
                return function (this: any, ...args: any[]) {
                    hasWritten = true;
                    // Use 'this' from the function call context, falling back to target if needed
                    return original.apply(this === receiver ? target : this, args);
                };
            }

            // For all other properties and methods, return as-is
            // This includes all EventEmitter methods, other stream methods, and properties
            return original;
        },

        // Ensure 'in' operator works correctly
        has(target, prop) {
            return prop in target || prop === 'hasWritten' || prop === 'handleError';
        },

        // Handle property setting
        set(target, prop, value, receiver) {
            if (prop === 'hasWritten') {
                hasWritten = value;
                return true;
            }
            // For all other properties, set on the original target
            return Reflect.set(target, prop, value, target);
        },

        // Ensure the proxy is recognized as the correct type
        getPrototypeOf(target) {
            return Object.getPrototypeOf(target);
        }
    };

    return new Proxy(originalStream, handler) as any as EnhancedResponseStream;
}

/**
 * Custom version of streamifyResponse that enhances the ResponseStream with tracking capabilities
 */
export function enhancedStreamifyResponse<TEvent = any, TResult = void>(
    handler: EnhancedStreamingHandler<TEvent, TResult>
): (event: TEvent, responseStream: ResponseStream, context?: Context, callback?: Callback<TResult>) => TResult | Promise<TResult> {
    // Return a function that matches the signature expected by lambda-stream
    return originalStreamifyResponse(async (ev, responseStream, ctx, callback) => {
        // Create our enhanced stream using a Proxy
        const enhancedStream = createEnhancedStream(responseStream);

        // Call the handler with our enhanced stream
        return handler(ev, enhancedStream, ctx, callback);
    });
}
