/**
 * Legacy User ID Validator
 *
 * Sync-protected extension point for cross-validating a legacy (pre-OIDC) user identity
 * against the authenticated session. Override to implement custom legacy-to-OIDC user
 * resolution logic when running in a dual-auth deployment.
 *
 * Default: always returns undefined — no legacy user validation (OIDC-only deployment).
 */
import type { Cookies } from '@sveltejs/kit';

/** Cookie name used to carry the legacy action user ID across requests. */
export const LEGACY_ACTION_USER_ID_COOKIE = 'pika_legacy_user_id';

/** Request context passed to validateLegacyUserIdIfNeeded. */
export interface LegacyUserValidatorContext {
    /** The incoming HTTP request. */
    request: Request;
    /** SvelteKit cookies accessor. */
    cookies: Cookies;
    /** Deployment stage (e.g. 'prod', 'staging', 'local'). */
    stage: string;
}

/**
 * Cross-validates a legacy user identity for the given effective user ID.
 *
 * Called on message and session API routes before the effective user ID is used.
 * When this hook returns a non-undefined value, that value is used as the effective
 * user ID for the current request instead of effectiveUserId.
 *
 * Secondary arguments are bundled into a context object so future additions
 * (e.g., extra headers, app ID) are non-breaking.
 *
 * @param _effectiveUserId - The user ID derived from the authenticated session
 * @param _sessionUserId - The user ID recorded on the session being accessed
 * @param _context - Request context including cookies, raw request, and stage
 * @returns The validated user ID to use, or undefined to use effectiveUserId unchanged
 */
export async function validateLegacyUserIdIfNeeded(
    _effectiveUserId: string,
    _sessionUserId: string,
    _context: LegacyUserValidatorContext
): Promise<string | undefined> {
    return undefined;
}
