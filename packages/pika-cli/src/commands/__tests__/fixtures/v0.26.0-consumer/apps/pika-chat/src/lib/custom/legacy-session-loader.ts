/**
 * Legacy Chat Session Loader
 *
 * Sync-protected extension point for loading sessions from a legacy chat system.
 * Override this hook to bridge an external session store into the pika nav sidebar.
 *
 * Default: returns an empty session list — no legacy sessions loaded (OIDC-only behavior).
 *
 * Note: the note/header copy for the legacy section is decoupled from this hook.
 * Rendering consumer-specific copy from a synced framework file is domain leakage;
 * use getLegacyChatsSectionHeader() (see legacy-chats-section-header.ts) for that.
 */
import type { AuthenticatedUser, ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/** Shape returned by loadLegacyChatsIfNeeded. */
export interface LegacySessionsResult {
    /** Sessions loaded from the legacy system, ordered by recency (newest first). */
    sessions: ChatSession<RecordOrUndef>[];
    /**
     * Whether legacy sessions were actually loaded.
     * When false, the sidebar omits the legacy section entirely.
     * When true, the section is shown even if sessions is empty.
     */
    loaded: boolean;
}

/**
 * Loads legacy chat sessions for the given user and chat app, if the deployment
 * supports a legacy session store.
 *
 * Called during chat app initialization alongside refreshChatSessions().
 *
 * @param _user - The authenticated user whose legacy sessions to fetch
 * @param _chatAppId - The chat app being initialized
 * @returns Legacy sessions result; default returns loaded=false (no legacy section)
 */
export async function loadLegacyChatsIfNeeded(
    _user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    _chatAppId: string
): Promise<LegacySessionsResult> {
    return { sessions: [], loaded: false };
}
