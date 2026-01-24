/**
 * These are utils that should only be used on the server in svelte kit and
 * in lambda functions.
 */
import { gunzipSync, gzipSync } from 'zlib';
import {
    DEFAULT_MAX_K_MATCHES_PER_STRATEGY,
    DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT,
    type AccessRules,
    type AuthenticatedUser,
    type ChatApp,
    type ChatAppOverridableFeatures,
    type ChatUser,
    type IntentRouterFeature,
    type RecordOrUndef,
    type SiteFeatures,
    type TagDefinitionLite
} from '../types/chatbot/chatbot-types';

export function gunzipBase64EncodedString(base64EncodedString: string): string {
    const gzippedHexEncodedString = Buffer.from(base64EncodedString, 'base64').toString('hex');
    const gzippedHexDecodedString = gunzipSync(Buffer.from(gzippedHexEncodedString, 'hex')).toString();
    return gzippedHexDecodedString;
}

export function gzipAndBase64EncodeString(string: string): string {
    const gzippedHexEncodedString = gzipSync(string).toString('hex');
    const gzippedBase64EncodedString = Buffer.from(gzippedHexEncodedString, 'hex').toString('base64');
    return gzippedBase64EncodedString;
}

/**
 * Compute what features the user is and isn't allowed to use for this chat app.
 *
 * Feature hierarchy (in order of precedence):
 * 1. Site level (<root>/pika-config.ts) - Controls ultimate availability
 * 2. Chat app level (chatApp.features) - Can override site settings
 * 3. Admin override level (chatApp.override.features) - Can override chat app settings
 *
 * Note that we always return siteAdmin: { websiteEnabled: false } because we only check that for real when they try to access the admin page itself.
 *
 * Override rules:
 * - Site level controls whether a feature can be used at all
 * - Chat apps can override site level (but only to restrict)
 * - Admins can override chat app level completely (but cannot enable features disabled at site level)
 * - When overriding, complete feature configuration must be provided (no merging)
 */
