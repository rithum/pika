import type { Cookies } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { resolveRequestUserId } from '$lib/custom/request-user-id-resolver';

/**
 * Max length applied to attacker-influenceable identifiers before they're written to server
 * logs. Caps log-injection / oversize-payload blast radius if a caller crafts a hostile
 * userId. The truncation is for logging only — the full value is still passed to the consumer
 * resolver hook so consumer-side validation operates on the real input.
 */
const LOG_VALUE_MAX_LEN = 128;

function safeForLog(value: string): string {
    if (value.length <= LOG_VALUE_MAX_LEN) return value;
    return `${value.slice(0, LOG_VALUE_MAX_LEN)}…[truncated, full length ${value.length}]`;
}

/**
 * Server-side wrapper around the `resolveRequestUserId` consumer hook.
 *
 * Encapsulates the throw-safety, undefined-handling, and observability logging that both message
 * routes need, and makes the fail-closed (POST) vs fail-open (GET) asymmetry explicit at one call
 * site. The hook itself is consumer-authored; this helper ensures a misbehaving consumer hook can
 * never bubble a raw exception into the generic API error handler.
 */
export interface ResolveUserIdArgs {
    /**
     * The user id supplied by the request — URL `params.userId` on POST, `?legacyUserId` /
     * `?requestedUserId` query on GET. **Attacker-influenceable.**
     */
    requestedUserId: string;
    /** The user id derived from the authenticated session cookie. **Trusted.** */
    sessionUserId: string;
    /** Hook context fields passed through to the consumer override. */
    request: Request;
    cookies: Cookies;
    stage: string;
    chatAppId?: string;
    /**
     * Behavior when the consumer hook returns `undefined` or throws:
     *  - `false` (default): fail closed. Throw `error(401)`. Use on POST routes where the
     *    request was attempting to act *as* another user.
     *  - `true`: fail open. Return `sessionUserId` so the caller sees their own data. Use on
     *    GET routes where the override is opportunistic; denying it should not be a hard 401
     *    because the fallback yields the caller's *own* legitimate data, not another user's.
     */
    failOpen?: boolean;
    /** Short path label included in observability warnings ([Message Auth] log context). */
    routeLabel: string;
}

export async function resolveUserId(args: ResolveUserIdArgs): Promise<string> {
    const { requestedUserId, sessionUserId, request, cookies, stage, chatAppId, failOpen = false, routeLabel } = args;

    let resolved: string | undefined;
    try {
        resolved = await resolveRequestUserId(requestedUserId, sessionUserId, {
            request,
            cookies,
            stage,
            chatAppId,
        });
    } catch (e) {
        const action = failOpen ? 'falling back to session user' : 'failing closed';
        console.warn(`[Message Auth] resolveRequestUserId threw — ${action}`, {
            path: routeLabel,
            chatAppId,
            requestedUserId: safeForLog(requestedUserId),
            sessionUserId,
            error: e instanceof Error ? e.message : String(e),
        });
        if (failOpen) return sessionUserId;
        throw error(401, 'Unauthorized');
    }

    if (!resolved) {
        const action = failOpen ? 'falling back to session user' : 'denying';
        console.warn(`[Message Auth] resolveRequestUserId returned undefined — ${action}`, {
            path: routeLabel,
            chatAppId,
            requestedUserId: safeForLog(requestedUserId),
            sessionUserId,
        });
        if (failOpen) return sessionUserId;
        throw error(401, 'Unauthorized');
    }

    return resolved;
}
