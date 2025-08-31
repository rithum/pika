import { getMatchingChatApps } from '$lib/server/chat-admin-apis';
import { searchTagDefinitions } from '$lib/server/chat-apis';
import { siteFeatures } from '$lib/server/custom-site-features';
import { doesUserNeedToProvideDataOverrides, getOverridableFeatures, isUserAllowedToUseUserDataOverrides, isUserContentAdmin } from '$lib/server/utils';
import type { ChatApp, ChatAppMode, CustomDataUiRepresentation, TagDefinition, TagDefinitionWidget, UserDataOverrideSettings } from 'pika-shared/types/chatbot/chatbot-types';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, url, locals, depends }) => {
    // Add dependency for user data invalidation - this ensures parent layout reloads
    // when invalidate('app:user-data') is called from child routes
    depends('app:user-data');

    // console.log('[Chat Layout.server] Child layout server function running for chatAppId:', params.chatAppId);

    const { chatAppId } = params;
    const modeParam = url.searchParams.get('mode') || undefined;
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

    try {
        const matchingChatApps = await getMatchingChatApps(locals.user, false, undefined, chatAppId, customDataFieldPathToMatchUsersEntity);
        if (matchingChatApps && matchingChatApps.length === 1) {
            chatApp = matchingChatApps[0];
        } else {
            throw error(404, 'Chat app not found');
        }
    } catch (e) {
        if (e instanceof Error && e.message.includes('404')) {
            throw error(404, 'Chat app not found');
        }
        throw e;
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
    const features = getOverridableFeatures(chatApp, locals.user);
    let customDataUiRepresentation: CustomDataUiRepresentation | undefined;

    // Fetch all enabled tag definitions by paging through results
    let tagDefinitions: TagDefinition<TagDefinitionWidget>[] = [];
    try {
        let paginationToken: Record<string, any> | undefined;
        do {
            const response = await searchTagDefinitions(locals.user.userId, {
                includeInstructions: false, // We don't need instructions for frontend display
                paginationToken
            });

            tagDefinitions.push(...response.tagDefinitions);
            paginationToken = response.paginationToken;
        } while (paginationToken);
    } catch (e) {
        // Log error but don't fail the entire page load
        console.error('Error fetching tag definitions:', e);
        tagDefinitions = [];
    }

    if (authProvider.getCustomDataUiRepresentation) {
        customDataUiRepresentation = await authProvider.getCustomDataUiRepresentation(locals.user, chatApp.chatAppId);
        if (customDataUiRepresentation && (!customDataUiRepresentation.title || !customDataUiRepresentation.value)) {
            customDataUiRepresentation = undefined;
        }
    }

    return {
        chatApp,
        userDataOverrideSettings,
        userIsContentAdmin,
        features,
        customDataUiRepresentation,
        tagDefinitions,
        mode: (modeParam ?? 'standalone') as ChatAppMode
    };
};
