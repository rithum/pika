import type { ChatAppLite, ChatUser } from '@pika/shared/types/chatbot/chatbot-types';
import { redirect, type RequestEvent } from '@sveltejs/kit';
import { siteFeatures } from '$lib/server/custom-site-features';
import { getMatchingChatApps } from '$lib/server/chat-admin-apis';

export async function load(
    event: RequestEvent<Record<string, string>>
): Promise<{ chatApps: ChatAppLite[]; homePageTitle: string | undefined; welcomeMessage: string | undefined }> {
    const user = event.locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    const authProvider = event.locals.authProvider;
    let customDataFieldPathToMatchUsersEntity: string | undefined;

    if (authProvider.getCustomDataFieldPathToMatchUsersEntity) {
        customDataFieldPathToMatchUsersEntity = await authProvider.getCustomDataFieldPathToMatchUsersEntity();
    }

    let result: ChatAppLite[] = [];
    let homePageTitle: string | undefined;
    let welcomeMessage: string | undefined;

    if (siteFeatures && siteFeatures.homePage) {
        const feature = siteFeatures.homePage;
        homePageTitle = feature.homePageTitle;
        if (
            feature.linksToChatApps &&
            feature.linksToChatApps.userChatAppRules &&
            feature.linksToChatApps.userChatAppRules.length > 0
        ) {
            // They mean to turn on the feature, so we need to get the matching chat apps
            const matchingChatApps = await getMatchingChatApps(
                user,
                true,
                feature.linksToChatApps.userChatAppRules,
                undefined,
                customDataFieldPathToMatchUsersEntity
            );
            result = matchingChatApps.map((app) => ({
                chatAppId: app.chatAppId,
                title: app.title,
                description: app.description,
                agentId: app.agentId,
                userTypesAllowed: app.userTypes,
                userRolesAllowed: app.userRoles,
            }));
        }
    }

    return { chatApps: result, homePageTitle, welcomeMessage };
}
