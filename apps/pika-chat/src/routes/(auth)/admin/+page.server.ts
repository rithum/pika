import { isUserSiteAdmin } from '$lib/server/utils';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        error(401, 'Unauthorized');
    }

    // console.log('[Layout Server] User:', JSON.stringify(locals.user, null, 2));

    if (!isUserSiteAdmin(locals.user)) {
        error(403, 'User is not site admin');
    }
};
