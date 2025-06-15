/**
 * Throw this error to return a specific HTTP status code from an API Gateway Lambda function.
 */
export class HttpStatusError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number
    ) {
        super(message);
    }
}
