/**
 * Session Entity Extraction
 *
 * Sync-protected extension point for extracting the entity or account identifier
 * from a session. Override to implement custom entity-ID resolution when your
 * deployment stores account/entity IDs in non-standard session attributes.
 *
 * Default: returns session.entityId — the canonical pika entity field.
 */
import type { ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Extracts the entity or account identifier from the given session.
 *
 * Called when rendering entity/account context in the session admin table,
 * share dialogs, and the chat title bar. The returned value is display-only
 * and does not affect session routing or access control.
 *
 * @param session - The session to extract entity/account identity from
 * @returns The entity/account identifier string, or undefined if not present
 */
export function getSessionEntityValue(session: ChatSession<RecordOrUndef>): string | undefined {
    return session.entityId || undefined;
}
