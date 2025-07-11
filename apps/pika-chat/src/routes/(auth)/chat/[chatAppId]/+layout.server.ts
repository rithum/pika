import { getMatchingChatApps } from '$lib/server/chat-admin-apis';
import { siteFeatures } from '$lib/server/custom-site-features';
import { doesUserNeedToProvideDataOverrides, getOverridableFeatures, isUserAllowedToUseUserDataOverrides, isUserContentAdmin } from '$lib/server/utils';
import type { ChatApp, ChatAppMode, CustomDataUiRepresentation } from '@pika/shared/types/chatbot/chatbot-types';
import type { UserDataOverrideSettings } from '@pika/shared/types/chatbot/chatbot-types';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, url, locals }) => {
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

    if (authProvider.getCustomDataFieldPathToMatchUsersEntity) {
        customDataFieldPathToMatchUsersEntity = await authProvider.getCustomDataFieldPathToMatchUsersEntity();
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

    // Note you don't get to set user override data if you are viewing content for another user.
    const userIsContentAdmin = isUserContentAdmin(locals.user);
    const isViewingContentForAnotherUser = locals.user.viewingContentFor && !!locals.user.viewingContentFor[chatAppId];
    const { userTypes, ...userDataOverridesRest } = siteFeatures?.userDataOverrides ?? {};
    let userDataOverrideSettings: UserDataOverrideSettings = {
        ...(isViewingContentForAnotherUser ? {} : userDataOverridesRest),
        enabled: !isViewingContentForAnotherUser && isUserAllowedToUseUserDataOverrides(locals.user),
        userNeedsToProvideDataOverrides:
            !isViewingContentForAnotherUser && doesUserNeedToProvideDataOverrides(locals.user, locals.user.overrideData?.[chatApp.chatAppId], chatApp.chatAppId)
    };
    const features = getOverridableFeatures(chatApp, locals.user);
    let customDataUiRepresentation: CustomDataUiRepresentation | undefined;

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
        mode: (modeParam ?? 'standalone') as ChatAppMode
    };
};
