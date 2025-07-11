import type { AccessRules, ChatApp, ChatAppOverride, ChatUser, UserChatAppRule, UserType } from '@pika/shared/types/chatbot/chatbot-types';

/**
 * This function is used to get the matching chat apps for a user.  It is used to get the chat apps that the user is allowed to access.
 *
 * All rules follow this pattern: if there's an override, it wins otherwise use the value on the chatApp.
 *
 * First, we will filter out any chat apps that are disabled.
 *
 * Then, if there's an override we check if there are rules to exclusively only allow chat apps in the allowed list.
 *
 * Then, we check if the user has access to the chat app using the general access rules.
 *
 * Finally, if we are getting apps for the home page, we will apply the homePageFilterRules to the list of chat apps if there
 * are any and remove any test apps.
 *
 * @param userType The user who is either internal or external user.
 * @param userRoles The user's roles (optional).
 * @param chatAppsForHomePage If true, then we will return the list of apps that the user is allowed to see on the home page.
 *        Note that this could be different than the list of apps that the user is allowed to access
 *        if they don't want to show a given app on the home page.
 * @param homePageFilterRules These will only be present if we are getting the chat apps to show on the home page.
 * @param chatApps The list of all chat apps.
 * @param customDataFieldPathToMatchUsersEntity The path to the custom data field that is used to match against the user's entity,
 *        such as the user's account or company.
 */
export function getMatchingChatApps(
    user: ChatUser,
    chatAppsForHomePage: boolean,
    homePageFilterRules: UserChatAppRule[],
    chatApps: ChatApp[],
    customDataFieldPathToMatchUsersEntity?: string
): ChatApp[] {
    // First, make sure we only return chat apps that are enabled.
    let apps = chatApps.filter((chatApp) => {
        const override = chatApp.override;
        if (override) {
            if (override.enabled === false) {
                return false;
            }
        }
        return chatApp.enabled;
    });

    // Then, we need to check if the user has access to the chat app using the override rules if present or the general access rules.
    apps = apps.filter((chatApp) => {
        const override = chatApp.override;
        if (override) {
            return checkUserAccessToChatAppUsingOverride(user, override, customDataFieldPathToMatchUsersEntity);
        } else {
            return checkUserAccessToChatAppUsingGeneralAccessRules(user, chatApp);
        }
    });

    // Lastly, if we are only supposed to return the chat apps for the home page, then we need to make sure they
    // can show on the home page for this user and that they aren't test apps.
    if (chatAppsForHomePage) {
        // Filter out any test apps.
        apps = apps.filter((chatApp) => {
            return !chatApp.test;
        });

        // Figure out which chat apps are allowed to show on the home page for this user.
        apps = apps.filter((chatApp) => {
            const override = chatApp.override;
            const userTypes = override?.userTypes || chatApp.userTypes || ['internal-user'];
            if (override && override.homePageFilterRules) {
                return checkUserAccessBasedOnRules(user, userTypes, override.homePageFilterRules);
            } else if (homePageFilterRules) {
                return checkUserAccessBasedOnRules(user, userTypes, homePageFilterRules);
            } else {
                return true;
            }
        });
    }

    return apps;
}

function checkUserAccessBasedOnRules(user: ChatUser, userTypes: UserType[], homePageFilterRules: UserChatAppRule[]): boolean {
    const userType = user.userType ?? 'external-user';

    // Check if any rule allows this chat app for the current user type
    let isAllowed = false;

    for (const rule of homePageFilterRules) {
        // Check if this rule applies to the current user type
        if (rule.userTypes && !rule.userTypes.includes(userType)) {
            continue;
        }

        // Check if the chat app's allowed user types match the rule's chat app user types
        if (rule.chatAppUserTypes && rule.chatAppUserTypes.length > 0) {
            isAllowed = userTypes.some((allowedType) => rule.chatAppUserTypes!.includes(allowedType));
        }
    }

    return isAllowed;
}

