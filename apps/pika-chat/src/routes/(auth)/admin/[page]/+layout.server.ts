import { getAllChatApps } from '$lib/server/chat-admin-apis';
import { siteFeatures } from '$lib/server/custom-site-features';
import { isUserSiteAdmin } from '$lib/server/utils';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
    if (!locals.user) {
        error(401, 'Unauthorized');
    }

    if (!isUserSiteAdmin(locals.user)) {
        error(403, 'User is not site admin');
    }

    const chatApps = await getAllChatApps();

    return {
        chatApps,
        siteFeatures
    };
};
