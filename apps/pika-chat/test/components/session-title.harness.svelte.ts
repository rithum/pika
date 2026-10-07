/** Session-title reproduction harness. */
import { flushSync } from 'svelte';
import type { Snippet } from 'svelte';
import type { ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

export function makeSession(id: string, title = '', lastUpdate = '2024-01-01T00:00:00Z'): ChatSession<RecordOrUndef> {
    return {
        sessionId: id,
        userId: 'user-1',
        agentId: 'agent-1',
        chatAppId: 'app-1',
        identityId: 'identity-1',
        invocationMode: 'standard',
        entityId: '',
        createDate: '2024-01-01T00:00:00Z',
        lastUpdate,
        sessionAttributes: {},
        title,
    };
}

export class FakeChatAppState {
    #chatSessions = $state<ChatSession<RecordOrUndef>[]>([]);
    // Mirrors chat-app.state.svelte.ts exactly: spreads the array, sorts by lastUpdate,
    // never reads .title.
    #sorted = $derived.by(() => {
        const arr = [...this.#chatSessions];
        return arr.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
    });
    #currentSession = $state<ChatSession<RecordOrUndef> | null>(null);

    pageTitle = $state<string | undefined>(undefined);
    pageHeaderRight = $state<Snippet | undefined>(undefined);

    sessionSources: unknown[] = [];
    pinnedSessions: unknown[] = [];
    recentSharedSessionVisits: unknown[] = [];
    isStreamingResponseNow = false;
    sourceStatus = () => 'loaded' as const;
    sourceSessions = () => [] as ChatSession<RecordOrUndef>[];
    sourceLabel = () => undefined;
    getSessionShareStatus = () => undefined;
    setCurrentSessionById = () => {};
    loadSharedSession = async () => {};
    unpinSession = () => {};

    updateStreamingMessageIds = () => {};

    constructor(sessions: ChatSession<RecordOrUndef>[], current: ChatSession<RecordOrUndef> | null) {
        this.#chatSessions = sessions;
        this.#currentSession = current;
    }

    get sortedChatSessions() {
        return this.#sorted;
    }
    get chatSessions() {
        return this.#chatSessions;
    }
    get currentSession() {
        return this.#currentSession;
    }
    // Same contract as the real class: assigns both fields, so omitting the second
    // arg clears any right-header Snippet the previous session registered.
    setPageHeader(title: string, rightHeaderArea?: Snippet) {
        this.pageTitle = title;
        this.pageHeaderRight = rightHeaderArea;
    }

    // Mirrors the header line of the real #setSession: switching sessions routes
    // through setPageHeader so both title and right-header widget stay consistent.
    switchSession(session: ChatSession<RecordOrUndef>) {
        this.#currentSession = session;
        this.setPageHeader(this.#currentSession.title ?? '');
    }
}

/** Mirrors what chat-nav.svelte's {#each chat.sortedChatSessions as session} does reactively: an effect that reads each session.title. */
export function observeSidebarTitles(chat: FakeChatAppState): {
    snapshot: () => string[];
    cleanup: () => void;
} {
    let titles: string[] = [];
    const cleanup = $effect.root(() => {
        $effect(() => {
            titles = chat.sortedChatSessions.map((s) => s.title ?? '');
        });
    });
    flushSync();
    return { snapshot: () => titles, cleanup };
}
