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
     * Tracks whether HTTP headers have been set via setHeaders()
     */
    headersSet: boolean;

    /**
     * Sets HTTP response headers. Safe to call multiple times - only the first call takes effect.
     * Must be called before any writes to the stream.
     * @param sessionId The session ID to include in the x-chatbot-session-id header
     */
    setHeaders(sessionId: string): void;

    /**
     * Handles errors by sending appropriate HTTP response
     * @param error The error to send in the response
     */
    handleError(error: unknown): void;
}