export function getOverridableFeatures(siteFeatures: SiteFeatures, chatApp: ChatApp, user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>): ChatAppOverridableFeatures {
    const result: ChatAppOverridableFeatures = {
        entity: {
            enabled: false
        },
        verifyResponse: {
            enabled: false
        },
        traces: {
            enabled: false,
            detailedTraces: false
        },
        fileUpload: {
            mimeTypesAllowed: [] as string[]
        },
        suggestions: {
            suggestions: [] as string[],
            randomize: false,
            randomizeAfter: 0,
            maxToShow: 5
        },
        promptInputFieldLabel: {
            label: undefined
        },
        uiCustomization: {
            showUserRegionInLeftNav: false,
            showChatHistoryInStandaloneMode: false
        },
        chatDisclaimerNotice: undefined,
        logout: {
            enabled: false,
            menuItemTitle: 'Logout',
            dialogTitle: 'Logout',
            dialogDescription: 'Are you sure you want to logout?'
        },
        siteAdmin: {
            websiteEnabled: false
        },
        tags: {
            tagsEnabled: [] as TagDefinitionLite[],
            tagsDisabled: [] as TagDefinitionLite[]
        },
        agentInstructionAssistance: {
            enabled: false,
            includeOutputFormattingRequirements: false,
            includeInstructionsForTags: false,
            completeExampleInstructionEnabled: false,
            completeExampleInstructionLine: undefined,
            jsonOnlyImperativeInstructionEnabled: false,
            jsonOnlyImperativeInstructionLine: undefined,
            includeTypescriptBackedOutputFormattingRequirements: false,
            typescriptBackedOutputFormattingRequirements: undefined
        },
        instructionAugmentation: {
            enabled: false,
            type: undefined
        },
        userMemory: {
            enabled: false,
            maxMemoryRecordsPerPrompt: DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT,
            maxKMatchesPerStrategy: DEFAULT_MAX_K_MATCHES_PER_STRATEGY
        },
        intentRouter: {
            enabled: false
        }
    };

    // Handle verifyResponse feature
    // Admin override takes precedence over chat app configuration
    const effectiveVerifyResponseFeature = chatApp.override?.features?.verifyResponse || chatApp.features?.verifyResponse;
    result.verifyResponse = handleAccessRuleFeature(
        'verifyResponse',
        effectiveVerifyResponseFeature,
        siteFeatures?.verifyResponse,
        result.verifyResponse,
        user,
        (feature, enabled) => ({
            enabled,
            autoRepromptThreshold: feature.autoRepromptThreshold
        })
    );

    // Handle traces feature (has sub-feature for detailedTraces)
    // Admin override takes precedence over chat app configuration
    const effectiveTracesFeature = chatApp.override?.features?.traces || chatApp.features?.traces;
    result.traces = handleAccessRuleFeature('traces', effectiveTracesFeature, siteFeatures?.traces, result.traces, user, (feature, enabled) => {
        let detailedTraces = false;
        if (enabled && feature.detailedTraces) {
            // Check site-level gating for detailedTraces
            const siteDetailedTracesRule = siteFeatures?.traces?.detailedTraces || { enabled: false };
            if (siteDetailedTracesRule.enabled) {
                detailedTraces = checkUserAccessToFeature(user, feature.detailedTraces as AccessRules);
            }
        } else if (enabled) {
            // No app/admin override for detailedTraces, use site level
            const siteDetailedTracesRule = siteFeatures?.traces?.detailedTraces || { enabled: false };
            detailedTraces = checkUserAccessToFeature(user, siteDetailedTracesRule);
        }
        return {
            enabled,
            detailedTraces
        };
    });

    // Handle logout feature
    // Admin override takes precedence over chat app configuration
    const effectiveLogoutFeature = chatApp.override?.features?.logout || chatApp.features?.logout;
    result.logout = handleAccessRuleFeature('logout', effectiveLogoutFeature, siteFeatures?.logout, result.logout, user, (feature, enabled) => ({
        enabled,
        menuItemTitle: feature.menuItemTitle ?? 'Logout',
        dialogTitle: feature.dialogTitle ?? 'Logout',
        dialogDescription: feature.dialogDescription ?? 'Are you sure you want to logout?'
    }));

    // Handle fileUpload feature
    // Admin override takes precedence over chat app configuration
    const effectiveFileUploadFeature = chatApp.override?.features?.fileUpload || chatApp.features?.fileUpload;
    result.fileUpload = handleSimpleFeature('fileUpload', effectiveFileUploadFeature, siteFeatures?.fileUpload, result.fileUpload, (feature) => ({
        mimeTypesAllowed: feature.mimeTypesAllowed || []
    }));

    // Handle suggestions feature
    // Admin override takes precedence over chat app configuration
    const effectiveSuggestionsFeature = chatApp.override?.features?.suggestions || chatApp.features?.suggestions;
    result.suggestions = handleSimpleFeature('suggestions', effectiveSuggestionsFeature, siteFeatures?.suggestions, result.suggestions, (feature) => ({
        suggestions: feature.suggestions || [],
        randomize: feature.randomize ?? false,
        randomizeAfter: feature.randomizeAfter ?? 0,
        maxToShow: feature.maxToShow ?? 5
    }));

    // Handle promptInputFieldLabel feature
    // Admin override takes precedence over chat app configuration
    const effectivePromptInputFieldLabelFeature = chatApp.override?.features?.promptInputFieldLabel || chatApp.features?.promptInputFieldLabel;
    result.promptInputFieldLabel = handleEnabledOnlyFeature(
        'promptInputFieldLabel',
        effectivePromptInputFieldLabelFeature,
        siteFeatures?.promptInputFieldLabel,
        { label: 'Ready to chat' }, // Default return shape
        (feature, enabled) => ({
            label: enabled ? (feature.promptInputFieldLabel ?? 'Ready to chat') : undefined
        })
    );

    // Handle uiCustomization feature
    // Admin override takes precedence over chat app configuration
    const effectiveUiCustomizationFeature = chatApp.override?.features?.uiCustomization || chatApp.features?.uiCustomization;
    result.uiCustomization = handleSimpleFeature('uiCustomization', effectiveUiCustomizationFeature, siteFeatures?.uiCustomization, result.uiCustomization, (feature) => ({
        showUserRegionInLeftNav: feature.showUserRegionInLeftNav ?? false,
        showChatHistoryInStandaloneMode: feature.showChatHistoryInStandaloneMode ?? false
    }));

    // Handle chatDisclaimerNotice feature
    // Admin override takes precedence over chat app configuration
    const effectiveChatDisclaimerNoticeFeature = chatApp.override?.features?.chatDisclaimerNotice || chatApp.features?.chatDisclaimerNotice;
    const disclaimerResult = handleEnabledOnlyFeature(
        'chatDisclaimerNotice',
        effectiveChatDisclaimerNoticeFeature,
        siteFeatures?.chatDisclaimerNotice,
        { notice: undefined },
        (feature, enabled) => ({
            notice: enabled ? feature.notice : undefined
        })
    );
    result.chatDisclaimerNotice = disclaimerResult.notice;

    // Handle tags feature
    // Admin override takes precedence over chat app configuration
    const effectiveTagsFeature = chatApp.override?.features?.tags || chatApp.features?.tags;
    result.tags = handleSimpleFeature('tags', effectiveTagsFeature, siteFeatures?.tags, result.tags, (feature) => ({
        tagsEnabled: feature.tagsEnabled ?? [],
        tagsDisabled: feature.tagsDisabled ?? []
    }));

    // Handle agentInstructionAssistance feature
    // Admin override takes precedence over chat app configuration
    const effectiveAgentInstructionAssistanceFeature = chatApp.override?.features?.agentInstructionAssistance || chatApp.features?.agentInstructionAssistance;
    result.agentInstructionAssistance = handleSimpleFeature(
        'agentInstructionAssistance',
        effectiveAgentInstructionAssistanceFeature,
        siteFeatures?.agentInstructionAssistance,
        result.agentInstructionAssistance,
        (feature) => ({
            enabled: feature.enabled ?? false,
            includeOutputFormattingRequirements: feature.includeOutputFormattingRequirements?.enabled ?? false,
            includeInstructionsForTags: feature.includeInstructionsForTags?.enabled ?? false,
            completeExampleInstructionEnabled: feature.completeExampleInstructionLine?.enabled ?? false,
            completeExampleInstructionLine: feature.completeExampleInstructionLine?.mdLine ?? undefined,
            jsonOnlyImperativeInstructionEnabled: feature.jsonOnlyImperativeInstructionLine?.enabled ?? false,
            jsonOnlyImperativeInstructionLine: feature.jsonOnlyImperativeInstructionLine?.line ?? undefined,
            includeTypescriptBackedOutputFormattingRequirements: feature.includeTypescriptBackedOutputFormattingRequirements?.enabled ?? false,
            typescriptBackedOutputFormattingRequirements: feature.typescriptBackedOutputFormattingRequirements ?? undefined
        })
    );

    // Handle instructionAugmentation feature
    // Admin override takes precedence over chat app configuration
    const effectiveInstructionAugmentationFeature = chatApp.override?.features?.instructionAugmentation || chatApp.features?.instructionAugmentation;
    result.instructionAugmentation = handleSimpleFeature(
        'instructionAugmentation',
        effectiveInstructionAugmentationFeature,
        siteFeatures?.instructionAugmentation,
        result.instructionAugmentation,
        (feature) => ({
            enabled: feature.enabled ?? false,
            type: feature.type ?? 'llm-semantic-directive-search'
        })
    );

    // Handle userMemory feature
    // Admin override takes precedence over chat app configuration
    const effectiveUserMemoryFeature = chatApp.override?.features?.userMemory || chatApp.features?.userMemory;
    result.userMemory = handleSimpleFeature('userMemory', effectiveUserMemoryFeature, siteFeatures?.userMemory, result.userMemory, (feature) => ({
        enabled: feature.enabled ?? false,
        maxMemoryRecordsPerPrompt: feature.maxMemoryRecordsPerPrompt ?? DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT,
        maxKMatchesPerStrategy: feature.maxKMatchesPerStrategy ?? DEFAULT_MAX_K_MATCHES_PER_STRATEGY
    }));

    // Handle intentRouter feature
    // Admin override takes precedence over chat app configuration
    // Site level must be enabled for intent router to work
    const effectiveIntentRouterFeature = (chatApp.override?.features?.intentRouter || chatApp.features?.intentRouter) as IntentRouterFeature | undefined;
    if (siteFeatures?.intentRouter?.enabled) {
        // Site has intentRouter enabled, check if chat app or admin has configured it
        if (effectiveIntentRouterFeature) {
            // Use chat app/admin config if present
            result.intentRouter = {
                enabled: effectiveIntentRouterFeature.enabled ?? false,
                confidenceThreshold: effectiveIntentRouterFeature.confidenceThreshold ?? siteFeatures.intentRouter.confidenceThreshold,
                commandOverrides: effectiveIntentRouterFeature.commandOverrides ?? siteFeatures.intentRouter.commandOverrides
            };
        } else {
            // No chat app override, use site level config
            result.intentRouter = {
                enabled: siteFeatures.intentRouter.enabled,
                confidenceThreshold: siteFeatures.intentRouter.confidenceThreshold,
                commandOverrides: siteFeatures.intentRouter.commandOverrides
            };
        }
    }

    // Handle entity feature
    // Entity feature is special: it can only be disabled at chat app level, not enabled
    // If site has entity enabled, chat apps can override to disable it
    // Admin override takes precedence over chat app configuration
    const effectiveEntityFeature = chatApp.override?.features?.entity || chatApp.features?.entity;
    if (siteFeatures?.entity?.enabled) {
        // Site has entity enabled, check if chat app or admin has disabled it
        if (effectiveEntityFeature?.enabled === false) {
            result.entity.enabled = false;
        } else {
            // No override to disable, so it's enabled (follows site config)
            result.entity.enabled = true;
            if (!siteFeatures?.entity?.attributeName) {
                throw new Error('Entity feature is enabled at the site level but the site features entity object does not have an attributeName set');
            }
            result.entity.attributeName = siteFeatures.entity.attributeName;
        }
    } else {
        // Site doesn't have entity enabled, so it's disabled regardless of chat app config
        result.entity.enabled = false;
    }

    return result;
}

