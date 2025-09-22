import type { AccessRules, ChatApp, ChatAppOverride, ChatUser, RecordOrUndef, UserChatAppRule, UserType } from 'pika-shared/types/chatbot/chatbot-types';
import { getEntityFromCustomData } from './utils';

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
    user: ChatUser<RecordOrUndef>,
    chatAppsForHomePage: boolean,
    homePageFilterRules: UserChatAppRule[],
    chatApps: ChatApp[],
    customDataFieldPathToMatchUsersEntity?: string
): ChatApp[] {
    console.log('getMatchingChatApps (server-side) called with:', {
        userId: user.userId,
        userType: user.userType,
        userRoles: user.roles,
        chatAppsForHomePage,
        homePageFilterRulesCount: homePageFilterRules.length,
        homePageFilterRules,
        chatAppsCount: chatApps.length,
        customDataFieldPathToMatchUsersEntity,
        userCustomData: user.customData
    });

    console.log(
        'Input chat apps:',
        chatApps.map((app) => ({
            chatAppId: app.chatAppId,
            title: app.title,
            enabled: app.enabled,
            userTypes: app.userTypes,
            userRoles: app.userRoles,
            hasOverride: !!app.override,
            overrideEnabled: app.override?.enabled
        }))
    );

    // First, make sure we only return chat apps that are enabled.
    let apps = chatApps.filter((chatApp) => {
        const override = chatApp.override;
        let isEnabled = false;
        if (override) {
            if (override.enabled === false) {
                console.log(`Chat app ${chatApp.chatAppId} disabled by override`);
                return false;
            }
            isEnabled = chatApp.enabled;
        } else {
            isEnabled = chatApp.enabled;
        }
        console.log(`Chat app ${chatApp.chatAppId} enabled status: ${isEnabled}`);
        return isEnabled;
    });

    console.log(
        `After enabled filter: ${apps.length}/${chatApps.length} apps remaining:`,
        apps.map((app) => app.chatAppId)
    );

    // Then, we need to check if the user has access to the chat app using the override rules if present or the general access rules.
    apps = apps.filter((chatApp) => {
        const override = chatApp.override;
        let hasAccess = false;
        if (override) {
            console.log(`Checking access for ${chatApp.chatAppId} using override rules`);
            hasAccess = checkUserAccessToChatAppUsingOverride(user, override, customDataFieldPathToMatchUsersEntity);
        } else {
            console.log(`Checking access for ${chatApp.chatAppId} using general access rules`);
            hasAccess = checkUserAccessToChatAppUsingGeneralAccessRules(user, chatApp);
        }
        console.log(`${hasAccess ? 'HAS' : 'DOES NOT HAVE'} access to ${chatApp.chatAppId}`);
        return hasAccess;
    });

    console.log(
        `After access control filter: ${apps.length} apps remaining:`,
        apps.map((app) => app.chatAppId)
    );

    // Lastly, if we are only supposed to return the chat apps for the home page, then we need to make sure they
    // can show on the home page for this user and that they aren't test apps.
    if (chatAppsForHomePage) {
        console.log('Applying home page filters...');

        // Filter out any test apps.
        const beforeTestFilter = apps.length;
        apps = apps.filter((chatApp) => {
            const test = chatApp.testType === 'mock';
            if (test) {
                console.log(`Filtering out test app: ${chatApp.chatAppId}`);
            }
            return !test;
        });
        console.log(`After test filter: ${apps.length}/${beforeTestFilter} apps remaining`);

        // Figure out which chat apps are allowed to show on the home page for this user.
        const beforeHomePageFilter = apps.length;
        apps = apps.filter((chatApp) => {
            const override = chatApp.override;
            const userTypes = override?.userTypes || chatApp.userTypes || [];
            let canShowOnHomePage = false;

            if (override && override.homePageFilterRules) {
                console.log(`Checking home page access for ${chatApp.chatAppId} using override home page rules:`, override.homePageFilterRules);
                canShowOnHomePage = checkUserAccessBasedOnRules(user, userTypes, override.homePageFilterRules);
            } else if (homePageFilterRules) {
                console.log(`Checking home page access for ${chatApp.chatAppId} using provided home page rules:`, homePageFilterRules);
                canShowOnHomePage = checkUserAccessBasedOnRules(user, userTypes, homePageFilterRules);
            } else {
                console.log(`No home page filter rules for ${chatApp.chatAppId}, allowing by default`);
                canShowOnHomePage = true;
            }

            console.log(`${chatApp.chatAppId} ${canShowOnHomePage ? 'CAN' : 'CANNOT'} show on home page for user ${user.userId}`);
            return canShowOnHomePage;
        });
        console.log(`After home page filter: ${apps.length}/${beforeHomePageFilter} apps remaining`);
    }

    console.log('Final getMatchingChatApps result:', {
        originalCount: chatApps.length,
        finalCount: apps.length,
        finalApps: apps.map((app) => ({
            chatAppId: app.chatAppId,
            title: app.title
        }))
    });

    return apps;
}

