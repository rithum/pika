/** Session title not displayed in sidebar or chat header after generation. */
import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import type { Snippet } from 'svelte';
import { pikaMetadataHandler } from '../../src/lib/client/features/chat/message-segments/default-components/pika-metadata-handler';
import { FakeChatAppState, makeSession, observeSidebarTitles } from './session-title.harness.svelte';

function metadataSegment(sessionTitle: string) {
    return {
        streamingStatus: 'completed',
        rawContent: JSON.stringify({
            userMessageId: 'u-1',
            assistantMessageId: 'a-1',
            sessionLastUpdate: '2024-06-01T00:00:00Z',
            sessionLastMessageId: 'm-1',
            sessionTitle,
        }),
    } as unknown as Parameters<typeof pikaMetadataHandler>[0];
}

function runHandler(chat: FakeChatAppState, title: string) {
    pikaMetadataHandler(
        metadataSegment(title),
        {} as unknown as Parameters<typeof pikaMetadataHandler>[1],
        chat as unknown as Parameters<typeof pikaMetadataHandler>[2],
        {} as unknown as Parameters<typeof pikaMetadataHandler>[3]
    );
}

describe('session title after generation', () => {
    it('sidebar list reflects the generated title for the current session', () => {
        const session = makeSession('s-1', ''); // untitled, as right after the first message
        const chat = new FakeChatAppState([session], session);
        const obs = observeSidebarTitles(chat);
        expect(obs.snapshot()).toEqual(['']);

        runHandler(chat, 'Generated Title');
        flushSync();

        expect(obs.snapshot()).toEqual(['Generated Title']);
        obs.cleanup();
    });

    it('interim → real: a titled current session not yet in the list appears with its title', () => {
        // New chat: current session is interim and not in #chatSessions; the handler's
        // else-branch pushes it. Models the first-message flow.
        const interim = makeSession('interim-xyz', '');
        const chat = new FakeChatAppState([], interim);
        const obs = observeSidebarTitles(chat);
        expect(obs.snapshot()).toEqual([]);

        runHandler(chat, 'Generated Title');
        flushSync();

        expect(obs.snapshot()).toEqual(['Generated Title']);
        obs.cleanup();
    });

    it('chat header page title is set to the generated title', () => {
        const session = makeSession('s-1', '');
        const chat = new FakeChatAppState([session], session);

        runHandler(chat, 'Generated Title');
        flushSync();

        expect(chat.pageTitle).toBe('Generated Title');
    });

    it('switching sessions clears the previous session right-header widget', () => {
        const a = makeSession('s-a', 'Session A');
        const b = makeSession('s-b', 'Session B');
        const chat = new FakeChatAppState([a, b], a);

        // A widget in session A registers a custom right-header Snippet.
        const widget = (() => {}) as unknown as Snippet;
        chat.setPageHeader('Session A', widget);
        expect(chat.pageHeaderRight).toBe(widget);

        // Switching to B must route through setPageHeader, resetting the right
        // header — a bare #pageTitle assignment would leave A's widget mounted.
        chat.switchSession(b);
        expect(chat.pageTitle).toBe('Session B');
        expect(chat.pageHeaderRight).toBeUndefined();
    });
});
