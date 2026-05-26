/**
 * Home-Page User Hook — sync-protected extension point.
 *
 * Controls which user identity is used when filtering chat apps on the home
 * page. Override `resolveUserForHomeChatApps` to substitute a different
 * identity (e.g., an external user in demo mode) without affecting auth,
 * logging, analytics, or the message API — those always use `locals.user`.
 *
 * The `event` parameter provides access to `cookies` and other request
 * context if your override needs to read demo-mode state.
 *
 * Default: returns the user unchanged.
 */
import type { ChatUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Returns the user to use for home-page chat-app filtering.
 * Override this to substitute a different identity (e.g., external user in demo mode).
 */
export function resolveUserForHomeChatApps(
	user: ChatUser<RecordOrUndef>,
	_event: RequestEvent
): ChatUser<RecordOrUndef> {
	return user;
}
