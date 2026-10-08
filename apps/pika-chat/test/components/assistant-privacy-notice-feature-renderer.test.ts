/** Guards the AssistantPrivacyNotice admin renderer: shows the original value, writes edits to the override, and locks outside override mode. */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Renderer from '../../src/lib/client/features/site-admin/components/chat-apps/features/assistant-privacy-notice-feature-renderer.svelte';
import type { AssistantPrivacyNoticeFeature } from 'pika-shared/types/chatbot/chatbot-types';

const originalFeature = { featureId: 'assistantPrivacyNotice', enabled: true, assistantPrivacyNotice: 'original value' } as AssistantPrivacyNoticeFeature;

const baseProps = {
    originalFeature,
    isOverrideMode: true,
    isOverridden: false,
    chatAppId: 'app-1',
    featureEnabled: true,
    disabled: false
};

describe('AssistantPrivacyNotice renderer', () => {
    it('shows the original value in override mode', async () => {
        render(Renderer, { ...baseProps, overriddenFeature: undefined });
        expect(await screen.findByLabelText('Privacy Notice')).toHaveValue('original value');
    });

    it('writes edits to the bound overriddenFeature', async () => {
        const overriddenFeature = { ...originalFeature } as AssistantPrivacyNoticeFeature;
        render(Renderer, { ...baseProps, overriddenFeature });
        await fireEvent.input(screen.getByLabelText('Privacy Notice'), { target: { value: 'edited' } });
        expect(overriddenFeature.assistantPrivacyNotice).toBe('edited');
    });

    it('disables the input when not in override mode', () => {
        render(Renderer, { ...baseProps, isOverrideMode: false, overriddenFeature: undefined });
        expect(screen.getByLabelText('Privacy Notice')).toBeDisabled();
    });
});
