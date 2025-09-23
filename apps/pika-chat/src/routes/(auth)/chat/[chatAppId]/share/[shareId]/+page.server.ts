import { getMatchingChatApps } from '$lib/server/chat-admin-apis';
import { validateShareAccess } from '$lib/server/chat-apis';
import { siteFeatures } from '$lib/server/custom-site-features';
import { ApiGatewayError, doesUserNeedToProvideDataOverrides, handleApiGatewayError } from '$lib/server/utils';
import { error, redirect, type ServerLoad } from '@sveltejs/kit';
import type { ChatApp } from 'pika-shared/types/chatbot/chatbot-types';
import { getEntityIdForUser, getOverridableFeatures } from 'pika-shared/util/server-utils';

export const load: ServerLoad = async ({ params, locals }) => {
    const { chatAppId, shareId } = params;
    const user = locals.user;

    if (!user) {
        throw redirect(302, '/auth/login');
    }

    if (!chatAppId) {
        throw error(400, 'Chat app ID is required');
    }

    if (!shareId) {
        throw error(400, 'Share ID is required');
    }

    let chatApp: ChatApp | undefined;
    try {
        let customDataFieldPathToMatchUsersEntity: string | undefined;
        if (siteFeatures?.entity?.enabled && siteFeatures.entity.attributeName) {
            customDataFieldPathToMatchUsersEntity = siteFeatures.entity.attributeName;
        }

        const matchingChatApps = await getMatchingChatApps(locals.user, false, undefined, chatAppId, customDataFieldPathToMatchUsersEntity);
        if (matchingChatApps && matchingChatApps.length === 1) {
            chatApp = matchingChatApps[0];
        } else {
            throw error(404, 'Chat app not found');
        }
    } catch (e) {
        handleApiGatewayError(e, 'loading chat app');
    }

    try {
        let chatAppDisabledUserDataOverride = false;
        if (chatApp.override?.features?.userDataOverrides?.enabled === false || chatApp.features?.userDataOverrides?.enabled === false) {
            chatAppDisabledUserDataOverride = true;
        }
        const isViewingContentForAnotherUser = locals.user.viewingContentFor && !!locals.user.viewingContentFor[chatAppId];
        let userNeedsToProvideDataOverrides =
            !chatAppDisabledUserDataOverride &&
            !isViewingContentForAnotherUser &&
            doesUserNeedToProvideDataOverrides(locals.user, locals.user.overrideData?.[chatApp.chatAppId], chatApp.chatAppId);

        // If the user needs to provide data overrides, then they need to tell us who they are viewing content for
        if (userNeedsToProvideDataOverrides) {
            throw redirect(302, `/chat/${chatAppId}?error=user_needs_to_provide_data_overrides`);
        } else if (isViewingContentForAnotherUser) {
            throw redirect(302, `/chat/${chatAppId}?error=viewing_content_for_another_user`);
        }

        let entityId: string | undefined;
        let features = getOverridableFeatures(siteFeatures ?? {}, chatApp, user);
        if (features.entity.enabled) {
            if (!siteFeatures?.entity?.attributeName) {
                throw error(400, 'attribute name is not defined on the site wide entity feature even though the entity feature is enabled');
            }
            entityId = getEntityIdForUser(user, user.overrideData?.[chatApp.chatAppId], siteFeatures.entity.attributeName);
        }

        // Validate share access and get session
        const shareAccess = await validateShareAccess(user, shareId, chatAppId, entityId);

        if (!shareAccess.hasAccess) {
            throw redirect(302, `/chat/${chatAppId}?error=share_access_denied`);
        }

        // Redirect to main chat with share parameters to trigger loading
        throw redirect(302, `/chat/${chatAppId}?share=${shareId}`);
    } catch (e) {
        if (e instanceof ApiGatewayError) {
            // Handle specific API Gateway errors with appropriate redirects
            if (e.status === 404) {
                throw redirect(302, `/chat/${chatAppId}?error=share_not_found`);
            } else if (e.status === 403) {
                throw redirect(302, `/chat/${chatAppId}?error=share_access_denied`);
            } else if (e.status === 401) {
                throw redirect(302, `/auth/login`);
            }
        }

        // For other errors (including redirects), re-throw them
        if (e && typeof e === 'object' && 'status' in e && (e as any).status >= 300 && (e as any).status < 400) {
            throw e; // This is a redirect, re-throw it
        }

        throw redirect(302, `/chat/${chatAppId}?error=share_not_found`);
    }
};
