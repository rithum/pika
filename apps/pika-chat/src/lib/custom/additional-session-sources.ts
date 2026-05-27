import type { ChatUser, ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import type { Component } from 'svelte';

export interface SessionSource {
    /** Stable identifier for this source. Used as a Svelte key and for diagnostics. */
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
     * - `trigger` renders before load completes (e.g. a "Load legacy chats" button).
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
