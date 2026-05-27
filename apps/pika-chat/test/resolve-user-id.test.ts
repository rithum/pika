/**
 * Unit tests for $lib/server/resolve-user-id — the helper that wraps the consumer
 * resolveRequestUserId hook for both message routes. Verifies fail-closed/fail-open
 * asymmetry, throw safety, and that attacker-influenceable input is truncated before
 * being written to server logs.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Cookies } from '@sveltejs/kit';
import { resolveUserId } from '$lib/server/resolve-user-id';

jest.mock('$lib/custom/request-user-id-resolver', () => ({
    resolveRequestUserId: jest.fn(),
}));

// Re-import the mocked function with proper typing for control inside tests.
import { resolveRequestUserId } from '$lib/custom/request-user-id-resolver';
const mockResolver = resolveRequestUserId as jest.MockedFunction<typeof resolveRequestUserId>;

function makeCtx() {
    return {
        request: new Request('https://example.com/'),
        cookies: {} as Cookies,
        stage: 'test',
        chatAppId: 'chat-app-1',
    };
}

describe('resolveUserId', () => {
    let warnSpy: jest.SpiedFunction<typeof console.warn>;

    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        mockResolver.mockReset();
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    describe('fail-closed (POST behavior)', () => {
        it('returns the resolver result when non-undefined', async () => {
            mockResolver.mockResolvedValue('overridden-user');
            const result = await resolveUserId({
                requestedUserId: 'request-user',
                sessionUserId: 'session-user',
                ...makeCtx(),
                failOpen: false,
                routeLabel: 'POST /api/message',
            });
            expect(result).toBe('overridden-user');
        });

        it('throws 401 when the resolver returns undefined', async () => {
            mockResolver.mockResolvedValue(undefined);
            await expect(
                resolveUserId({
                    requestedUserId: 'request-user',
                    sessionUserId: 'session-user',
                    ...makeCtx(),
                    failOpen: false,
                    routeLabel: 'POST /api/message',
                })
            ).rejects.toMatchObject({ status: 401 });
        });

        it('throws 401 when the resolver throws (does not bubble the raw error)', async () => {
            mockResolver.mockRejectedValue(new Error('hook crashed'));
            await expect(
                resolveUserId({
                    requestedUserId: 'request-user',
                    sessionUserId: 'session-user',
                    ...makeCtx(),
                    failOpen: false,
                    routeLabel: 'POST /api/message',
                })
            ).rejects.toMatchObject({ status: 401 });
        });
    });

    describe('fail-open (GET behavior)', () => {
        it('returns the resolver result when non-undefined', async () => {
            mockResolver.mockResolvedValue('overridden-user');
            const result = await resolveUserId({
                requestedUserId: 'request-user',
                sessionUserId: 'session-user',
                ...makeCtx(),
                failOpen: true,
                routeLabel: 'GET',
            });
            expect(result).toBe('overridden-user');
        });

        it('returns sessionUserId when the resolver returns undefined', async () => {
            mockResolver.mockResolvedValue(undefined);
            const result = await resolveUserId({
                requestedUserId: 'request-user',
                sessionUserId: 'session-user',
                ...makeCtx(),
                failOpen: true,
                routeLabel: 'GET',
            });
            expect(result).toBe('session-user');
        });

        it('returns sessionUserId when the resolver throws (does not propagate)', async () => {
            mockResolver.mockRejectedValue(new Error('hook crashed'));
            const result = await resolveUserId({
                requestedUserId: 'request-user',
                sessionUserId: 'session-user',
                ...makeCtx(),
                failOpen: true,
                routeLabel: 'GET',
            });
            expect(result).toBe('session-user');
        });
    });

    describe('log safety', () => {
        it('truncates oversize requestedUserId before logging (attacker-influenceable input)', async () => {
            // 500-char attacker payload
            const hostile = 'A'.repeat(500);
            mockResolver.mockResolvedValue(undefined);
            await expect(
                resolveUserId({
                    requestedUserId: hostile,
                    sessionUserId: 'session-user',
                    ...makeCtx(),
                    failOpen: false,
                    routeLabel: 'POST /api/message',
                })
            ).rejects.toMatchObject({ status: 401 });

            expect(warnSpy).toHaveBeenCalled();
            const logCall = warnSpy.mock.calls[0];
            // Second arg is the structured object; requestedUserId field is truncated.
            const ctx = logCall[1] as { requestedUserId: string };
            expect(ctx.requestedUserId.length).toBeLessThan(hostile.length);
            expect(ctx.requestedUserId).toContain('truncated');
            expect(ctx.requestedUserId).toContain(`full length ${hostile.length}`);
        });

        it('does not truncate short requestedUserId', async () => {
            mockResolver.mockResolvedValue(undefined);
            await expect(
                resolveUserId({
                    requestedUserId: 'short-id',
                    sessionUserId: 'session-user',
                    ...makeCtx(),
                    failOpen: false,
                    routeLabel: 'POST /api/message',
                })
            ).rejects.toMatchObject({ status: 401 });

            const ctx = warnSpy.mock.calls[0][1] as { requestedUserId: string };
            expect(ctx.requestedUserId).toBe('short-id');
        });

        it('passes the full untruncated requestedUserId to the consumer hook (truncation is log-only)', async () => {
            const hostile = 'A'.repeat(500);
            mockResolver.mockResolvedValue('overridden-user');
            await resolveUserId({
                requestedUserId: hostile,
                sessionUserId: 'session-user',
                ...makeCtx(),
                failOpen: false,
                routeLabel: 'POST /api/message',
            });
            // First positional arg to the consumer hook is the full untruncated value.
            expect(mockResolver).toHaveBeenCalledWith(hostile, 'session-user', expect.anything());
        });
    });
});
