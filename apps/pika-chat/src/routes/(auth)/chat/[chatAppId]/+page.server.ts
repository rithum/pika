import { getMatchingChatApps } from '$lib/server/chat-admin-apis';
import type { ChatApp, ChatAppMode, RecordOrUndef } from '@pika/shared/types/chatbot/chatbot-types';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { doesUserNeedToProvideDataOverrides, isUserAllowedToUseUserDataOverrides, isUserContentAdmin } from '$lib/server/utils';
import type { UserDataOverrideSettings } from '@pika/shared/types/pika-types';
import { siteFeatures } from '$lib/server/custom-site-features';

export const load: PageServerLoad = async ({ params, url, locals }) => {
    const { chatAppId } = params;
    const modeParam = url.searchParams.get('mode') || undefined;
    let chatApp: ChatApp | undefined;

    //TODO: what are we going to do with mode param.  We should probably just remove it.
    // let mode: ChatAppMode | undefined;
    if (modeParam && modeParam !== 'fullpage' && modeParam !== 'embedded') {
        throw error(400, 'Invalid mode');
    }

    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    if (!chatAppId) {
        throw error(400, 'Chat app ID is required');
    }

    try {
        const matchingChatApps = await getMatchingChatApps(locals.user, undefined, chatAppId);
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

    // Allow them to override the mode if they want to
    if (modeParam) {
        chatApp.mode = modeParam as ChatAppMode;
    }

    // Note you don't get to set user override data if you are viewing content for another user.
    const userIsContentAdmin = isUserContentAdmin(locals.user);
    const isViewingContentForAnotherUser = locals.user.viewingContentFor && !!locals.user.viewingContentFor[chatAppId];
    const { userTypesAllowed, ...userDataOverridesRest } = siteFeatures?.userDataOverrides ?? {};
    let userDataOverrideSettings: UserDataOverrideSettings = {
        ...(isViewingContentForAnotherUser ? {} : userDataOverridesRest),
        enabled: !isViewingContentForAnotherUser && isUserAllowedToUseUserDataOverrides(locals.user),
        userNeedsToProvideDataOverrides:
            !isViewingContentForAnotherUser && doesUserNeedToProvideDataOverrides(locals.user, locals.user.overrideData?.[chatApp.chatAppId], chatApp.chatAppId)
    };

    return {
        chatApp,
        userDataOverrideSettings,
        userIsContentAdmin
    };
};
