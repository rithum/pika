/**
 * Server-Side Hooks
 *
 * Extension points for custom server-side code. The core framework imports and
 * calls these hooks at the appropriate times.
 *
 * Files in `src/lib/custom/` are protected from pika sync — your changes
 * will be preserved when you update from upstream.
 *
 * Hooks in this file:
 *   - transformCustomUserData  — enrich/transform user data before the converse Lambda
 *   - onAuthProviderCallback   — run custom logic on OAuth provider callbacks (C6)
 *
 * To ENABLE custom server hooks:
 *   Export the relevant function as shown below.
 *
 * To DISABLE custom server hooks:
 *   export const transformCustomUserData = null;
 */
import type { RequestEvent } from '@sveltejs/kit';
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

/**
 * Called from hooks.server.ts whenever a request arrives at an OAuth provider
 * callback path (/auth/callback/<provider>). Use this to register per-provider
 * post-callback logic — e.g., clearing legacy session cookies or exchanging tokens
 * with an external identity service — without editing the synced hooks.server.ts.
 *
 * The hook fires BEFORE the route is resolved, so cookies set here are visible
 * to the downstream route handler.
 *
 * Default: no-op.
 *
 * ⚠️ Co-design note (ES-3126/ES-3127): the companion hook for
 * isAdminSectionPath-driven session clearing lives here as well; its exact
 * signature was finalized in coordination with the ES-3127 ai-bot consumer.
 *
 * @param _event - The SvelteKit request event for the callback request
 * @param _provider - The OAuth provider extracted from the path (e.g., 'azuread')
 */
export async function onAuthProviderCallback(_event: RequestEvent, _provider: string): Promise<void> {
    // No-op. Override to add per-provider post-callback logic.
}
