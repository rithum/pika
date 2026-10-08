/** Guards the suppressErrorToast flag on ChatAppState's admin commands: still throws, but only the default path shows the error toast. */
import { describe, it, expect, vi } from 'vitest';
import { ChatAppState } from '../../src/lib/client/features/chat/chat-app.state.svelte';
import type { AppState } from '../../src/lib/client/app/app.state.svelte';
import type { ComponentRegistry } from '../../src/lib/client/features/chat/message-segments/component-registry';
import type { ChatApp, ChatAppOverridableFeatures, ContentAdminRequest, UserOverrideDataCommandRequest } from 'pika-shared/types/chatbot/chatbot-types';
import type { Page } from '@sveltejs/kit';
import type { Component } from 'svelte';

vi.hoisted(() => {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

const contentAdminRequest = { command: 'getValuesForAutoComplete' } as ContentAdminRequest;
const userOverrideRequest = { command: 'getInitialDialogData' } as UserOverrideDataCommandRequest;

function makeState() {
    const showToast = vi.fn();
    const fetchz = vi.fn(async () => new Response('{}', { status: 500 }));
    const state = new ChatAppState(
        fetchz,
        { chatAppId: 'app-1', title: 'App', agentId: 'agent-1', enabled: true } as unknown as ChatApp,
        { url: new URL('http://localhost/chat/app-1'), params: {} } as unknown as Page,
        { identity: { user: { userId: 'u1' } } } as unknown as AppState,
        { registerRenderer() {} } as unknown as ComponentRegistry,
        { userNeedsToProvideDataOverrides: false } as never,
        false,
        {} as ChatAppOverridableFeatures,
        undefined,
        'standalone',
        [],
        showToast,
        (() => {}) as unknown as Component<never>,
        undefined,
        undefined
    );
    return { state, showToast };
}

describe.each([
    ['sendContentAdminCommand', (s: ChatAppState, suppress?: boolean) => s.sendContentAdminCommand(contentAdminRequest, suppress)],
    ['sendUserOverrideDataCommand', (s: ChatAppState, suppress?: boolean) => s.sendUserOverrideDataCommand(userOverrideRequest, suppress)]
])('%s suppressErrorToast', (_name, send) => {
    it('throws without calling the toast function when suppressErrorToast is true', async () => {
        const { state, showToast } = makeState();
        await expect(send(state, true)).rejects.toThrow();
        expect(showToast).not.toHaveBeenCalled();
    });

    it('calls the toast function when suppressErrorToast is omitted', async () => {
        const { state, showToast } = makeState();
        await expect(send(state)).rejects.toThrow();
        expect(showToast).toHaveBeenCalled();
    });
});