/**
 * Generic handler for simple features (no access rules).
 *
 * @param featureName - Name of the feature for logging
 * @param appFeature - App-level feature configuration
 * @param siteFeature - Site-level feature configuration
 * @param defaults - Default values for the feature
 * @param propertyExtractor - Function to extract properties from feature config
 * @returns The resolved feature configuration
 */
function handleSimpleFeature<T>(featureName: string, appFeature: any, siteFeature: any, defaults: T, propertyExtractor: (feature: any) => T): T {
    if (isSimpleFeatureOverrideValid(appFeature, featureName) && appFeature) {
        return propertyExtractor(appFeature);
    } else {
        // Use site level or defaults
        const siteRule = siteFeature || defaults;
        return propertyExtractor(siteRule);
    }
}

/**
 * Generic handler for features with enabled flag but no user access control.
 * If enabled, the feature is on for all users. If disabled, it's off for all users.
 *
 * @param featureName - Name of the feature for logging
 * @param appFeature - App-level feature configuration
 * @param siteFeature - Site-level feature configuration
 * @param defaults - Default values for the feature
 * @param propertyExtractor - Function to extract properties from feature config
 * @returns The resolved feature configuration
 */
function handleEnabledOnlyFeature<T>(featureName: string, appFeature: any, siteFeature: any, defaults: T, propertyExtractor: (feature: any, enabled: boolean) => T): T {
    const overrideStatus = isFeatureOverrideValid(appFeature, featureName);

    if (overrideStatus === 'enabled' && appFeature) {
        // Site-level gating: if site is disabled, app can't enable it
        const siteRule = siteFeature || { enabled: false };
        if (siteRule.enabled) {
            return propertyExtractor(appFeature, true);
        }
        return propertyExtractor({}, false); // Pass empty object when disabled
    } else if (overrideStatus === 'disabled') {
        return propertyExtractor({}, false); // Pass empty object when disabled
    } else {
        // Use site level or defaults
        const siteRule = siteFeature || { enabled: true }; // Default enabled for this feature
        return propertyExtractor(siteRule, siteRule.enabled);
    }
}

