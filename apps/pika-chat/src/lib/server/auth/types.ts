import type { RequestEvent } from '@sveltejs/kit';
import type { AuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';

/**
 * Custom exception for authentication failures
 */
export class NotAuthenticatedError extends Error {
    constructor(message: string = 'User not authenticated') {
        super(message);
        this.name = 'NotAuthenticatedError';
    }
}

/**
 * Custom exception for forcing user to re-authenticate (e.g., token expired)
 */
export class ForceUserToReauthenticateError extends Error {
    constructor(message: string = 'User must re-authenticate') {
        super(message);
        this.name = 'ForceUserToReauthenticateError';
    }
}

/**
 * Abstract class that custom authentication providers must extend
 */
export abstract class AuthProvider {
    constructor(protected readonly stage: string) {}

    /**
     * Authenticate the user from the request (when no user cookie exists)
     *
     * This method should:
     * 1. Extract auth tokens from cookies/headers
     * 2. Validate the tokens
     * 3. Fetch user data from your auth provider
     * 4. Return an AuthenticatedUser object
     *
     * OR
     *
     * - Return a Response (for redirects, OAuth flows, etc.)
     * - Throw NotAuthenticatedError if authentication fails
     *
     * The framework will handle the rest (cookie setting, user creation, etc.)
     *
     * @param event - The request event
     * @returns The authenticated user or a response to redirect to
     */
    abstract authenticate(event: RequestEvent): Promise<AuthenticatedUser<unknown> | Response>;

    /**
     * Validate/refresh the user's authentication (when user cookie exists)
     *
     * This method should:
     * 1. Check if the user's auth tokens are still valid
     * 2. Refresh tokens if needed
     * 3. Return the appropriate result
     *
     * Returns:
     * - undefined: No action needed, user is still valid
     * - AuthenticatedUser: Updated user with refreshed tokens (will replace cookie)
     * - Throws ForceUserToReauthenticateError: User must re-authenticate
     */
    validateUser?(event: RequestEvent, user: AuthenticatedUser<unknown>): Promise<AuthenticatedUser<unknown> | undefined>;
}
