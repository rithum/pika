import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { ChatApp } from 'pika-shared/types/chatbot/chatbot-types';
import { resolveAccessControlConfig } from '../../src/lib/client/features/site-admin/components/chat-apps/access-control/access-control-config';
import WhoCanAccessBuilder from '../../src/lib/client/features/site-admin/components/chat-apps/access-control/who-can-access-builder.svelte';

vi.mock('pika-ux/shadcn/button', () => import('../../../../packages/pika-ux/src/shadcn/button/index.ts'));

function makeChatApp(): ChatApp {
    return { chatAppId: 'example-app', override: { enabled: true } } as unknown as ChatApp;
}

function mount(accessControlConfig = resolveAccessControlConfig(undefined)) {
    const chatApp = makeChatApp();
    render(WhoCanAccessBuilder, {
        chatApp,
        chatAppOriginal: makeChatApp(),
        isOverrideMode: true,
        accessControlConfig,
        entitySingular: 'account ID'
    });
    return chatApp;
}

async function addAccount(value: string) {
    await fireEvent.input(screen.getByPlaceholderText('Enter account ID'), { target: { value } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
}

describe('WhoCanAccessBuilder account ID validation', () => {
    it('rejects a value that does not match the configured pattern and accepts one that does', async () => {
        const config = resolveAccessControlConfig({ accountIdPattern: '[0-9]{9}', accountIdPatternDescription: '9 digits' });
        const chatApp = mount(config);

        await addAccount('1234567890');
        expect(screen.getByText('Invalid account ID: must match the expected format (9 digits).')).toBeTruthy();
        expect(chatApp.override?.additionalExternalAccessControl).toBeUndefined();

        await addAccount('000000001');
        expect(screen.queryByText(/Invalid account ID/)).toBeNull();
        expect(chatApp.override?.additionalExternalAccessControl).toEqual(['000000001']);
    });

    it('accepts any non-empty value when no pattern is configured', async () => {
        const chatApp = mount();

        await addAccount('anything-goes');
        expect(screen.queryByText(/Invalid/)).toBeNull();
        expect(chatApp.override?.additionalExternalAccessControl).toEqual(['anything-goes']);
    });

    it('shows the configured internal users label', () => {
        mount(resolveAccessControlConfig({ internalUsersLabel: 'All internal staff' }));
        expect(screen.getByText('All internal staff')).toBeTruthy();
    });
});
