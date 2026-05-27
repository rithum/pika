import type { Cookies } from '@sveltejs/kit';

export interface RequestUserIdResolverContext {
    request: Request;
    cookies: Cookies;
    stage: string;
    chatAppId?: string;
}

/**
 * Server-side hook called on message routes before the effective user id is used.
 *
 * Arguments:
 *  - `requestedUserId`: the user id supplied by the **request** (URL param on POST, `?legacyUserId=`
 *    query on GET). This is attacker-influenceable — treat it as untrusted input.
 *  - `sessionUserId`: the user id derived from the authenticated session cookie. This is the
 *    trusted identity that the framework already verified.
 *  - `context`: request/cookies/stage/chatAppId for the hook's own validation logic.
 *
 * Return semantics:
 *  - Non-undefined string → the framework uses this id as the effective user id for the request.
 *  - `undefined` → on POST routes the framework returns 401 (the requested override was denied).
 *    On the GET messages route the framework silently falls back to `sessionUserId` (the caller
 *    sees their own messages); this asymmetry is intentional because GET fallback yields the
 *    caller's own data, not another user's.
 *
 * Migration note: in v0.26.0 the corresponding hook was called with `(sessionUserId, requestedUserId, ctx)`.
 * v0.27.0 swaps the arg order so the request-supplied (untrusted) id comes first. If you ported a
 * v0.26.0 override, re-read its body to confirm it still validates the right input.
 */
export async function resolveRequestUserId(
    _requestedUserId: string,
    _sessionUserId: string,
    _context: RequestUserIdResolverContext
): Promise<string | undefined> {
    return undefined;
}
