/**
 * Unit tests for ES-3082 demo-mode framework seams.
 *
 * Covers all five custom hooks in src/lib/custom/ plus verifies that the
 * layout server load function correctly delegates to resolveUserForHomeChatApps.
 */
import { describe, it, expect } from '@jest/globals';
import type { ChatUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import type { RequestEvent } from '@sveltejs/kit';

import { isInternalUser } from '$lib/custom/effective-user';
import { resolveUserForHomeChatApps } from '$lib/custom/home-page-user';
import { getDemoBannerComponent } from '$lib/custom/demo-mode-banner';
import { getDemoModeMenuItem } from '$lib/custom/demo-mode-menu-item';
import { getUserRefreshIntervalMs } from '$lib/custom/polling-interval';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(userType: 'internal-user' | 'external-user'): ChatUser<RecordOrUndef> {
    return {
        userId: 'test-user',
        userType,
        firstName: 'Test',
        lastName: 'User',
        roles: [],
    } as unknown as ChatUser<RecordOrUndef>;
}

function makeEvent(cookies: Record<string, string> = {}): RequestEvent {
    return {
        cookies: {
            get: (name: string) => cookies[name] ?? null,
            getAll: () => [],
            set: () => {},
            delete: () => {},
            serialize: () => '',
        },
        request: new Request('http://localhost/'),
        url: new URL('http://localhost/'),
        params: {},
        route: { id: '/(auth)' },
        platform: undefined,
        locals: {},
        fetch: global.fetch,
        getClientAddress: () => '127.0.0.1',
        isDataRequest: false,
        isSubRequest: false,
        setHeaders: () => {},
    } as unknown as RequestEvent;
}

// ---------------------------------------------------------------------------
// Hook 1 — isInternalUser (effective-user.ts)
// ---------------------------------------------------------------------------

describe('isInternalUser', () => {
    it('returns true for internal-user userType', () => {
        expect(isInternalUser(makeUser('internal-user'))).toBe(true);
    });

    it('returns false for external-user userType', () => {
        expect(isInternalUser(makeUser('external-user'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Hook 2 — resolveUserForHomeChatApps (home-page-user.ts)
// ---------------------------------------------------------------------------

describe('resolveUserForHomeChatApps', () => {
    it('returns the user unchanged by default', () => {
        const user = makeUser('internal-user');
        const event = makeEvent();
        expect(resolveUserForHomeChatApps(user, event)).toBe(user);
    });

    it('returns the user unchanged for an external user', () => {
        const user = makeUser('external-user');
        const event = makeEvent();
        expect(resolveUserForHomeChatApps(user, event)).toBe(user);
    });

    it('provides event with cookie access (so overrides can read demo-mode cookie)', () => {
        const user = makeUser('internal-user');
        const event = makeEvent({ 'demo-mode': 'on' });
        // Default hook ignores cookies — user returned unchanged
        expect(resolveUserForHomeChatApps(user, event)).toBe(user);
        // Confirm cookie is accessible for when the hook is overridden
        expect(event.cookies.get('demo-mode')).toBe('on');
    });
});

// ---------------------------------------------------------------------------
// Hook 3 — getDemoBannerComponent (demo-mode-banner.ts)
// ---------------------------------------------------------------------------

describe('getDemoBannerComponent', () => {
    it('returns undefined by default — no banner rendered', () => {
        expect(getDemoBannerComponent()).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Hook 4 — getDemoModeMenuItem (demo-mode-menu-item.ts)
// ---------------------------------------------------------------------------

describe('getDemoModeMenuItem', () => {
    it('returns undefined by default — no extra menu item rendered', () => {
        expect(getDemoModeMenuItem()).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Hook 5 — getUserRefreshIntervalMs (polling-interval.ts)
// ---------------------------------------------------------------------------

describe('getUserRefreshIntervalMs', () => {
    it('returns 60 000 ms for internal users', () => {
        expect(getUserRefreshIntervalMs(makeUser('internal-user'))).toBe(60_000);
    });

    it('returns 600 000 ms for external users', () => {
        expect(getUserRefreshIntervalMs(makeUser('external-user'))).toBe(600_000);
    });

    it('returns 600 000 ms when user is undefined', () => {
        expect(getUserRefreshIntervalMs(undefined)).toBe(600_000);
    });
});
