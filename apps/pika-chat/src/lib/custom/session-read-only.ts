import type { ChatUser, ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Determines whether the given session should be treated as read-only.
 *
 * Called reactively when the current session changes. The result is OR-ed with
 * pika's built-in read-only conditions (e.g., shared-by-someone-else sessions)
 * and with any per-source SessionSource.isReadOnly predicate.
 *
 * @param _session - The current session, or undefined when no session is active
 * @param _user - The current user, or undefined when no user is active
 * @returns true to make the session read-only; false to use default behavior
 */
export function isSessionReadOnly(
    _session: ChatSession<RecordOrUndef> | undefined,
    _user: ChatUser<RecordOrUndef> | undefined
): boolean {
    return false;
}
