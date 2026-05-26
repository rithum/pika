/**
 * Effective User Hook — sync-protected extension point.
 *
 * Controls what "internal user" means in the UI (badge display, extra user info
 * in dropdowns, visible app filtering). Override `isInternalUser` to mask the
 * real identity for demo mode or other presentation needs.
 *
 * IMPORTANT — orthogonality with admin access:
 * This hook affects UI rendering only. Admin-access gating is handled by
 * `isUserAllowedAdminAccess` (ES-3126) which reads `user.userType` /
 * `user.authData.provider` directly. Setting `isInternalUser` to false in
 * demo mode does NOT hide admin controls — the two predicates are deliberately
 * independent. Do not try to "fix" this perceived inconsistency.
 *
 * Default: returns true when user.userType === 'internal-user'.
 */
import type { ChatUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Returns whether the user should be treated as internal in the UI.
 * Override this in your project to implement demo mode or other identity masking.
 */
export function isInternalUser(user: ChatUser<RecordOrUndef>): boolean {
	return user.userType === 'internal-user';
}
