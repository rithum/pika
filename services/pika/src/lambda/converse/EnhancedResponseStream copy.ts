import { ResponseStream } from 'lambda-stream';
import { UnauthorizedError } from '../../lib/unauthorized-error';
import { sanitizeAndStringifyError } from '../../lib/utils';

/**
 * Extends ResponseStream to track whether data has been written to the stream
 */
export class EnhancedResponseStream extends ResponseStream {
    hasWritten = false;

    _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        this.hasWritten = true;
        super._write(chunk, encoding, callback);
    }

    /**
     * Adds error handling capability to the stream
     * @param error The error to send in the response
     */
    handleError(error: unknown): void {
        this.hasWritten = true;

        let isUnauthorizedError: boolean = false;
        let errorMessage: string;
        if (error instanceof UnauthorizedError) {
            isUnauthorizedError = true;
            errorMessage = 'Unauthorized';
        } else {
            errorMessage = sanitizeAndStringifyError(error);
        }

        const statusCode = isUnauthorizedError ? 401 : 500;
        const metadata = {
            statusCode: statusCode,
            headers: {
                'Content-Type': isUnauthorizedError ? 'text/plain' : 'application/json'
            }
        };

        // Convert this stream to an HttpResponseStream with proper status code
        const httpResponseStream = awslambda.HttpResponseStream.from(this, metadata);

        // Write the error message to the stream
        httpResponseStream.write(errorMessage);
    }
}