/**
 * Validates if a feature override is valid and returns its status.
 *
 * @param appFeature - The app-level feature configuration
 * @param featureName - The name of the feature for error logging
 * @returns The status of the override: 'enabled', 'disabled', 'invalid', or 'none'
 */
function isFeatureOverrideValid(appFeature: any, featureName: string): 'enabled' | 'disabled' | 'invalid' | 'none' {
    if (!appFeature) return 'none';

    // Empty object is invalid
    if (Object.keys(appFeature).length === 0) {
        console.error(`Invalid empty feature override for ${featureName}. Falling back to site level.`);
        return 'invalid';
    }

    // Must have enabled property to be valid (except for simple features)
    if (!('enabled' in appFeature)) {
        console.error(`Invalid feature override for ${featureName}: missing 'enabled' property. Falling back to site level.`);
        return 'invalid';
    }

    return appFeature.enabled ? 'enabled' : 'disabled';
}

/**
 * Validates if a simple feature override (no access rules) is valid.
 *
 * @param appFeature - The app-level feature configuration
 * @param featureName - The name of the feature for error logging
 * @returns Whether the override is valid
 */
function isSimpleFeatureOverrideValid(appFeature: any, featureName: string): boolean {
    if (!appFeature) return false;

    // Empty object is invalid
    if (Object.keys(appFeature).length === 0) {
        console.error(`Invalid empty feature override for ${featureName}. Falling back to site level.`);
        return false;
    }

    return true;
}

