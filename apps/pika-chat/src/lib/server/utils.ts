import type { ErrorResponse, SuccessResponse } from '$client/app/types';
import { siteFeatures } from '$lib/server/custom-site-features';
import type {
    AuthenticatedUser,
    ChatApp,
    ChatUser,
    ChatAppOverridableFeatures,
    AccessRules,
    RecordOrUndef,
    VerifyResponseFeature,
    ApplyRulesAs,
    TracesFeature,
    VerifyResponseFeatureForChatApp,
    ChatDisclaimerNoticeFeatureForChatApp,
    LogoutFeatureForChatApp,
} from '@pika/shared/types/chatbot/chatbot-types';
import { json } from '@sveltejs/kit';

export function getErrorResponse(status: number, error: string): Response {
    const err: ErrorResponse = {
        success: false,
        error,
    };
    return json(err, { status });
}

export function getSuccessResponse(): Response {
    const success: SuccessResponse = {
        success: true,
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
export function mergeAuthenticatedUserWithExistingChatUser(
    authenticatedUser: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    existingChatUser: ChatUser<RecordOrUndef>
): void {
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
        lastName: existingChatUser.lastName,
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
export function doesUserNeedToProvideDataOverrides(
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    overrideDataForThisChatApp: RecordOrUndef,
    chatAppId: string
): boolean {
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
 * Compute what features the user is and isn't allowed to use for this chat app.  Note that most of these are features that are defined
 * at the site level (<root>/pika-config.ts) and then may be overridden by the chat app.
 *
 * Note that we always return siteAdmin: { websiteEnabled: false } because we only check that for real when they try to access the admin page itself.
 */
export function getOverridableFeatures(
    chatApp: ChatApp,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>
): ChatAppOverridableFeatures {
    const result: ChatAppOverridableFeatures = {
        verifyResponse: {
            enabled: false,
        },
        traces: {
            enabled: false,
            detailedTraces: false,
        },
        // We don't use access rules to determine if the chat disclaimer notice is shown.  If there, it's shown.
        chatDisclaimerNotice:
            siteFeatures?.chatDisclaimerNotice?.notice ??
            (chatApp.features?.chatDisclaimerNotice as ChatDisclaimerNoticeFeatureForChatApp | undefined)?.notice,
        logout: {
            enabled: false,
            menuItemTitle: 'Logout',
            dialogTitle: 'Logout',
            dialogDescription: 'Are you sure you want to logout?',
        },
        siteAdmin: {
            websiteEnabled: false,
        },
    };

    const siteVerifyRespRule = siteFeatures?.verifyResponse || { enabled: false };
    const appVerifyRespRule = chatApp.features?.verifyResponse as VerifyResponseFeatureForChatApp | undefined;

    const resolvedRules = resolveFeatureRules(siteVerifyRespRule, appVerifyRespRule);
    result.verifyResponse.enabled = checkUserAccessToFeature(user, resolvedRules);
    result.verifyResponse.autoRepromptThreshold =
        appVerifyRespRule?.autoRepromptThreshold ?? siteVerifyRespRule.autoRepromptThreshold;

    const siteTracesRule = siteFeatures?.traces || { enabled: false };
    const appTracesRule = chatApp.features?.traces as TracesFeature | undefined;

    const resolvedTracesRules = resolveFeatureRules(siteTracesRule, appTracesRule);
    result.traces.enabled = checkUserAccessToFeature(user, resolvedTracesRules);

    const siteDetailedTracesRule = siteFeatures?.traces?.detailedTraces || { enabled: false };
    const appDetailedTracesRule = (chatApp.features?.traces as TracesFeature)?.detailedTraces || { enabled: false };

    const resolvedDetailedTracesRules = resolveFeatureRules(siteDetailedTracesRule, appDetailedTracesRule);
    result.traces.detailedTraces = checkUserAccessToFeature(user, resolvedDetailedTracesRules);

    const siteLogoutRule = siteFeatures?.logout || { enabled: false };
    const appLogoutRule = chatApp.features?.logout as LogoutFeatureForChatApp | undefined;
    const resolvedLogoutRules = resolveFeatureRules(siteLogoutRule, appLogoutRule);
    result.logout.enabled = checkUserAccessToFeature(user, resolvedLogoutRules);
    result.logout.menuItemTitle =
        appLogoutRule?.menuItemTitle ?? siteLogoutRule.menuItemTitle ?? result.logout.menuItemTitle;
    result.logout.dialogTitle = appLogoutRule?.dialogTitle ?? siteLogoutRule.dialogTitle ?? result.logout.dialogTitle;
    result.logout.dialogDescription =
        appLogoutRule?.dialogDescription ?? siteLogoutRule.dialogDescription ?? result.logout.dialogDescription;

    return result;
}

/**
 * Generic function to resolve feature rules between site-level and app-level configurations.
 *
 * **Rule Resolution Logic:**
 * - If the app provides its own rules (userTypes or userRoles), they override the site-level rules
 * - Otherwise, the site-level rules are used
 *
 * **Enabled Property Handling:**
 * - Site level controls whether the feature can be used at all
 * - If site level is disabled, the feature is off regardless of app settings
 * - If site level is enabled, the app can only turn it off (enabled: false)
 * - If site level is enabled and app doesn't specify enabled, site level enabled value is used
 *
 * @param siteFeature - The site-level feature configuration
 * @param appFeature - The app-level feature configuration (optional)
 * @returns The resolved feature rules to use
 */
export function resolveFeatureRules(siteFeature: AccessRules, appFeature?: AccessRules): AccessRules {
    // Site level controls whether feature can be used at all
    if (!siteFeature.enabled) {
        return {
            enabled: false,
            userTypes: siteFeature.userTypes,
            userRoles: siteFeature.userRoles,
            applyRulesAs: siteFeature.applyRulesAs ?? 'and',
        };
    }

    // Check if app provides its own rules
    if (appFeature && ((appFeature.userTypes && appFeature.userTypes.length > 0) || appFeature.userRoles)) {
        // Use app level rules, but app can only turn off the feature
        return {
            enabled: appFeature.enabled !== false, // Only allow app to turn it off
            userTypes: appFeature.userTypes,
            userRoles: appFeature.userRoles,
            applyRulesAs: appFeature.applyRulesAs ?? 'and',
        };
    } else {
        // Use site level rules
        return {
            enabled: siteFeature.enabled,
            userTypes: siteFeature.userTypes,
            userRoles: siteFeature.userRoles,
            applyRulesAs: siteFeature.applyRulesAs ?? 'and',
        };
    }
}

/**
 * Generic function to check if a user has access to a feature based on user types and roles.
 * This implements the same logic used in get for checking user access rules.
 *
 * **Access Control Logic:**
 * - If the feature is disabled (`enabled: false`), no access regardless of other rules
 * - If no userTypes or userRoles are specified, feature is enabled for all users
 * - If multiple userTypes are provided, a user need only have one of them to have access (OR logic)
 * - If multiple userRoles are provided, a user need only have one of them to have access (OR logic)
 * - If both userTypes and userRoles are provided, the `applyRulesAs` setting determines how they're combined:
 *   - `'and'` (default): User must match a userType AND have a userRole
 *   - `'or'`: User must match a userType OR have a userRole
 *
 * @param user - The authenticated user to check access for
 * @param feature - The feature configuration with user access rules
 * @returns Whether the user has access to the feature
 */
export function checkUserAccessToFeature(
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    feature: AccessRules
): boolean {
    const { enabled, userTypes, userRoles, applyRulesAs = 'and' } = feature;

    // If the feature is disabled, no access regardless of other rules
    if (!enabled) {
        return false;
    }

    // If no rules are specified, feature is enabled for all users
    if (!userTypes && !userRoles) {
        return true;
    }

    // Check user type access
    const userTypeMatches = userTypes ? userTypes.includes(user.userType ?? 'external-user') : true;

    // Check user role access
    const userRoleMatches = userRoles ? (user.roles ?? []).some((role) => userRoles.includes(role as any)) : true;

    // Apply the rules based on the logic specified
    if (applyRulesAs === 'and') {
        return userTypeMatches && userRoleMatches;
    } else {
        return userTypeMatches || userRoleMatches;
    }
}
