import { getAllChatApps } from '$lib/server/chat-admin-apis';
import { siteFeatures } from '$lib/server/custom-site-features';
import { isUserSiteAdmin } from '$lib/server/utils';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
    if (!locals.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    if (!isUserSiteAdmin(locals.user)) {
        return new Response('User is not site admin', { status: 403 });
    }

    const chatApps = await getAllChatApps();

    return {
        chatApps,
        siteFeatures
    };
};
