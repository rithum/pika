import type { AppState } from '$lib/client/app/app.state.svelte';
import type { ChatMessageForRendering } from 'pika-shared/types/chatbot/chatbot-types';
import type { ChatAppState } from '../../chat-app.state.svelte';
import type { MetadataTagSegment } from '../segment-types';

interface PikaMetadata {
    userMessageId: string;
    assistantMessageId: string;
    sessionLastUpdate: string;
    sessionLastMessageId: string;
    sessionTitle?: string;
}

/**
 * Handler for <pika-metadata> tags streamed from the server.
 * Updates local session state with server-generated metadata to avoid expensive refresh calls.
 * 
 * This is called automatically by the segment processor when a <pika-metadata> tag is completed.
 */
export function pikaMetadataHandler(segment: MetadataTagSegment, message: ChatMessageForRendering, chatAppState: ChatAppState | undefined, _appState: AppState): void {
    if (segment.streamingStatus !== 'completed' || !chatAppState) {
        return;
    }

    try {
        const metadata: PikaMetadata = JSON.parse(segment.rawContent);

        // Get current session - we need to cast to access private method
        const currentSession = chatAppState.currentSession;
        if (!currentSession) {
            return;
        }

        // Update current session with server metadata
        currentSession.lastUpdate = metadata.sessionLastUpdate;
        currentSession.lastMessageId = metadata.sessionLastMessageId;
        if (metadata.sessionTitle) {
            currentSession.title = metadata.sessionTitle;
        }

        // Update the session in the sessions array (find and update in-place)
        // If this was a new session (interim -> real), add it to the array
        const chatSessions = (chatAppState as any).chatSessions;
        const sessionInList = chatSessions?.find((s: any) => s.sessionId === currentSession.sessionId);
        if (sessionInList) {
            // Existing session - update it
            sessionInList.lastUpdate = metadata.sessionLastUpdate;
            sessionInList.lastMessageId = metadata.sessionLastMessageId;
            if (metadata.sessionTitle) {
                sessionInList.title = metadata.sessionTitle;
            }
        } else {
            // New session - add it to the array
            // This happens when we go from interim session -> real session
            chatSessions.push(currentSession);
        }

        // Update message IDs from interim to real server-generated IDs
        // Use the atomic method that updates both the message ID and the tracking ID
        chatAppState.updateStreamingMessageIds(metadata.assistantMessageId, metadata.userMessageId);

    } catch (error) {
        console.error('[METADATA-TRACKING] Failed to process pika metadata:', error);
    }
}

