/**
 * Component tests for chat-nav.svelte — 7 nav states per plan §3 step 7.
 *
 * Tests assert structural DOM output (text content, element presence) across
 * every sessionSources render branch. Pixel-level layout, focus management,
 * and ARIA live-region timing are deferred to ES-3127 per plan §2g.
 *
 * Mock strategy:
 *   - pika-ux/shadcn/sidebar → passthrough stubs (vitest.config.ts alias)
 *   - pika-ux/shadcn/button → passthrough stub
 *   - $icons/* → noop stubs
 *   - chatAppState context → inline mock object per test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import type { Component } from 'svelte';
import ChatNav from '../../src/lib/client/features/chat/nav/chat-nav.svelte';
import type { ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import type { SessionSource } from '../../src/lib/custom/additional-session-sources';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeSource(
    id: string,
    overrides: Partial<SessionSource> = {}
): SessionSource {
    return {
        id,
        load: async () => [],
        ...overrides,
    };
}

type SourceStatus = 'loading' | 'loaded' | 'error';

interface MockChat {
    sessionSources: SessionSource[];
    sourceStatus: (id: string) => SourceStatus;
    sourceSessions: (id: string) => ChatSession<RecordOrUndef>[];
    sourceLabel: (id: string) => string | undefined;
    pinnedSessions: unknown[];
    recentSharedSessionVisits: unknown[];
    sortedChatSessions: unknown[];
    currentSession: null;
    isStreamingResponseNow: boolean;
    chatSessions: unknown[];
    getSessionShareStatus: () => undefined;
    setCurrentSessionById: () => void;
    loadSharedSession: () => Promise<void>;
    unpinSession: () => void;
}

function makeMockChat(overrides: Partial<MockChat> = {}): MockChat {
    return {
        sessionSources: [],
        sourceStatus: vi.fn(() => 'loading' as SourceStatus),
        sourceSessions: vi.fn(() => []),
        sourceLabel: vi.fn(() => undefined),
        pinnedSessions: [],
        recentSharedSessionVisits: [],
        sortedChatSessions: [],
        currentSession: null,
        isStreamingResponseNow: false,
        chatSessions: [],
        getSessionShareStatus: () => undefined,
        setCurrentSessionById: vi.fn(),
        loadSharedSession: vi.fn(async () => {}),
        unpinSession: vi.fn(),
        ...overrides,
    };
}

function renderChatNav(chat: MockChat) {
    return render(ChatNav, {
        context: new Map([['chatAppState', chat]]),
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chat-nav.svelte — sessionSources rendering', () => {
    // (a) no additional sources → no extra Sidebar.Group rendered for sources
    it('(a) renders no source groups when sessionSources is empty', () => {
        const chat = makeMockChat({ sessionSources: [] });
        renderChatNav(chat);

        // No source-specific text should appear
        expect(screen.queryByText('Loading...')).toBeNull();
        expect(screen.queryByText('No sessions found.')).toBeNull();
        expect(screen.queryByText('This section could not be loaded.')).toBeNull();
        // My Chats group always renders
        expect(screen.getByText('My Chats')).toBeInTheDocument();
    });

    // (b) single source status: 'loading' with sidebarSlot.trigger → trigger rendered, no loading row
    it('(b) renders trigger component when source is loading and sidebarSlot.trigger is set', async () => {
        // Import the noop stub to use as a real Svelte component stand-in
        const { default: NoopComponent } = await import('../__mocks__/noop.svelte');

        const source = makeSource('test-src', {
            sidebarSlot: { trigger: NoopComponent as Component<Record<string, never>> },
        });
        const chat = makeMockChat({
            sessionSources: [source],
            sourceStatus: vi.fn(() => 'loading' as SourceStatus),
        });
        renderChatNav(chat);

        // Default loading row must NOT appear when a trigger component replaces it
        expect(screen.queryByText('Loading...')).toBeNull();
    });

    // (c) single source status: 'loading' without trigger → default loading row
    it('(c) renders default loading row when source is loading and no sidebarSlot.trigger', () => {
        const source = makeSource('test-src');
        const chat = makeMockChat({
            sessionSources: [source],
            sourceStatus: vi.fn(() => 'loading' as SourceStatus),
        });
        renderChatNav(chat);

        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    // (d) single source status: 'loaded' with sessions → header (if set) + session list
    it('(d) renders session list when source is loaded with sessions', () => {
        const sessions = [
            makeSession('s-1', 'Session Alpha'),
            makeSession('s-2', 'Session Beta'),
        ];
        const source = makeSource('test-src', { label: 'My Source' });
        const chat = makeMockChat({
            sessionSources: [source],
            sourceStatus: vi.fn(() => 'loaded' as SourceStatus),
            sourceSessions: vi.fn(() => sessions),
            sourceLabel: vi.fn(() => 'My Source'),
        });
        renderChatNav(chat);

        expect(screen.getByText('My Source')).toBeInTheDocument();
        expect(screen.getByText('Session Alpha')).toBeInTheDocument();
        expect(screen.getByText('Session Beta')).toBeInTheDocument();
        expect(screen.queryByText('No sessions found.')).toBeNull();
    });

    // (e) single source status: 'loaded' with empty sessions → empty-state row
    it('(e) renders empty-state row when source is loaded with no sessions', () => {
        const source = makeSource('test-src');
        const chat = makeMockChat({
            sessionSources: [source],
            sourceStatus: vi.fn(() => 'loaded' as SourceStatus),
            sourceSessions: vi.fn(() => []),
        });
        renderChatNav(chat);

        expect(screen.getByText('No sessions found.')).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).toBeNull();
        expect(screen.queryByText('This section could not be loaded.')).toBeNull();
    });

    // (f) single source status: 'error' → header (if set) + inline error row
    it('(f) renders error row when source status is error', () => {
        const source = makeSource('test-src', { label: 'Broken Source' });
        const chat = makeMockChat({
            sessionSources: [source],
            sourceStatus: vi.fn(() => 'error' as SourceStatus),
            sourceLabel: vi.fn(() => 'Broken Source'),
        });
        renderChatNav(chat);

        expect(screen.getByText('This section could not be loaded.')).toBeInTheDocument();
        expect(screen.getByText('Broken Source')).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).toBeNull();
        expect(screen.queryByText('No sessions found.')).toBeNull();
    });

    // (g) two sources with mixed status — both groups render independently
    it('(g) renders two source groups side-by-side without one breaking the other', () => {
        const sessions = [makeSession('s-1', 'Loaded Session')];
        const sourceA = makeSource('src-loading');
        const sourceB = makeSource('src-loaded', { label: 'Source B' });

        const statusMap: Record<string, SourceStatus> = {
            'src-loading': 'loading',
            'src-loaded': 'loaded',
        };
        const sessionsMap: Record<string, ChatSession<RecordOrUndef>[]> = {
            'src-loading': [],
            'src-loaded': sessions,
        };

        const chat = makeMockChat({
            sessionSources: [sourceA, sourceB],
            sourceStatus: vi.fn((id: string) => statusMap[id]),
            sourceSessions: vi.fn((id: string) => sessionsMap[id] ?? []),
            sourceLabel: vi.fn((id: string) => id === 'src-loaded' ? 'Source B' : undefined),
        });
        renderChatNav(chat);

        // Loading source renders its row
        expect(screen.getByText('Loading...')).toBeInTheDocument();
        // Loaded source renders its label and session
        expect(screen.getByText('Source B')).toBeInTheDocument();
        expect(screen.getByText('Loaded Session')).toBeInTheDocument();
        // No error or empty-state rows
        expect(screen.queryByText('This section could not be loaded.')).toBeNull();
        expect(screen.queryByText('No sessions found.')).toBeNull();
    });
});
