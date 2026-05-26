/**
 * Session Account Context Transformation
 *
 * Sync-protected extension point for enriching or normalizing session data with
 * account context before it is returned to the client. Override to backfill missing
 * account/entity IDs using data from the authenticated user.
 *
 * Default: returns the session unchanged — no transformation (standard pika behavior).
 */
import type { AuthenticatedUser, ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Applies account context to the session before it is returned from the session API.
 *
 * Called on each session returned by the session GET endpoint and on search
 * results from the site-admin endpoint. The returned session replaces the original.
 * Must not mutate the input session; return a new object if modifications are needed.
 *
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
