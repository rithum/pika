/**
 * Show Detailed Trace Hook — sync-protected extension point.
 *
 * Controls whether the detailed-trace UI is visible in the chat message trace
 * panel. Override `shouldShowDetailedTrace` to return false when you want to
 * hide the detailed trace UI — e.g. demo-mode deployments that present an
 * external-user view should hide implementation details like raw trace data.
 *
 * When this returns false, `detailedTrace` is set to undefined in trace.svelte
 * which suppresses the "Detailed Traces" panel entirely.
 *
 * Default: returns true — detailed traces are always shown (preserves existing
 * pika behavior for all consumers).
 */
import type { ChatUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Returns whether the detailed-trace UI should be shown for the given user.
 * Override this in your project to hide the panel in demo mode or for
 * external users.
 */
export function shouldShowDetailedTrace(user: ChatUser<RecordOrUndef> | undefined): boolean {
	return true;
}
