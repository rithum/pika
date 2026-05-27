import { getMatchingChatApps } from '$lib/server/chat-admin-apis';
import { getChatMessages } from '$lib/server/chat-apis';
import { appConfig } from '$lib/server/config';
import { siteFeatures } from '$lib/server/custom-site-features';
import { resolveRequestUserId } from '$lib/custom/request-user-id-resolver';
import { handleApiGatewayError, isUserContentAdmin } from '$lib/server/utils';
import { error, json, redirect, type RequestHandler } from '@sveltejs/kit';
import type { ChatApp } from 'pika-shared/types/chatbot/chatbot-types';
import { getEntityIdForUser, getOverridableFeatures } from 'pika-shared/util/server-utils';

export const GET: RequestHandler = async ({ params, locals, url, request, cookies }) => {
    const user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    const { chatAppId } = params;
    if (!chatAppId) {
        throw error(400, 'chatAppId is required');
    }

    const { sessionId } = params;
    if (!sessionId) {
        throw error(400, 'sessionId is required');
    }

    let shareId: string | undefined;
    if (url.searchParams.has('shareId')) {
        shareId = url.searchParams.get('shareId') ?? undefined;
    }

    let userId: string | undefined;
    if (locals.user.viewingContentFor && Object.keys(locals.user.viewingContentFor).length > 0) {
        if (!isUserContentAdmin(locals.user)) {
            throw error(403, 'Forbidden');
        }
        userId = locals.user.viewingContentFor[chatAppId]?.userId;
    }

    if (!userId) {
        const requestedUserId = url.searchParams.get('legacyUserId') ?? undefined;
        if (requestedUserId) {
            // Intentional asymmetry with the POST route: on the GET messages endpoint, a denied
            // or thrown resolver falls back to the session user (the caller sees their own
            // messages). POST 401s because the caller was attempting to act *as* another user;
            // here the caller is only reading their own data when fallback kicks in. We still
            // log so denials/throws surface in observability.
            let resolved: string | undefined;
            try {
                resolved = await resolveRequestUserId(requestedUserId, user.userId, {
                    request,
                    cookies,
                    stage: appConfig.stage,
                    chatAppId
                });
            } catch (e) {
                console.warn('[Message Auth] resolveRequestUserId threw — falling back to session user', {
                    path: '/api/message/[chatAppId]/[sessionId]',
                    chatAppId,
                    requestedUserId,
                    sessionUserId: user.userId,
                    error: e instanceof Error ? e.message : String(e)
                });
                resolved = undefined;
            }
            if (!resolved) {
                console.warn('[Message Auth] resolveRequestUserId returned undefined — falling back to session user', {
                    path: '/api/message/[chatAppId]/[sessionId]',
                    chatAppId,
                    requestedUserId,
                    sessionUserId: user.userId
                });
            }
            userId = resolved ?? user.userId;
        } else {
            userId = user.userId;
        }
    }

    let entityId: string | undefined;

    let customDataFieldPathToMatchUsersEntity: string | undefined;
    if (siteFeatures?.entity?.enabled && siteFeatures.entity.attributeName) {
        customDataFieldPathToMatchUsersEntity = siteFeatures.entity.attributeName;
    }

    let chatApp: ChatApp | undefined;
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

    let features = getOverridableFeatures(siteFeatures ?? {}, chatApp, user);
    if (features.entity.enabled) {
        if (!siteFeatures?.entity?.attributeName) {
            throw error(400, 'attribute name is not defined on the site wide entity feature even though the entity feature is enabled');
        }
        entityId = getEntityIdForUser(user, user.overrideData?.[chatApp.chatAppId], siteFeatures.entity.attributeName);
    }

    try {
        const messages = await getChatMessages(sessionId, userId, shareId, entityId);
        return json(messages);
    } catch (e) {
        handleApiGatewayError(e, 'getting chat messages');
    }
};
