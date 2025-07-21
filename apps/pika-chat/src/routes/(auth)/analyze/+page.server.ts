import { getMatchingChatApps } from '$lib/server/chat-admin-apis';
import { siteFeatures } from '$lib/server/custom-site-features';
import { doesUserNeedToProvideDataOverrides, getOverridableFeatures, isUserAllowedToUseUserDataOverrides, isUserContentAdmin } from '$lib/server/utils';
import { ChatApp, type ChatAppMode, type CustomDataUiRepresentation } from '@pika/shared/types/chatbot/chatbot-types';
import type { UserDataOverrideSettings } from '@pika/shared/types/pika-types';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
    //const { chatAppId } = params;
    //const modeParam = url.searchParams.get('mode') || undefined;
    let chatApp: ChatApp = {
        chatAppId: "admin-analyze",
        mode: "fullscreen",
        title: "Admin Analyze Chats"
    };

    //TODO: what are we going to do with mode param.  We should probably just remove it.
    // let mode: ChatAppMode | undefined;
    // if (modeParam && modeParam !== 'fullpage' && modeParam !== 'embedded') {
    //     throw error(400, 'Invalid mode');
    // }

    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }


    const authProvider = locals.authProvider;



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
        customDataUiRepresentation
    };
};
