import type { RequestEvent } from '@sveltejs/kit';
import type { AuthenticatedUser, AuthenticateResult, CustomDataUiRepresentation, RecordOrUndef } from '@pika/shared/types/chatbot/chatbot-types';

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
 * Abstract class that custom authentication providers must extend.
 *
 * Type T is the type of the auth data you will have, if any, type U is the type of the custom data.
 */
export abstract class AuthProvider<T extends RecordOrUndef = undefined, U extends RecordOrUndef = undefined> {
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
     * When you return the AuthenticatedUser object, the framework will handle the rest (save full AuthenticatedUser in a cookie)
     * and will save the user in a DynamoDB chat-user table.  The first template argument is the auth data type, the second is the
     * custom data type.  AuthData will be persisted securely in a cookie but not saved to the database and will not be sent to the
     * agent or your agent tools.  CustomData will be saved to the database on the user object and will be available to your agent
     * tools but NOT the agent itself.
     *
     * @param event - The request event
     * @returns The authenticated user or a response to redirect to or both (to indicate logged in and redirect to the URL specified).
     *          If neither are present, we are not authenticated and we will redirect to the login page.
     */
    abstract authenticate(event: RequestEvent): Promise<AuthenticateResult<T, U>>;

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
    validateUser?(event: RequestEvent, user: AuthenticatedUser<T, U>): Promise<AuthenticatedUser<T, U> | undefined>;

    /**
     * Add a value to the locals for the route.  This is useful for adding values to the locals for the route that are not part of the
     * AuthenticatedUser object.  For example, lets say that you redirect to /auth/client-auth since you need to start authentication
     * from the client side.  Maybe you need some URLs in the client side so you can start the auth process.  You can add them to the
     * locals object and then access them in the +page.server.ts of your route and then pass then into your +page.svelte.
     *
     * So, you return an object and we will add it to the locals object in a key named 'customData'.  The type of the object
     * is the return type of this method.
     *
     * @param pathName - For convenience, the path name of the route with any trailing slashes removed
     * @param event - The request event (so you can check the path)
     * @param user - The authenticated user (if there is one)
     * @returns The object to add to the locals object in a key named 'customData'
     */
    async addValueToLocalsForRoute?(pathName: string, event: RequestEvent, user: AuthenticatedUser<T, U> | undefined): Promise<Record<string, unknown> | undefined>;

    /**
     * Logout the user.  This is called when the user clicks the logout menu item.  This menu item is only available if you have
     * turned on the logout feature in pika-config.ts for the given user type/role.  Pika will handle deleting its own cookies after
     * calling this method, if you provide it.
     *
     * @param event - The request event
     * @param user - The authenticated user (if there is one)
     * @returns If a string it is assumed to be a redirect path and we will redirect to that path. For example, if you want to redirect to /logout to do client side logout.
     *          If undefined, we will redirect to the login page.
     */
    async logout?(event: RequestEvent, user: AuthenticatedUser<T, U>): Promise<string | undefined>;

    /**
     * Get the UI representation of the custom data.  This is used to display the custom data in the UI.
     *
     * If you don't want this to appear in the UI, return undefined.
     *
     * Remember that the whole point of this is to show additional information about the account/company/entity
     * the user is logged in as.  There are two places you could pull from, you could pull from
     * user.customData (which may or may not be set) or you could pull from user.overrideData (which is set
     * if the user has overridden the data).  You should pull from user.overrideData if it is set and
     * user.customData if it is not set.
     *
     * @param user - The authenticated user (if there is one)
     * @param chatAppId - The chat app ID (if there is one), useful to know which override data to use if needed
     * @returns The UI representation of the custom data
     */
    async getCustomDataUiRepresentation?(user: AuthenticatedUser<T, U>, chatAppId?: string): Promise<CustomDataUiRepresentation | undefined>;
}
