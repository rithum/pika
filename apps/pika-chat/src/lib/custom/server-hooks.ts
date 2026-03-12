/**
 * Server-Side Hooks
 *
 * Extension point for running custom server-side code during the message API route.
 * The core message handler imports and calls these hooks at the right times.
 *
 * Files in `src/lib/custom/` are protected from pika sync — your changes
 * will be preserved when you update from upstream.
 *
 * To ENABLE custom server hooks:
 *   Export a `transformCustomUserData` function (as shown below).
 *
 * To DISABLE custom server hooks:
 *   export const transformCustomUserData = null;
 */
import type { RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Context passed to the transformCustomUserData hook.
 * Provides identifying information about the current request.
 */
export interface TransformCustomUserDataContext {
    /** The authenticated user's ID */
    userId: string;
    /** The chat app ID from the converse request */
    chatAppId: string;
}

/**
 * Called during the message API route before customUserData is encoded into
 * the JWT and sent to the converse Lambda. Use this to enrich, validate, or
 * transform user data before it reaches the agent.
 *
 * The hook receives the raw customUserData (already resolved from overrideData
 * or customData) and a context object. Return the (possibly transformed) data.
 *
 * Errors thrown inside this hook are caught by the framework — the original
 * untransformed data is used as a fallback, and a warning is logged.
 *
 * @param customUserData - The user's custom data (from overrideData or customData)
 * @param _context - Request context with userId and chatAppId
 * @returns The (possibly transformed) customUserData
 */
export async function transformCustomUserData(
    customUserData: RecordOrUndef,
    _context: TransformCustomUserDataContext
): Promise<RecordOrUndef> {
    // No-op: return data unchanged. Override in your project to add transformation logic.
    return customUserData;
}
