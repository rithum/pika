/** Guards the features.svelte "Disable via override" action that resolves a feature enabled on the chat app but not allowed by the site. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Features from '../../src/lib/client/features/site-admin/components/chat-apps/features/features.svelte';
import type { ChatApp } from 'pika-shared/types/chatbot/chatbot-types';

vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/agent-instruction-assistance-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/assistant-privacy-notice-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/chat-disclaimer-notice-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/entity-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/file-upload-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/instruction-augmentation-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/intent-router-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/logout-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/prompt-input-field-label-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/prompt-input-field-placeholder-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/session-insights-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/suggestions-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/tags-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/traces-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/ui-customization-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/user-memory-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));
vi.mock('../../src/lib/client/features/site-admin/components/chat-apps/features/verify-response-feature-renderer.svelte', () => import('../__mocks__/noop.svelte'));

function makeChatApp(override?: ChatApp['override']): ChatApp {
    return {
        chatAppId: 'app-1',
        title: 'App',
        agentId: 'agent-1',
        enabled: true,
        features: { suggestions: { featureId: 'suggestions', enabled: true, suggestions: ['x'] } },
        override
    } as unknown as ChatApp;
}

function mount(chatApp: ChatApp, onEnterOverrideMode: () => void, disabled = false) {
    const appState = { siteAdmin: { siteFeatures: { suggestions: { enabled: false } } } };
    return render(Features, {
        props: {
            chatApp,
            chatAppOriginal: makeChatApp(),
            agent: undefined,
            isOverrideMode: false,
            featuresExpanded: true,
            onToggleFeaturesSection: vi.fn(),
            chatAppId: 'app-1',
            setValid: vi.fn(),
            disabled,
            onEnterOverrideMode
        },
        context: new Map([['appState', appState]])
    });
}

describe('features.svelte Disable via override', () => {
    it('shows the button for a feature enabled on the app but disabled at the site', () => {
        mount(makeChatApp(), vi.fn());
        expect(screen.getByRole('button', { name: 'Disable via override' })).toBeInTheDocument();
    });

    it('enters override mode when no override exists and writes enabled:false', async () => {
        const chatApp = makeChatApp();
        const onEnterOverrideMode = vi.fn(() => {
            chatApp.override = { features: {} } as ChatApp['override'];
        });
        mount(chatApp, onEnterOverrideMode);
        await fireEvent.click(screen.getByRole('button', { name: 'Disable via override' }));
        expect(onEnterOverrideMode).toHaveBeenCalledTimes(1);
        expect(chatApp.override?.features?.suggestions?.enabled).toBe(false);
    });

    it('does not enter override mode again when an override already exists', async () => {
        const chatApp = makeChatApp({ features: {} } as ChatApp['override']);
        const onEnterOverrideMode = vi.fn();
        mount(chatApp, onEnterOverrideMode);
        await fireEvent.click(screen.getByRole('button', { name: 'Disable via override' }));
        expect(onEnterOverrideMode).not.toHaveBeenCalled();
        expect(chatApp.override?.features?.suggestions?.enabled).toBe(false);
    });
});
