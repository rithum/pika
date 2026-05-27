import { getMatchingChatApps } from '$lib/server/chat-admin-apis';
import { getChatMessages } from '$lib/server/chat-apis';
import { appConfig } from '$lib/server/config';
import { siteFeatures } from '$lib/server/custom-site-features';
import { resolveUserId } from '$lib/server/resolve-user-id';
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
        // Prefer the new `requestedUserId` query param; honor `legacyUserId` as a deprecated alias
        // for v0.26.0 wire-API compatibility. If a caller passes the old name, emit a one-line
        // warn so the deprecation surfaces in observability without breaking the request.
        const newParam = url.searchParams.get('requestedUserId');
        const legacyParam = url.searchParams.get('legacyUserId');
        if (legacyParam && !newParam) {
            console.warn(
                '[Message Auth] deprecated query param `legacyUserId` used on GET messages route — use `requestedUserId` instead',
                {
                    path: '/api/message/[chatAppId]/[sessionId]',
                    chatAppId,
                }
            );
        }
        const requestedUserId = newParam ?? legacyParam ?? undefined;
        if (requestedUserId) {
            // GET fails open by design: a denying/throwing resolver falls back to the session
            // user (the caller sees their own messages, never another user's data). POST is
            // fail-closed; resolveUserId encapsulates both asymmetric paths. arg1 is the
            // attacker-influenceable query-supplied id; arg2 is the trusted session id.
            userId = await resolveUserId({
                requestedUserId,
                sessionUserId: user.userId,
                request,
                cookies,
                stage: appConfig.stage,
                chatAppId,
                failOpen: true,
                routeLabel: 'GET /api/message/[chatAppId]/[sessionId]',
            });
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
        const matchingChatApps = await getMatchingChatApps(
            locals.user,
            false,
            undefined,
            chatAppId,
            customDataFieldPathToMatchUsersEntity
        );
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
            throw error(
                400,
                'attribute name is not defined on the site wide entity feature even though the entity feature is enabled'
            );
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
