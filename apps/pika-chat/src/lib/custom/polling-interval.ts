/**
 * Polling Interval Hook — sync-protected extension point.
 *
 * Controls how often the client polls the server for user-data updates.
 * Override `getUserRefreshIntervalMs` to return a custom interval — for
 * example, demo mode may always return the external-user cadence regardless
 * of the real `userType`.
 *
 * Default: 60 s for internal users, 600 s (10 min) for external users.
 */
import type { ChatUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Returns the polling interval in milliseconds for the authenticated user.
 * Called during layout setup; the value is re-derived reactively when the
 * user object changes.
 */
export function getUserRefreshIntervalMs(user: ChatUser<RecordOrUndef> | undefined): number {
	return user?.userType === 'internal-user' ? 60_000 : 600_000;
}
