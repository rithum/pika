/**
 * Unit tests for resolveSessionById — the lookup behind ChatAppState.setCurrentSessionById.
 *
 * Regression guard for the "clicking a source session does nothing" defect: source sessions
 * live in the per-source state map, not in #chatSessions, so a #chatSessions-only lookup
 * returned undefined and the caller silently started a new interim chat instead of selecting
 * the clicked session.
 */
import { describe, it, expect } from '@jest/globals';
import { resolveSessionById } from '../src/lib/client/features/chat/session-resolver';
import type { ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

function makeSession(id: string, title = ''): ChatSession<RecordOrUndef> {
    return {
        sessionId: id,
        userId: 'user-1',
        agentId: 'agent-1',
        chatAppId: 'app-1',
        identityId: 'identity-1',
        invocationMode: 'standard',
        entityId: '',
        createDate: '2024-01-01T00:00:00Z',
        lastUpdate: '2024-01-01T00:00:00Z',
        sessionAttributes: {},
        title,
    };
}

describe('resolveSessionById', () => {
    const chatA = makeSession('chat-a', 'Chat A');
    const chatB = makeSession('chat-b', 'Chat B');
    const sourceX = makeSession('source-x', 'Legacy X');
    const sourceY = makeSession('source-y', 'Legacy Y');

    it('resolves a regular chat session by id', () => {
        const result = resolveSessionById('chat-b', [chatA, chatB], [sourceX, sourceY]);
        expect(result).toBe(chatB);
    });

    it('resolves a source session that is absent from chatSessions (the defect this guards)', () => {
        const result = resolveSessionById('source-x', [chatA, chatB], [sourceX, sourceY]);
        expect(result).toBe(sourceX);
    });

    it('returns undefined when the id is in neither collection (caller leaves current unchanged)', () => {
        const result = resolveSessionById('does-not-exist', [chatA, chatB], [sourceX, sourceY]);
        expect(result).toBeUndefined();
    });

    it('returns undefined when both collections are empty', () => {
        expect(resolveSessionById('anything', [], [])).toBeUndefined();
    });

    it('prefers a regular chat session over a source session with the same id', () => {
        const dupChat = makeSession('dup', 'From chats');
        const dupSource = makeSession('dup', 'From source');
        expect(resolveSessionById('dup', [dupChat], [dupSource])).toBe(dupChat);
    });
});
