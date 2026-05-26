import type { ErrorResponse, SuccessResponse } from '$client/app/types';
import { isUserAllowedAdminAccess } from '$lib/custom/site-admin';
import { siteFeatures } from '$lib/server/custom-site-features';
import { error, isHttpError, json } from '@sveltejs/kit';
import { type AuthenticatedUser, type ChatUser, type RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

export function getErrorResponse(status: number, error: string): Response {
    const err: ErrorResponse = {
        success: false,
        error
    };
    return json(err, { status });
}

export function getSuccessResponse(): Response {
    const success: SuccessResponse = {
        success: true
    };
    return json(success);
}

export function addSecurityHeaders(response: Response): Response {
    // TODO: Change this to only allow embedding from the enterprise site
    //response.headers.set('Content-Security-Policy', "frame-ancestors 'self' *.dsco.io http://localhost:*");
    response.headers.set('Content-Security-Policy', 'frame-ancestors *');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-XSS-Protection', '1; mode=block'); // Note: X-XSS-Protection is deprecated by modern browsers, consider CSP.
    response.headers.set('Referrer-Policy', 'strict-origin');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    response.headers.append(
        'Permissions-Policy',
        'geolocation=(self), ' +
            'microphone=(self), ' +
            'camera=(self), ' +
            'midi=(self), ' +
            'fullscreen=(self), ' +
            'accelerometer=(self), ' +
            'gyroscope=(self), ' +
            'magnetometer=(self), ' +
            'publickey-credentials-get=(self), ' +
            'sync-xhr=(self), ' +
            'usb=(self), ' +
            'serial=(self), ' +
            'xr-spatial-tracking=(self), ' +
            'payment=(self), ' +
            'picture-in-picture=(self)'
    );
    return response;
}

export function concatUrlWithPath(baseUrl: string, path: string): string {
    const url = new URL(baseUrl);
    url.pathname = path;
    return url.toString();
}

/**
 * If someone has added pika:xxx roles to the chat user database that may have been added indepently of the auth provider, we need to merge them in
 * to the authenticated user object.
 *
 * @param authenticatedUser - The authenticated user object
 * @param existingChatUser - The existing chat user object
 * @returns The merged authenticated user object
 */
export function mergeAuthenticatedUserWithExistingChatUser(authenticatedUser: AuthenticatedUser<RecordOrUndef, RecordOrUndef>, existingChatUser: ChatUser<RecordOrUndef>): void {
    if (existingChatUser.roles && existingChatUser.roles.length > 0) {
        const pikaRoles = existingChatUser.roles.filter((role) => role.startsWith('pika:'));
        if (pikaRoles.length > 0) {
            if (!authenticatedUser.roles) {
                authenticatedUser.roles = [];
            }
            // Add any missing roles to the authenticated user
            for (const role of pikaRoles) {
                if (!authenticatedUser.roles?.includes(role)) {
                    authenticatedUser.roles.push(role);
                }
            }
        }
    }

    // TODO: We should merge everything except the protected pieces of the authenticatedUser
    // Merge features, and user name
    Object.assign(authenticatedUser, {
        features: existingChatUser.features,
        firstName: existingChatUser.firstName,
        lastName: existingChatUser.lastName
    });
}

/**
 * Whether the user is allowed to use the user data overrides feature.
 *
 * @param user - The user to check
 * @returns Whether the user is allowed to use the user data overrides feature
 */
export function isUserAllowedToUseUserDataOverrides(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>): boolean {
    let result = siteFeatures?.userDataOverrides?.enabled ?? false;
    if (result) {
        // If they didn't specify whom to turn this feature on for, we default it to be only for internal users
        const userTypes = siteFeatures?.userDataOverrides?.userTypes ?? ['internal-user'];
        // If there is no user type on the logged in user, we assume they are an external user
        if (!userTypes.includes(user.userType ?? 'external-user')) {
            result = false;
        }
    }
    return result;
}

/**
 * Whether the user is a content admin.  The site feature must be enabled for this to return true.
 * The user must have the `pika:content-admin` role as well.
 *
 * @param user - The user to check
 * @returns Whether the user is a content admin
 */
export function isUserContentAdmin(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>): boolean {
    let result = siteFeatures?.contentAdmin?.enabled ?? false;
    if (result) {
        result = user.roles?.includes('pika:content-admin') ?? false;
    }
    return result;
}

export function isUserSiteAdmin(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>): boolean {
    let result = siteFeatures?.siteAdmin?.websiteEnabled ?? false;
    if (result) {
        result = user.roles?.includes('pika:site-admin') ?? false;
    }
    return result;
}

export async function isUserAllowedToUseSessionInsights(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>): Promise<boolean> {
    return (await isUserAllowedAdminAccess(user)) && (siteFeatures?.siteAdmin?.sessionInsights?.enabled ?? false);
}

export function isUserAllowedToUseSpecificUserAccessControl(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>): boolean {
    let result = siteFeatures?.siteAdmin?.supportSpecificUserAccessControl?.enabled ?? false;
    if (result) {
        result = user.roles?.includes('pika:site-admin') ?? false;
    }
    return result;
}

export function isUserAllowedToUseEntityAccessControl(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>): boolean {
    let result = (siteFeatures?.entity?.enabled && siteFeatures?.siteAdmin?.supportUserEntityAccessControl?.enabled) ?? false;
    if (result) {
        result = user.roles?.includes('pika:site-admin') ?? false;
    }
    return result;
}

/**
 * Determines whether a user needs to provide data overrides before accessing a chat app.
 *
 * This function checks if the user is allowed to use the user data overrides feature and
 * whether any required custom data attributes are missing, null, undefined, or empty from their user object.
 *
 * @param user - The authenticated user object to check
 * @returns `true` if the user needs to provide data overrides, `false` otherwise
 *
 * @example
 * ```ts
 * // Simple attributes (no dots) - checks direct properties
 * const user = { id: '123', customData: { companyName: 'Acme', companyId: '' } };
 * // If config requires ['companyName', 'companyId']
 * const needsOverrides = doesUserNeedToProvideDataOverrides(user);
 * // Returns true because 'companyId' is empty string
 * ```
 *
 * @example
 * ```ts
 * // Nested attributes with dot notation
 * const user = { id: '123', customData: { address: { street: '123 Main St' } } };
 * // If config requires ['address.city', 'address.street']
 * const needsOverrides = doesUserNeedToProvideDataOverrides(user);
 * // Returns true because 'address.city' is missing
 * ```
 */
export function doesUserNeedToProvideDataOverrides(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>, overrideDataForThisChatApp: RecordOrUndef, chatAppId: string): boolean {
    // First check if the user is even allowed to use the user data overrides feature
    if (!isUserAllowedToUseUserDataOverrides(user)) {
        return false;
    }

    const attributes = siteFeatures?.userDataOverrides?.promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing ?? [];

    // If no attributes are configured to check, then no overrides are needed
    if (attributes.length === 0) {
        return false;
    }

    let customUserData: RecordOrUndef = overrideDataForThisChatApp || user.customData;

    // If the user doesn't have the data required for this chat app, they need to provide overrides
    if (!customUserData) {
        return true;
    }

    // Check if any of the required attributes are missing
    for (const attribute of attributes) {
        // Dereference the attribute understanding they may have used dot notation
        const attributeParts = attribute.split('.');
        let currentValue: any = customUserData;

        // Navigate through nested object properties
        for (const part of attributeParts) {
            if (currentValue === null || currentValue === undefined || typeof currentValue !== 'object') {
                return true; // Path doesn't exist or we hit a non-object value
            }
            currentValue = currentValue[part];
        }

        // Check if the final value exists and is not null/undefined
        if (currentValue === null || currentValue === undefined || currentValue === '') {
            return true; // Required attribute is missing
        }
    }

    return false;
}

/**
 * Compare two arrays of strings for equality.  The arrays are the same if they have the same length and the same values
 * whether they are in the same order or not.
 *
 * @param a - The first array to compare
 * @param b - The second array to compare
 * @returns True if the arrays are equal, false otherwise
 */
export function arraysEqual(a: string[] | undefined, b: string[] | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return a === b;
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, i) => val === sortedB[i]);
}

