/**
 * Sync-protected extension point: return false to hide a message (e.g. a turn your app sends on the
 * user's behalf) from the transcript. Hidden messages stay in the session and still count as the
 * conversation having started. Default: every message renders.
 */
import type { ChatMessageForRendering } from 'pika-shared/types/chatbot/chatbot-types';

export function shouldRenderMessage(_message: ChatMessageForRendering): boolean {
    return true;
}
