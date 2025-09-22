import { getMatchingChatApps } from '$lib/server/chat-admin-apis';
import { validateShareAccess } from '$lib/server/chat-apis';
import { siteFeatures } from '$lib/server/custom-site-features';
import { handleApiGatewayError } from '$lib/server/utils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { ChatApp, ChatUser, RecordOrUndef, ValidateShareAccessRequest } from 'pika-shared/types/chatbot/chatbot-types';
import { getEntityIdForUser, getOverridableFeatures } from 'pika-shared/util/server-utils';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }

    try {
        const req: ValidateShareAccessRequest = await request.json();

        if (!req.shareId && !req.chatAppId) {
            throw error(400, 'shareId or chatAppId are required');
        }

        let customDataFieldPathToMatchUsersEntity: string | undefined;
        if (siteFeatures?.entity?.enabled && siteFeatures.entity.attributeName) {
            customDataFieldPathToMatchUsersEntity = siteFeatures.entity.attributeName;
        }

        let chatApp: ChatApp | undefined;
        try {
            const matchingChatApps = await getMatchingChatApps(locals.user, false, undefined, req.chatAppId, customDataFieldPathToMatchUsersEntity);
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
            req.entityId = getEntityIdForUser(user, user.overrideData?.[chatApp.chatAppId], siteFeatures.entity.attributeName);
        } else {
            req.entityId = undefined;
        }

        const result = await validateShareAccess(user as ChatUser<RecordOrUndef>, req.shareId, req.chatAppId, req.entityId);
        return json(result);
    } catch (e) {
        handleApiGatewayError(e, 'validating share access');
    }
};
