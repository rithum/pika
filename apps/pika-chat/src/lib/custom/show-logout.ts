/**
 * Show Logout Hook — sync-protected extension point.
 *
 * Controls whether the Logout menu item is visible in user-settings dropdowns.
 * Override `shouldShowLogout` to return false when you want to hide the item —
 * e.g. demo-mode deployments that use SSO-managed sessions where an explicit
 * logout action is not relevant or desirable.
 *
 * When this returns false the Logout item is removed from all four dropdown
 * locations: chat titlebar, chat sidebar nav, site-admin titlebar, and the
 * home-page settings gear.
 *
 * Default: returns true — Logout is always shown (preserves existing pika
 * behavior for all consumers).
 */
import type { ChatUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Returns whether the Logout menu item should be shown for the given user.
 * Override this in your project to hide the item in demo mode or for specific
 * user types.
 */
export function shouldShowLogout(user: ChatUser<RecordOrUndef> | undefined): boolean {
	return true;
}
