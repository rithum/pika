import type { ChatUser, ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import type { Component } from 'svelte';

/**
 * Allowed format for SessionSource.id: alphanumeric, dash, underscore. Constraint applied at
 * source-registration time in chat-app.state.svelte.ts#loadAdditionalSessions; sources whose
 * id fails this check are dropped with a console.warn. The constraint exists so the id can
 * be safely used as a Svelte key, a SvelteMap key, and (defensively) as a future HTML
 * attribute or URL fragment without escaping.
 */
export const SESSION_SOURCE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export interface SessionSource {
    /**
     * Stable identifier for this source. Must match `SESSION_SOURCE_ID_PATTERN`
     * (alphanumeric + dash + underscore). Used as a Svelte key, a SvelteMap key, and
     * for diagnostics. Two sources with the same id is a programming error — the framework
     * logs a warning and drops the later duplicate.
     */
    id: string;
    /** Header label rendered above this source's session list. */
    label?: string;
    /**
     * Loads sessions for this source.
     *
     * Called client-side once per chat-app init, in parallel with other sources via Promise.allSettled.
     * Capture `user` and `chatAppId` from the enclosing getAdditionalSessionSources closure when
     * constructing this descriptor — the framework does not re-pass them.
     *
     * Return [] for "applicable but empty." If the source is not applicable to this user, omit it
     * from the getAdditionalSessionSources return array entirely (do not return [] as a signal).
     */
    load(): Promise<ChatSession<RecordOrUndef>[]>;
    /** Per-source read-only predicate. OR-ed with the top-level isSessionReadOnly hook. */
    isReadOnly?: (session: ChatSession<RecordOrUndef>) => boolean;
    /**
     * Optional sidebar slots.
     * - `trigger` renders before load completes (e.g. a "Load sessions" button or progress indicator).
     * - `header` renders inside `Sidebar.GroupLabel` above the loaded session list.
     */
    sidebarSlot?: {
        header?: Component<Record<string, never>>;
        trigger?: Component<Record<string, never>>;
    };
}

/**
 * Returns 0..N session sources for the current user/chatApp. Return an empty array (the default)
 * if this deployment has no additional session sources. Omit sources that do not apply to this
 * particular user — do not return them with a load() that yields [].
 */
export async function getAdditionalSessionSources(
    _user: ChatUser<RecordOrUndef>,
    _chatAppId: string
): Promise<SessionSource[]> {
    return [];
}
