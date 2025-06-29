import type { ErrorResponse, SuccessResponse } from '$client/app/types';
import { siteFeatures } from '$lib/server/custom-site-features';
import type { AuthenticatedUser, ChatUser, RecordOrUndef } from '@pika/shared/types/chatbot/chatbot-types';
import { json } from '@sveltejs/kit';

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
        const userTypesAllowed = siteFeatures?.userDataOverrides?.userTypesAllowed ?? ['internal-user'];
        // If there is no user type on the logged in user, we assume they are an external user
        if (!userTypesAllowed.includes(user.userType ?? 'external-user')) {
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
