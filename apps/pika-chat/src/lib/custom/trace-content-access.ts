/**
 * Trace Content Access Hook — sync-protected extension point. Decides whether a user may receive
 * trace content (system prompt, tool inputs and outputs). Default: true, preserving existing behavior.
 */
import type { ChatUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/** `tracesFeatureEnabled` is the app's resolved `features.traces.enabled`; site-admin reads pass true. */
export function mayReceiveTraceContent(user: ChatUser<RecordOrUndef> | undefined, tracesFeatureEnabled: boolean): boolean {
    return true;
}