function checkUserAccessBasedOnRules(user: ChatUser<RecordOrUndef>, userTypes: UserType[], homePageFilterRules: UserChatAppRule[]): boolean {
    const userType = user.userType ?? 'external-user';

    console.log(`checkUserAccessBasedOnRules for user ${user.userId}:`, {
        userType,
        userTypes,
        homePageFilterRules
    });

    // Check if any rule allows this chat app for the current user type
    let isAllowed = false;

    for (const rule of homePageFilterRules) {
        console.log(`Checking rule:`, rule);

        // Check if this rule applies to the current user type
        if (rule.userTypes && !rule.userTypes.includes(userType)) {
            console.log(`Rule doesn't apply to user type ${userType}, skipping`);
            continue;
        }

        // Check if the chat app's allowed user types match the rule's chat app user types
        if (rule.chatAppUserTypes && rule.chatAppUserTypes.length > 0) {
            const matches = userTypes.some((allowedType) => rule.chatAppUserTypes!.includes(allowedType));
            console.log(`Checking if chat app user types ${JSON.stringify(userTypes)} match rule chat app user types ${JSON.stringify(rule.chatAppUserTypes)}: ${matches}`);
            isAllowed = matches;
        }
    }

    console.log(`checkUserAccessBasedOnRules result: ${isAllowed}`);
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
function checkUserAccessToChatAppUsingOverride(user: ChatUser<RecordOrUndef>, override: ChatAppOverride, customDataFieldPathToMatchUsersEntity?: string): boolean {
    console.log(`checkUserAccessToChatAppUsingOverride for user ${user.userId}:`, {
        overrideEnabled: override.enabled,
        exclusiveUserIdAccessControl: override.exclusiveUserIdAccessControl,
        exclusiveInternalAccessControl: override.exclusiveInternalAccessControl,
        exclusiveExternalAccessControl: override.exclusiveExternalAccessControl,
        userTypes: override.userTypes,
        userRoles: override.userRoles,
        applyRulesAs: override.applyRulesAs
    });

    if (override.enabled === false) {
        console.log(`Override disabled for user ${user.userId}`);
        return false;
    }

    // Only apply exclusive user ID control if the array exists and has entries
    if (override.exclusiveUserIdAccessControl && override.exclusiveUserIdAccessControl.length > 0) {
        const hasAccess = override.exclusiveUserIdAccessControl.includes(user.userId);
        console.log(`Exclusive user ID control: ${hasAccess ? 'ALLOWED' : 'DENIED'} for user ${user.userId}`);
        return hasAccess;
    } else if (override.exclusiveUserIdAccessControl && override.exclusiveUserIdAccessControl.length === 0) {
        console.log(`Exclusive user ID control is empty array, ignoring and falling back to other rules`);
    }

    const userType = user.userType ?? 'external-user';
    console.log(`User type: ${userType}`);

    let accessControl = userType === 'internal-user' ? override.exclusiveInternalAccessControl : override.exclusiveExternalAccessControl;
    // Only apply exclusive entity access control if the array exists and has entries
    if (accessControl && accessControl.length > 0) {
        console.log(`Checking exclusive ${userType} access control:`, accessControl);
        if (customDataFieldPathToMatchUsersEntity) {
            const entity = getEntityFromCustomData(user.customData, customDataFieldPathToMatchUsersEntity);
            const matches = !!entity && accessControl.includes(entity);
            console.log(`Entity: ${entity} for user: ${user.userId} matches access control: ${accessControl} ${matches ? 'YES' : 'NO'}`);
            return matches;
        } else {
            console.log(`No custom data field path to match users entity provided, so user doesn't have access to this chat app.`);
            return false;
        }
    } else if (accessControl && accessControl.length === 0) {
        console.log(`Exclusive ${userType} access control is empty array, ignoring and falling back to other rules`);
    }

    // If we get here, then we are going to use the general access rules to determine if the user has access to the chat app.
    console.log(`Falling back to general access rules for user ${user.userId}`);
    return checkUserAccessToChatAppUsingGeneralAccessRules(user, override);
}

/**
 * Generic function to check if a user has access to a feature based on user types and roles.
 * This implements the same logic used in get for checking user access rules.
 *
 * **Access Control Logic:**
 * - If the feature is disabled (`enabled: false`), no access regardless of other rules
 * - If no userTypes or userRoles are specified, no access is granted (secure by default)
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
function checkUserAccessToChatAppUsingGeneralAccessRules(user: ChatUser<RecordOrUndef>, rules: AccessRules): boolean {
    let { enabled, userTypes, userRoles, applyRulesAs = 'and' } = rules;

    // Normalize empty arrays to undefined for more intuitive access control
    // If userTypes is set but userRoles is empty array, treat userRoles as undefined
    if (userTypes && userTypes.length > 0 && userRoles && userRoles.length === 0) {
        userRoles = undefined;
        console.log(`Normalizing empty userRoles array to undefined since userTypes is set for user ${user.userId}`);
    }

    // If userRoles is populated but userTypes is undefined/empty, treat userTypes as undefined
    if (userRoles && userRoles.length > 0 && (!userTypes || userTypes.length === 0)) {
        userTypes = undefined;
        console.log(`Normalizing empty/undefined userTypes to undefined since userRoles is populated for user ${user.userId}`);
    }

    console.log(`checkUserAccessToChatAppUsingGeneralAccessRules for user ${user.userId}:`, {
        enabled,
        userTypes,
        userRoles,
        applyRulesAs,
        userActualType: user.userType,
        userActualRoles: user.roles
    });

    // If the feature is disabled, no access regardless of other rules
    if (!enabled) {
        console.log(`Rules disabled for user ${user.userId}`);
        return false;
    }

    // If no rules are specified, no access is granted (secure by default)
    if (!userTypes && !userRoles) {
        console.log(`No access rules specified, denying access by default for user ${user.userId}`);
        return false;
    }

    // Check user type access
    const userTypeMatches = userTypes ? userTypes.includes(user.userType ?? 'external-user') : true;
    console.log(`User type check: user has type '${user.userType ?? 'external-user'}', allowed types: ${JSON.stringify(userTypes)}, matches: ${userTypeMatches}`);

    // Check user role access
    const userRoleMatches = userRoles ? (user.roles ?? []).some((role) => userRoles.includes(role as any)) : true;
    console.log(`User role check: user has roles ${JSON.stringify(user.roles ?? [])}, allowed roles: ${JSON.stringify(userRoles)}, matches: ${userRoleMatches}`);

    // Apply the rules based on the logic specified
    let finalResult = false;
    if (applyRulesAs === 'and') {
        finalResult = userTypeMatches && userRoleMatches;
        console.log(`AND logic: ${userTypeMatches} && ${userRoleMatches} = ${finalResult}`);
    } else {
        finalResult = userTypeMatches || userRoleMatches;
        console.log(`OR logic: ${userTypeMatches} || ${userRoleMatches} = ${finalResult}`);
    }

    console.log(`Final access result for user ${user.userId}: ${finalResult}`);
    return finalResult;
}
