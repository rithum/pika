import { getMatchingChatApps } from '$lib/server/chat-admin-apis';
import { searchTagDefinitions } from '$lib/server/chat-apis';
import { appConfig } from '$lib/server/config';
import { siteFeatures } from '$lib/server/custom-site-features';
import {
    doesUserNeedToProvideDataOverrides,
    handleApiGatewayError,
    isUserAllowedToUseUserDataOverrides,
    isUserContentAdmin,
    parseWebComponentUrlsFromEnvVar
} from '$lib/server/utils';
import { error } from '@sveltejs/kit';
import type { ChatApp, ChatAppMode, CustomDataUiRepresentation, TagDefinition, TagDefinitionWidget, UserDataOverrideSettings } from 'pika-shared/types/chatbot/chatbot-types';
import { getOverridableFeatures } from 'pika-shared/util/server-utils';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, url, locals, depends }) => {
    // Add dependency for user data invalidation - this ensures parent layout reloads
    // when invalidate('app:user-data') is called from child routes
    depends('app:user-data');

    // console.log('[Chat Layout.server] Child layout server function running for chatAppId:', params.chatAppId);

    const { chatAppId } = params;
    const modeParam = url.searchParams.get('mode') || undefined;
    const errorParam = url.searchParams.get('error') || undefined;
    const shareParam = url.searchParams.get('share') || undefined;
    let chatApp: ChatApp | undefined;

    if (modeParam && modeParam !== 'standalone' && modeParam !== 'embedded') {
        throw error(400, 'Invalid mode');
    }

    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    if (!chatAppId) {
        throw error(400, 'Chat app ID is required');
    }

    const authProvider = locals.authProvider;
    let customDataFieldPathToMatchUsersEntity: string | undefined;
    if (siteFeatures?.entity?.enabled && siteFeatures.entity.attributeName) {
        customDataFieldPathToMatchUsersEntity = siteFeatures.entity.attributeName;
    }

    let customDataForChatApp: Record<string, unknown> | undefined;
    if (authProvider.getCustomDataForChatApp) {
        customDataForChatApp = await authProvider.getCustomDataForChatApp(locals.user, chatAppId);
    }

    try {
        const matchingChatApps = await getMatchingChatApps(locals.user, false, undefined, chatAppId, customDataFieldPathToMatchUsersEntity);

        if (matchingChatApps && matchingChatApps.length === 1) {
            chatApp = matchingChatApps[0];
        } else {
            throw error(404, 'Chat app not found');
        }
    } catch (e) {
        handleApiGatewayError(e, 'loading chat app');
    }

    if (!chatApp) {
        throw error(404, 'Chat app not found');
    }

    if (!chatApp.enabled) {
        throw error(404, 'Chat app is not enabled');
    }

    let chatAppDisabledUserDataOverride = false;
    if (chatApp.override?.features?.userDataOverrides?.enabled === false || chatApp.features?.userDataOverrides?.enabled === false) {
        chatAppDisabledUserDataOverride = true;
    }

    // Note you don't get to set user override data if you are viewing content for another user.
    const userIsContentAdmin = isUserContentAdmin(locals.user);
    const isViewingContentForAnotherUser = locals.user.viewingContentFor && !!locals.user.viewingContentFor[chatAppId];
    const { userTypes, ...userDataOverridesRest } = siteFeatures?.userDataOverrides ?? {};
    let userDataOverrideSettings: UserDataOverrideSettings = {
        ...(isViewingContentForAnotherUser ? {} : userDataOverridesRest),
        enabled: !chatAppDisabledUserDataOverride && !isViewingContentForAnotherUser && isUserAllowedToUseUserDataOverrides(locals.user),
        userNeedsToProvideDataOverrides:
            !chatAppDisabledUserDataOverride &&
            !isViewingContentForAnotherUser &&
            doesUserNeedToProvideDataOverrides(locals.user, locals.user.overrideData?.[chatApp.chatAppId], chatApp.chatAppId)
    };
    const features = getOverridableFeatures(siteFeatures ?? {}, chatApp, locals.user);

    // Determine if entity feature is enabled for this specific chat app after resolving overrides
    let customDataUiRepresentation: CustomDataUiRepresentation | undefined;

    // Fetch all enabled tag definitions by paging through results
    let tagDefinitions: TagDefinition<TagDefinitionWidget>[] = [];
    try {
        let paginationToken: Record<string, any> | undefined;

        // Compute which tags to fetch based on feature configuration
        const tagsEnabled = features.tags?.tagsEnabled ?? [];
        const tagsDisabled = features.tags?.tagsDisabled ?? [];

        // Global tags are included unless they're in the disabled list
        const includeGlobal = tagsDisabled.length === 0; // If no tags are disabled, include all globals
        // Note: If there are disabled tags, we'll need to filter them out after fetching

        console.log('tagsEnabled', tagsEnabled);
        console.log('tagsDisabled', tagsDisabled);
        console.log('includeGlobal', includeGlobal);

        do {
            const response = await searchTagDefinitions(locals.user.userId, {
                includeInstructions: false, // We don't need instructions for frontend display
                paginationToken,
                tagsDesired: tagsEnabled.length > 0 ? tagsEnabled : undefined,
                includeGlobal
            });

            console.log('response.tagDefinitions', response.tagDefinitions);

            tagDefinitions.push(...response.tagDefinitions);
            paginationToken = response.paginationToken;
        } while (paginationToken);

        console.log('tagDefinitions', tagDefinitions);

        // Filter out disabled global tags if any
        if (tagsDisabled.length > 0) {
            tagDefinitions = tagDefinitions.filter((tag) => {
                return !tagsDisabled.some((disabled) => disabled.scope === tag.scope && disabled.tag === tag.tag);
            });
        }
    } catch (e) {
        // For tag definitions, we log the error but don't fail the entire page load
        // since this is not critical functionality
        console.error('Error fetching tag definitions for chat app layout:', e);
        tagDefinitions = [];
    }

    if (authProvider.getCustomDataUiRepresentation) {
        customDataUiRepresentation = await authProvider.getCustomDataUiRepresentation(locals.user, chatApp.chatAppId);
        if (customDataUiRepresentation && (!customDataUiRepresentation.title || !customDataUiRepresentation.value)) {
            customDataUiRepresentation = undefined;
        }
    }

    // If we're running locally we need to check for the presence of a WEB_COMPONENT_URLS that may override web copmonent s3/url locations
    // for local testing.
    let webComponentUrls: Record<string, string> | undefined;
    if (appConfig.isLocal) {
        try {
            const webComponentUrlsStr = appConfig.getArbitraryConfigValue('WEB_COMPONENT_URLS');

            webComponentUrls = parseWebComponentUrlsFromEnvVar(webComponentUrlsStr);
        } catch (e) {
            // It's not set, keep going.
        }
    }

    return {
        chatApp,
        userDataOverrideSettings,
        userIsContentAdmin,
        features,
        customDataUiRepresentation,
        tagDefinitions,
        mode: (modeParam ?? 'standalone') as ChatAppMode,
        error: errorParam,
        shareId: shareParam,
        ...(webComponentUrls ? { webComponentUrls } : {}),
        customDataForChatApp
    };
};
