/**
 * Session Read-Only Predicate
 *
 * Sync-protected extension point for determining whether the current chat session
 * should be read-only. Override to mark additional session types as read-only beyond
 * pika's built-in shared-session read-only behavior.
 *
 * Default: returns false — all sessions are editable (standard pika behavior).
 *
 * Note: pika's existing read-only logic for sessions shared by another user is applied
 * independently (currentSessionIsSharedBySomeoneElse). This hook is OR-ed with that
 * check — either condition makes the session read-only.
 *
 * Why separate from loadLegacyChatsIfNeeded: the read-only predicate is consumed
 * by chat-input, prompt, and other components spread across the chat UI, not just
 * the nav. Keeping it as its own hook decouples those components from the session loader.
 */
import type { ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Determines whether the given session should be treated as read-only.
 *
 * Called reactively when the current session changes. The result is OR-ed with
 * pika's built-in read-only conditions (e.g., shared-by-someone-else sessions).
 *
 * @param _session - The current session, or undefined when no session is active
 * @returns true to make the session read-only; false to use default behavior
 */
export function isCurrentSessionReadOnly(_session: ChatSession<RecordOrUndef> | undefined): boolean {
    return false;
}
