import type { ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Resolve a sessionId to a session from either the user's regular chat sessions or any
 * registered session source's loaded sessions.
 *
 * Source sessions live in the per-source state map (see ChatAppState's #sourceState), not in
 * #chatSessions — so a lookup that searches only #chatSessions misses them. That gap is the
 * root cause of "clicking a source session does nothing": the id resolved to undefined and the
 * caller fell through to creating a new interim chat.
 *
 * Returns undefined when the id is in neither collection. Callers should treat that as
 * "no such session" and leave the current session unchanged — they must NOT pass the undefined
 * through to a code path that starts a new interim chat.
 *
 * A regular chat session takes precedence over a source session with the same id (ids are
 * expected to be unique across collections; the tie-break is defined for determinism).
 */
export function resolveSessionById(
    sessionId: string,
    chatSessions: ChatSession<RecordOrUndef>[],
    sourceSessions: ChatSession<RecordOrUndef>[]
): ChatSession<RecordOrUndef> | undefined {
    return (
        chatSessions.find((session) => session.sessionId === sessionId) ??
        sourceSessions.find((session) => session.sessionId === sessionId)
    );
}
