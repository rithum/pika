import { getAllChatApps } from '$lib/server/chat-admin-apis';
import { siteFeatures } from '$lib/server/custom-site-features';
import { isUserAllowedToUseSessionInsights, isUserSiteAdmin } from '$lib/server/utils';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url, depends }) => {
    // Add dependency for user data invalidation - ensures this layout reloads when user data changes
    depends('app:user-data');

    if (!locals.user) {
        error(401, 'Unauthorized');
    }

    if (!isUserSiteAdmin(locals.user)) {
        error(403, 'User is not site admin');
    }

    if (url.pathname.includes('session-insights') && !isUserAllowedToUseSessionInsights(locals.user)) {
        error(403, 'User is not allowed to use session insights');
    }

    const chatApps = await getAllChatApps();

    return {
        chatApps,
        siteFeatures
    };
};
