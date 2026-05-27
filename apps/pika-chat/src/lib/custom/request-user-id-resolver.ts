import type { Cookies } from '@sveltejs/kit';

export interface RequestUserIdResolverContext {
    request: Request;
    cookies: Cookies;
    stage: string;
    chatAppId?: string;
}

/**
 * Server-side hook called on message routes before the effective user id is used.
 * Return a non-undefined string to override; return undefined to leave requestedUserId unchanged.
 *
 * Param rename from v0.26.0: `effectiveUserId` → `requestedUserId` (the user id derived from the
 * authenticated session is what's being *requested* for use; the hook decides whether to honor it).
 */
export async function resolveRequestUserId(
    _requestedUserId: string,
    _sessionUserId: string,
    _context: RequestUserIdResolverContext
): Promise<string | undefined> {
    return undefined;
}
