import { ResponseStream } from 'lambda-stream';

/**
 * Interface for the enhanced ResponseStream with additional tracking capabilities
 * This is now an interface rather than a class since we use a Proxy to enhance
 * the original ResponseStream
 */
export interface EnhancedResponseStream extends ResponseStream {
    /**
     * Tracks whether any data has been written to the stream
     */
    hasWritten: boolean;

    /**
     * Handles errors by sending appropriate HTTP response
     * @param error The error to send in the response
     */
    handleError(error: unknown): void;
}
