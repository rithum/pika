/**
 * Admin Access Control
 *
 * Sync-protected extension point for admin access gating. Override this hook to add
 * requirements beyond the default pika site-admin role check (e.g., requiring a
 * specific auth provider in addition to the site-admin role).
 *
 * Default: delegates to isUserSiteAdmin() — standard pika behavior, no change.
 *
 * Orthogonality note: this hook is independent of ES-3082's isInternalUser() for
 * demo-mode seams. Demo mode does NOT hide admin controls; this hook controls only
 * whether the current user is allowed into the admin section.
 */
import type { AuthenticatedUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import { isUserSiteAdmin } from '$lib/server/utils';

/**
 * Determines whether the authenticated user is allowed to access admin functionality.
 *
 * Called at every admin route guard in place of the raw isUserSiteAdmin() check.
 * Async by contract even though the default is synchronous — future overrides may
 * need to perform external permission-API lookups without requiring a signature change.
 *
 * @param user - The authenticated user to evaluate
 * @returns true if the user has admin access; false otherwise
 */
export async function isUserAllowedAdminAccess(user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>): Promise<boolean> {
    return isUserSiteAdmin(user);
}
