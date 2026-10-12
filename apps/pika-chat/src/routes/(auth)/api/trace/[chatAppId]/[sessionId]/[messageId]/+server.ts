import { getMatchingChatApps } from '$lib/server/chat-admin-apis';
import { getMessageTraces } from '$lib/server/chat-apis';
import { appConfig } from '$lib/server/config';
import { siteFeatures } from '$lib/server/custom-site-features';
import { resolveUserId } from '$lib/server/resolve-user-id';
import { mayReceiveTraceContent } from '$lib/custom/trace-content-access';
import { handleApiGatewayError, isUserContentAdmin } from '$lib/server/utils';
import { error, json, redirect, type RequestHandler } from '@sveltejs/kit';
import type { ChatApp } from 'pika-shared/types/chatbot/chatbot-types';
import { getEntityIdForUser, getOverridableFeatures } from 'pika-shared/util/server-utils';

/**
 * Lazily fetch one message's traces (Answer Reasoning panel). Session payloads
 * only carry a hasOffloadedTraces flag; the heavy trace data lives in S3 and is
 * hydrated by the chat API on demand. Auth mirrors the messages route:
 * viewingContentFor for content admins, requestedUserId resolution otherwise.
 */
export const GET: RequestHandler = async ({ params, locals, url, request, cookies }) => {
    const user = locals.user;
    if (!user) {
        throw redirect(302, '/auth/login');
    }

    const { chatAppId, sessionId, messageId } = params;
    if (!chatAppId) {
        throw error(400, 'chatAppId is required');
    }
    if (!sessionId) {
        throw error(400, 'sessionId is required');
    }
    if (!messageId) {
        throw error(400, 'messageId is required');
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
        const requestedUserId = url.searchParams.get('requestedUserId') ?? undefined;
        if (requestedUserId) {
            // GET fails open by design, same as the messages route: a denying or
            // throwing resolver falls back to the session user, so the caller can
            // only ever see traces on their own messages.
            userId = await resolveUserId({
                requestedUserId,
                sessionUserId: user.userId,
                request,
                cookies,
                stage: appConfig.stage,
                chatAppId,
                failOpen: true,
                routeLabel: 'GET /api/trace/[chatAppId]/[sessionId]/[messageId]',
            });
        } else {
            userId = user.userId;
        }
    }

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

    let entityId: string | undefined;
    const features = getOverridableFeatures(siteFeatures ?? {}, chatApp, user);
    if (features.entity.enabled) {
        if (!siteFeatures?.entity?.attributeName) {
            throw error(
                400,
                'attribute name is not defined on the site wide entity feature even though the entity feature is enabled'
            );
        }
        entityId = getEntityIdForUser(user, user.overrideData?.[chatApp.chatAppId], siteFeatures.entity.attributeName);
    }

    if (!mayReceiveTraceContent(user, features.traces?.enabled === true)) {
        throw error(403, 'Trace content is not available to this user');
    }

    try {
        const traces = await getMessageTraces(sessionId, messageId, userId, shareId, entityId);
        return json(traces);
    } catch (e) {
        handleApiGatewayError(e, 'getting chat message traces');
    }
};