/**
 * Generic handler for features with access rules (enabled property + user access control).
 *
 * @param featureName - Name of the feature for logging
 * @param appFeature - App-level feature configuration
 * @param siteFeature - Site-level feature configuration
 * @param defaults - Default values for the feature
 * @param user - The authenticated user
 * @param propertyExtractor - Function to extract properties from feature config
 * @returns The resolved feature configuration
 */
function handleAccessRuleFeature<T>(
    featureName: string,
    appFeature: any,
    siteFeature: any,
    defaults: T,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    propertyExtractor: (feature: any, enabled: boolean) => T
): T {
    const overrideStatus = isFeatureOverrideValid(appFeature, featureName);

    if (overrideStatus === 'enabled' && appFeature) {
        // Site-level gating: if site is disabled, app can't enable it
        const siteRule = siteFeature || { enabled: false };
        if (siteRule.enabled) {
            const enabled = checkUserAccessToFeature(user, appFeature as AccessRules);
            return propertyExtractor(appFeature, enabled);
        }
        return propertyExtractor(defaults, false);
    } else if (overrideStatus === 'disabled') {
        return propertyExtractor(defaults, false);
    } else {
        // Use site level or defaults
        const siteRule = siteFeature || { enabled: false };
        const enabled = checkUserAccessToFeature(user, siteRule);
        return propertyExtractor(siteRule, enabled);
    }
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
export function checkUserAccessToFeature(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>, feature: AccessRules): boolean {
    let { enabled, userTypes, userRoles, applyRulesAs = 'and' } = feature;

    // Normalize empty arrays to undefined for more intuitive access control
    // If userTypes is set but userRoles is empty array, treat userRoles as undefined
    if (userTypes && userTypes.length > 0 && userRoles && userRoles.length === 0) {
        userRoles = undefined;
    }

    // If userRoles is populated but userTypes is undefined/empty, treat userTypes as undefined
    if (userRoles && userRoles.length > 0 && (!userTypes || userTypes.length === 0)) {
        userTypes = undefined;
    }

    // If the feature is disabled, no access regardless of other rules
    if (!enabled) {
        return false;
    }

    // If no rules are specified, no access is granted (secure by default)
    if (!userTypes && !userRoles) {
        return false;
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

export function getEntityIdForUser(user: ChatUser<RecordOrUndef>, overrideDataForThisChatApp: RecordOrUndef, entityAttributeName?: string): string | undefined {
    // Choose which data source to use (override takes precedence)
    let customUserData: RecordOrUndef = overrideDataForThisChatApp || user.customData;

    // Early exit if no entity attribute name or no custom data
    // This is expected for internal users who may not have entity data
    if (!entityAttributeName || !customUserData) {
        return undefined;
    }

    // Note the entityAttributeName could have dots in it and if so we need to dereference the attribute
    // Example: "user.account.id" would need to traverse: customUserData.user.account.id
    let currentObject: RecordOrUndef = customUserData;
    const attributeParts = entityAttributeName.split('.');
    let currentValue: string | undefined;

    // Traverse through each part of the dotted path
    for (let i = 0; i < attributeParts.length; i++) {
        const part = attributeParts[i];

        // Check if the current part exists in the current object
        // If not found, return undefined (expected for internal users)
        if (!(part in currentObject)) {
            return undefined;
        }

        // If this is the last part, get the value
        if (i === attributeParts.length - 1) {
            currentValue = currentObject[part];
        } else {
            // Not the last part, so we need to traverse deeper
            if (typeof currentObject[part] === 'object' && currentObject[part] !== null) {
                currentObject = currentObject[part];
            } else {
                // Expected path doesn't exist, return undefined (expected for internal users)
                return undefined;
            }
        }
    }

    // Return the value if found, undefined if empty/falsy (expected for internal users)
    return currentValue;
}
