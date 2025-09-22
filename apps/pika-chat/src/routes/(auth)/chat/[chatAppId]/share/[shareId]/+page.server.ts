import { recordShareVisit, validateShareAccess } from '$lib/server/chat-apis';
import { ApiGatewayError } from '$lib/server/utils';
import { error, redirect, type ServerLoad } from '@sveltejs/kit';

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

    try {
        // Validate share access and get session
        const shareAccess = await validateShareAccess(user, shareId, chatAppId);

        if (!shareAccess.hasAccess) {
            throw redirect(302, `/chat/${chatAppId}?error=share_access_denied`);
        }

        // Record the visit (this is not critical, so we don't let errors here fail the whole flow)
        try {
            await recordShareVisit(user.userId, shareId);
        } catch (visitError) {
            // Log but don't fail - visit recording is not critical
            console.error('Non-critical error recording share visit:', visitError);
        }

        // Redirect to main chat with share parameters to trigger loading
        throw redirect(302, `/chat/${chatAppId}?share=${shareId}&session=${shareAccess.sessionData?.sessionId}`);
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

        console.error('Share access error:', e);
        throw redirect(302, `/chat/${chatAppId}?error=share_not_found`);
    }
};
