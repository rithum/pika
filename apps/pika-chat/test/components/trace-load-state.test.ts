import { describe, it, expect, vi } from 'vitest';
import { ChatAppState } from '../../src/lib/client/features/chat/chat-app.state.svelte';
import type { AppState } from '../../src/lib/client/app/app.state.svelte';
import type { ComponentRegistry } from '../../src/lib/client/features/chat/message-segments/component-registry';
import type { ChatApp, ChatAppOverridableFeatures, ChatMessageForRendering } from 'pika-shared/types/chatbot/chatbot-types';
import type { Page } from '@sveltejs/kit';
import type { Component } from 'svelte';

vi.hoisted(() => {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

const TRACES = [{ traceId: 't1' }, { traceId: 't2' }];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function makeState(fetchz: ReturnType<typeof vi.fn>) {
    const showToast = vi.fn();
    const state = new ChatAppState(
        fetchz as never,
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

function makeMessage(hasOffloadedTraces = true) {
    return { messageId: 's1:1', sessionId: 's1', hasOffloadedTraces, segments: [] } as unknown as ChatMessageForRendering;
}

describe('ChatAppState trace loading', () => {
    it('loads traces and keeps hasOffloadedTraces', async () => {
        const fetchz = vi.fn(async () => json({ traces: TRACES }));
        const { state } = makeState(fetchz);
        const message = makeMessage();
        await state.loadTracesForMessage(message);
        expect(state.getTraceLoadState('s1:1').status).toBe('loaded');
        expect(state.getLoadedTraces('s1:1')).toHaveLength(2);
        expect(message.traces).toBeUndefined();
        expect(fetchz).toHaveBeenCalledWith('/api/trace/app-1/s1/s1%3A1');
        expect(message.hasOffloadedTraces).toBe(true);
    });

    it('treats an empty traces array as empty', async () => {
        const { state } = makeState(vi.fn(async () => json({ traces: [] })));
        const message = makeMessage();
        await state.loadTracesForMessage(message);
        expect(state.getTraceLoadState('s1:1').status).toBe('empty');
        expect(message.hasOffloadedTraces).toBe(true);
    });

    it('sets error on a 500 without a toast', async () => {
        const { state, showToast } = makeState(vi.fn(async () => json({}, 500)));
        await state.loadTracesForMessage(makeMessage());
        expect(state.getTraceLoadState('s1:1').status).toBe('error');
        expect(showToast).not.toHaveBeenCalled();
    });

    it('treats a 403 as empty', async () => {
        const { state } = makeState(vi.fn(async () => json({}, 403)));
        await state.loadTracesForMessage(makeMessage());
        expect(state.getTraceLoadState('s1:1').status).toBe('empty');
    });

    it('sets error when fetch rejects without a toast', async () => {
        const { state, showToast } = makeState(vi.fn(async () => Promise.reject(new Error('network down'))));
        await state.loadTracesForMessage(makeMessage());
        expect(state.getTraceLoadState('s1:1')).toEqual({ status: 'error', error: 'network down' });
        expect(showToast).not.toHaveBeenCalled();
    });

    it('fetches once when called twice before the first resolves', async () => {
        const fetchz = vi.fn(async () => json({ traces: TRACES }));
        const { state } = makeState(fetchz);
        const message = makeMessage();
        await Promise.all([state.loadTracesForMessage(message), state.loadTracesForMessage(message)]);
        expect(fetchz).toHaveBeenCalledTimes(1);
    });

    it('does not refetch after an error', async () => {
        const fetchz = vi.fn(async () => json({}, 500));
        const { state } = makeState(fetchz);
        const message = makeMessage();
        await state.loadTracesForMessage(message);
        await state.loadTracesForMessage(message);
        expect(fetchz).toHaveBeenCalledTimes(1);
    });

    it('retryTraceLoad refetches after an error', async () => {
        const fetchz = vi.fn().mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json({ traces: TRACES }));
        const { state } = makeState(fetchz);
        const message = makeMessage();
        await state.loadTracesForMessage(message);
        await state.retryTraceLoad(message);
        expect(fetchz).toHaveBeenCalledTimes(2);
        expect(state.getTraceLoadState('s1:1').status).toBe('loaded');
    });

    it('retryTraceLoad does nothing when the state is not error', async () => {
        const fetchz = vi.fn(async () => json({ traces: TRACES }));
        const { state } = makeState(fetchz);
        await state.retryTraceLoad(makeMessage());
        expect(fetchz).not.toHaveBeenCalled();
    });

    it('does not fetch when hasOffloadedTraces is false', async () => {
        const fetchz = vi.fn(async () => json({ traces: TRACES }));
        const { state } = makeState(fetchz);
        await state.loadTracesForMessage(makeMessage(false));
        expect(fetchz).not.toHaveBeenCalled();
        expect(state.getTraceLoadState('s1:1').status).toBe('idle');
    });

    it('sets error when the body has no traces array', async () => {
        const { state } = makeState(vi.fn(async () => json({})));
        await state.loadTracesForMessage(makeMessage());
        expect(state.getTraceLoadState('s1:1').status).toBe('error');
    });

    it('keeps loaded traces after the message object is replaced, without refetching', async () => {
        const fetchz = vi.fn(async () => json({ traces: TRACES }));
        const { state } = makeState(fetchz);
        const message = makeMessage();
        await state.loadTracesForMessage(message);
        const replaced = { ...message, traces: undefined } as ChatMessageForRendering;
        await state.loadTracesForMessage(replaced);
        expect(state.getLoadedTraces(replaced.messageId)).toEqual(TRACES);
        expect(fetchz).toHaveBeenCalledTimes(1);
    });

    it('makes traces available for a replacement message when the fetch resolves mid-refresh', async () => {
        let resolve!: (r: Response) => void;
        const fetchz = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
        const { state } = makeState(fetchz);
        const message = makeMessage();
        const pending = state.loadTracesForMessage(message);
        const replaced = { ...message } as ChatMessageForRendering;
        expect(state.getTraceLoadState(replaced.messageId).status).toBe('loading');
        resolve(json({ traces: TRACES }));
        await pending;
        expect(state.getTraceLoadState(replaced.messageId).status).toBe('loaded');
        expect(state.getLoadedTraces(replaced.messageId)).toEqual(TRACES);
        expect(replaced.traces).toBeUndefined();
    });

    it('returns undefined from getLoadedTraces before any load', () => {
        const { state } = makeState(vi.fn());
        expect(state.getLoadedTraces('s1:1')).toBeUndefined();
    });

    it('clears load states and loaded traces on a session switch', async () => {
        const fetchz = vi.fn(async (url: string, init?: RequestInit) => {
            if (url.startsWith('/api/trace/')) return json({ traces: TRACES });
            if (url === '/api/session/share/access') {
                return json({
                    success: true,
                    hasAccess: true,
                    sessionData: { sessionId: 's2', userId: 'someone-else', shareId: 'sh1', title: 't' },
                });
            }
            return json({});
        });
        const { state } = makeState(fetchz as never);
        await state.loadTracesForMessage(makeMessage());
        expect(state.getLoadedTraces('s1:1')).toEqual(TRACES);

        await state.loadSharedSession('sh1');

        expect(state.currentSession?.sessionId).toBe('s2');
        expect(state.getLoadedTraces('s1:1')).toBeUndefined();
        expect(state.getTraceLoadState('s1:1').status).toBe('idle');
    });
});
