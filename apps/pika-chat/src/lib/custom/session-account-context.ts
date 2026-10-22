/**
 * Session Account Context Transformation
 *
 * Sync-protected extension point for enriching or normalizing session data with
 * account context before it is returned to the client. Override to backfill missing
 * account/entity IDs using data from the authenticated user.
 *
 * Default: returns the session unchanged — no transformation (standard pika behavior).
 */
import type { AuthenticatedUser, ChatSession, PinnedObjAndChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Applies account context to the session before it is returned from the session API.
 *
 * Must not mutate the input session; return a new object if modifications are needed.
 *
 * @deprecated Not called by pika; filter lists in scopeSessionsToAccount instead.
 * @param session - The session to enrich or normalize
 * @param _user - The authenticated user associated with the session request
 * @returns The (possibly transformed) session
 */
export function transformSessionAccountContext(
    session: ChatSession<RecordOrUndef>,
    _user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>
): ChatSession<RecordOrUndef> {
    return session;
}

/**
 * Filters the session list a user sees, for example to the account the request acts on. `viewingAnotherUser` is true when a content admin lists another user's sessions. Default: unchanged.
 */
export function scopeSessionsToAccount(
    sessions: ChatSession<RecordOrUndef>[],
    _user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    _chatAppId: string,
    _viewingAnotherUser = false
): ChatSession<RecordOrUndef>[] {
    return sessions;
}

/**
 * Filters pinned-session search results the same way. Default: unchanged.
 */
export function scopePinnedResultsToAccount(
    results: PinnedObjAndChatSession[] | undefined,
    _user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    _chatAppId: string
): PinnedObjAndChatSession[] | undefined {
    return results;
}