/**
 * This function checks if a user has access to a chat app using the override rules.
 *
 * Here's the order of precedence:
 *
 * 1. enabled: If present, overrides the chatApp.enabled setting. If not enabled, no one can access the chat app.
 * 2. exclusiveUserIdAccessControl: If provided, only allow these userIds to access the chat app, whether internal or external, doesn't matter.  All other access rules are ignored.
 * 3. exlusive user typeaccess control
 *     exclusiveInternalAccessControl: If provided, only allow these entities to access the chat app for internal users.
 *     exclusiveExternalAccessControl: If provided, only allow these entities to access the chat app for external users.
 * 4. userTypes/userRoles/applyRulesAs: If provided, only allow these user types to access the chat app (internal-user and/or external-user), otherwise falls back to chatApp.userTypes.
 *
 * @param userType - The user type to check access for
 * @param override - The override rules to check against
 * @param customDataFieldPathToMatchUsersEntity - The path to the custom data field that is used to match against the user's entity,
 *        such as the user's account or company.  This is used with exclusiveInternalAccessControl and exclusiveExternalAccessControl.
 * @returns True if the user has access to the chat app, false otherwise
 */
function checkUserAccessToChatAppUsingOverride(user: ChatUser, override: ChatAppOverride, customDataFieldPathToMatchUsersEntity?: string): boolean {
    if (override.enabled === false) {
        return false;
    }

    if (override.exclusiveUserIdAccessControl) {
        return override.exclusiveUserIdAccessControl.includes(user.userId);
    }

    const userType = user.userType ?? 'external-user';

    let accessControl = userType === 'internal-user' ? override.exclusiveInternalAccessControl : override.exclusiveExternalAccessControl;
    if (accessControl && accessControl.length > 0) {
        if (customDataFieldPathToMatchUsersEntity) {
            const entity = getEntityFromCustomData(user.customData, customDataFieldPathToMatchUsersEntity);
            const matches = !!entity && accessControl.includes(entity);
            console.log(`[getMatchingChatApps] Entity: ${entity} for user: ${user.userId} matches access control: ${accessControl} ${matches ? 'YES' : 'NO'}`);
            return matches;
        } else {
            console.log(`[getMatchingChatApps] No custom data field path to match users entity provided, so user doesn't have access to this chat app.`);
            return false;
        }
    }

    // If we get here, then we are going to use the general access rules to determine if the user has access to the chat app.
    return checkUserAccessToChatAppUsingGeneralAccessRules(user, override);
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
function checkUserAccessToChatAppUsingGeneralAccessRules(user: ChatUser, rules: AccessRules): boolean {
    const { enabled, userTypes, userRoles, applyRulesAs = 'and' } = rules;

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

/**
 * Extracts a value from custom data using a dot-notation path.
 * Supports nested object traversal like "account.company.id".
 *
 * @param customData - The custom data object to extract from
 * @param customDataFieldPathToMatchUsersEntity - Dot-notation path to the field (e.g., "account.company.id")
 * @returns The value at the specified path, or undefined if not found
 */
function getEntityFromCustomData(customData: Record<string, any> | undefined, customDataFieldPathToMatchUsersEntity: string): string | undefined {
    if (!customData) {
        console.log(
            `[getMatchingChatApps] No customData attribute found on user, so returning undefined.  This could be a bug in the Pika config since we only call this when we want to find the user's entity.`
        );
        return undefined;
    }

    // Split the path by dots to handle nested properties
    const pathSegments = customDataFieldPathToMatchUsersEntity.split('.');
    let current: any = customData;

    // Traverse the nested path
    for (const segment of pathSegments) {
        if (current == null || typeof current !== 'object') {
            return undefined;
        }
        current = current[segment];
    }

    // Return the value if it's a string, or convert to string if it's a primitive
    if (typeof current === 'string') {
        return current;
    } else if (typeof current === 'number' || typeof current === 'boolean') {
        return String(current);
    }

    return undefined;
}
