import { getMatchingChatApps } from '$lib/server/chat-admin-apis';
import { appConfig } from '$lib/server/config';
import { siteFeatures } from '$lib/server/custom-site-features';
import { handleApiGatewayError } from '$lib/server/utils';
import { createUserDataVersion } from '$lib/utils/user-data-version';
import { redirect } from '@sveltejs/kit';
import type { ChatAppLite, ChatUser, CustomDataUiRepresentation, HomePageSiteFeature, LogoutFeature } from 'pika-shared/types/chatbot/chatbot-types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ depends, locals }) => {
    // Add dependency tracking for targeted invalidation.  We will invalidate
    // the user data every X amount of time to make sure the client stays in sync
    // with the server-side ChatUser changes detected in hooks.server.ts.  Note
    // that this is much more aggressive if the user is an internal user since
    // they are more likely to be making changes to the user data.
    depends('app:user-data');

    // console.log('[Layout.server] Load function running for user data refresh');

    const user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    // Remove any auth data that may be there before it gets to the client
    const chatUser = { ...user } as ChatUser;
    delete (chatUser as any).authData;

    const userDataVersion = createUserDataVersion(chatUser);

    const authProvider = locals.authProvider;
    let customDataUiRepresentation: CustomDataUiRepresentation | undefined;

    if (authProvider.getCustomDataUiRepresentation) {
        customDataUiRepresentation = await authProvider.getCustomDataUiRepresentation(locals.user);
        if (customDataUiRepresentation && (!customDataUiRepresentation.title || !customDataUiRepresentation.value)) {
            customDataUiRepresentation = undefined;
        }
    }

    let customDataFieldPathToMatchUsersEntity: string | undefined;

    if (siteFeatures?.entity?.enabled && siteFeatures.entity.attributeName) {
        customDataFieldPathToMatchUsersEntity = siteFeatures.entity.attributeName;
    }

    let chatApps: ChatAppLite[] = [];
    let homePageSiteFeature: HomePageSiteFeature | undefined;
    let logoutSiteFeature: LogoutFeature | undefined;

    if (siteFeatures && siteFeatures.logout) {
        logoutSiteFeature = siteFeatures.logout;
    }

    if (siteFeatures && siteFeatures.homePage) {
        homePageSiteFeature = siteFeatures.homePage;
        if (homePageSiteFeature.linksToChatApps && homePageSiteFeature.linksToChatApps.userChatAppRules && homePageSiteFeature.linksToChatApps.userChatAppRules.length > 0) {
            // They mean to turn on the feature, so we need to get the matching chat apps
            try {
                const matchingChatApps = await getMatchingChatApps(
                    user,
                    true,
                    homePageSiteFeature.linksToChatApps.userChatAppRules,
                    undefined,
                    customDataFieldPathToMatchUsersEntity
                );
                chatApps = matchingChatApps.map((app) => ({
                    chatAppId: app.chatAppId,
                    title: app.title,
                    description: app.description,
                    agentId: app.agentId,
                    userTypes: app.userTypes
                }));
            } catch (e) {
                handleApiGatewayError(e, 'loading home page chat apps');
            }
        }
    }

    // console.log('[Layout.server] Returning user data:', {
    //     userId: chatUser.userId,
    //     firstName: chatUser.firstName,
    //     lastName: chatUser.lastName,
    //     userType: chatUser.userType,
    //     roles: chatUser.roles,
    //     userDataVersion,
    //     timestamp: new Date().toISOString()
    // });

    return {
        user: chatUser,
        userDataVersion,
        customDataUiRepresentation,
        homePageSiteFeature,
        logoutSiteFeature,
        chatApps,
        stage: appConfig.stage
    };
};
