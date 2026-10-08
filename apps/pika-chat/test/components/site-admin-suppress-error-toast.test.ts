/** Guards sendSiteAdminCommand's suppressErrorToast flag: still throws, but only the default path shows the error toast. */
import { describe, it, expect, vi } from 'vitest';
import { SiteAdminState } from '../../src/lib/client/features/site-admin/site-admin.state.svelte';
import type { AppState } from '../../src/lib/client/app/app.state.svelte';
import type { IdentityState } from '../../src/lib/client/app/identity/identity.state.svelte';
import type { ComponentRegistry } from '../../src/lib/client/features/chat/message-segments/component-registry';
import type { SiteAdminRequest, SiteFeatures } from 'pika-shared/types/chatbot/chatbot-types';
import type { Page } from '@sveltejs/kit';

vi.hoisted(() => {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

const request = { command: 'clearConverseLambdaCache' } as SiteAdminRequest;

function makeState() {
    const showToast = vi.fn();
    const fetchz = vi.fn(async () => new Response('{}', { status: 500 }));
    const state = new SiteAdminState(
        fetchz,
        {} as AppState,
        [],
        {} as SiteFeatures,
        { url: new URL('http://localhost/site-admin'), params: {}, route: { id: null }, status: 200, error: null, data: {}, state: {}, form: null } as unknown as Page,
        {} as ComponentRegistry,
        {} as IdentityState,
        showToast
    );
    return { state, showToast };
}

describe('sendSiteAdminCommand suppressErrorToast', () => {
    it('throws without calling the toast function when suppressErrorToast is true', async () => {
        const { state, showToast } = makeState();
        await expect(state.sendSiteAdminCommand(request, true)).rejects.toThrow();
        expect(showToast).not.toHaveBeenCalled();
    });

    it('calls the toast function with an error when suppressErrorToast is omitted', async () => {
        const { state, showToast } = makeState();
        await expect(state.sendSiteAdminCommand(request)).rejects.toThrow();
        expect(showToast).toHaveBeenCalledTimes(1);
        expect(showToast).toHaveBeenCalledWith(expect.any(String), { type: 'error' });
    });
});