/**
 * Utility class for handling errors that come from API Gateway calls.
 * Provides status code information that can be used by SvelteKit route handlers.
 */
export class ApiGatewayError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly operation: string
    ) {
        super(message);
        this.name = 'ApiGatewayError';
    }
}

/**
 * Checks API Gateway HTTP status codes and throws appropriate ApiGatewayError instances.
 * This creates consistent error messages based on the resource type.
 *
 * @param response The API Gateway response object
 * @param operation The operation name for logging and error context
 * @param resourceName The human-readable resource name (e.g., "shared session", "tag definitions")
 * @param userId Optional user ID for logging context
 */
export function checkApiGatewayResponse(response: { statusCode: number; body?: any }, operation: string, resourceName: string, userId?: string): void {
    // Check HTTP status codes with detailed server-side logging
    console.log(`${operation} API Gateway response: status=${response.statusCode}, operation=${operation}${userId ? `, userId=${userId}` : ''}`);

    if (response.statusCode === 400) {
        // Use server error message if available, otherwise fall back to generic message
        const serverMessage =
            response.body && typeof response.body === 'string' ? response.body : response.body && response.body.message ? response.body.message : 'Invalid request parameters';
        throw new ApiGatewayError(serverMessage, 400, operation);
    } else if (response.statusCode === 401) {
        throw new ApiGatewayError('Unauthorized', 401, operation);
    } else if (response.statusCode === 403) {
        throw new ApiGatewayError(`User does not have permission to access ${resourceName}`, 403, operation);
    } else if (response.statusCode === 404) {
        throw new ApiGatewayError(`${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)} not found`, 404, operation);
    } else if (response.statusCode !== 200) {
        throw new ApiGatewayError(`API Gateway returned unexpected status ${response.statusCode}`, response.statusCode, operation);
    }
}

