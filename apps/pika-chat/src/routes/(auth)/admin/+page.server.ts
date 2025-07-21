import { getAllChatApps } from '$lib/server/chat-admin-apis';
import { siteFeatures } from '$lib/server/custom-site-features';
import { isUserSiteAdmin } from '$lib/server/utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    console.log('[Layout Server] User:', JSON.stringify(locals.user, null, 2));

    if (!isUserSiteAdmin(locals.user)) {
        return new Response('User is not site admin', { status: 403 });
    }
};