/**
 * Handles errors from functions that call API Gateway and throws SvelteKit errors.
 * This should be used in SvelteKit route handlers after calling functions that may
 * throw ApiGatewayError instances.
 *
 * @param e The caught error
 * @param operation Description of the operation for logging
 */
export function handleApiGatewayError(e: unknown, operation: string): never {
    console.error(`SvelteKit Server Error in ${operation}:`, e);

    // First, check if this is a SvelteKit HttpError and rethrow it directly
    // This preserves the original status code and message from throw error()
    if (isHttpError(e)) {
        throw e;
    }

    if (e instanceof ApiGatewayError) {
        // Use the actual error message from the ApiGatewayError,
        // which may contain server-provided details
        throw error(e.status, e.message);
    }

    if (e instanceof Error) {
        throw error(500, 'Internal server error');
    }

    throw error(500, 'Unknown error occurred');
}

/**
 * Parse WEB_COMPONENT_URLS environment variable.
 *
 * Format: {scope}.{tag}::{url};{scope}.{tag}::{url}
 *
 * Example:
 * WEB_COMPONENT_URLS='weather.favorite-cities::http://localhost:5173/favorite-cities.js;weather.city-selector::http://localhost:5173/city-selector.js'
 *
 * Note: Uses double colon (::) to separate key from URL to avoid conflicts with URL colons.
 */
export function parseWebComponentUrlsFromEnvVar(envVar: string): Record<string, string> | undefined {
    if (envVar) {
        const result: Record<string, string> = {};
        const parts = envVar.split(';');
        for (const part of parts) {
            const [key, value] = part.split('::');
            result[key] = value;
        }
        return result;
    }
}

/**
 * Validates that a redirect URL is safe to use.
 * Only allows relative paths (starting with /) to prevent open redirect attacks.
 *
 * @param redirectPath - The redirect path to validate
 * @returns The validated path if safe, or null if unsafe
 */
export function validateRedirectPath(redirectPath: string | null): string | null {
    if (!redirectPath || redirectPath.trim() === '') {
        return null;
    }

    // Reject absolute URLs (http://, https://)
    if (redirectPath.match(/^https?:\/\//i)) {
        console.warn('[Utils] Rejected absolute URL redirect:', redirectPath);
        return null;
    }

    // Reject protocol-relative URLs (//)
    if (redirectPath.startsWith('//')) {
        console.warn('[Utils] Rejected protocol-relative URL redirect:', redirectPath);
        return null;
    }

    // Reject javascript: and data: URLs
    if (redirectPath.match(/^(javascript|data):/i)) {
        console.warn('[Utils] Rejected dangerous protocol redirect:', redirectPath);
        return null;
    }

    // Only allow relative paths starting with /
    if (!redirectPath.startsWith('/')) {
        console.warn('[Utils] Rejected non-relative path redirect:', redirectPath);
        return null;
    }

    // Reject path traversal attempts - check if any segment is '..'
    const pathSegments = redirectPath.split('/').filter((segment) => segment.length > 0);
    if (pathSegments.includes('..')) {
        console.warn('[Utils] Rejected path traversal attempt:', redirectPath);
        return null;
    }

    return redirectPath;
}
