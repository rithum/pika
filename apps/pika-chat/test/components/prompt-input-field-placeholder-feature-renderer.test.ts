/** Guards the PromptInputFieldPlaceholder admin renderer: shows the original value, writes edits to the override, and locks outside override mode. */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Renderer from '../../src/lib/client/features/site-admin/components/chat-apps/features/prompt-input-field-placeholder-feature-renderer.svelte';
import type { PromptInputFieldPlaceholderFeature } from 'pika-shared/types/chatbot/chatbot-types';

const originalFeature = { featureId: 'promptInputFieldPlaceholder', enabled: true, promptInputFieldPlaceholder: 'original value' } as PromptInputFieldPlaceholderFeature;

const baseProps = {
    originalFeature,
    isOverrideMode: true,
    isOverridden: false,
    chatAppId: 'app-1',
    featureEnabled: true,
    disabled: false
};

describe('PromptInputFieldPlaceholder renderer', () => {
    it('shows the original value in override mode', async () => {
        render(Renderer, { ...baseProps, overriddenFeature: undefined });
        expect(await screen.findByLabelText('Prompt Input Placeholder')).toHaveValue('original value');
    });

    it('writes edits to the bound overriddenFeature', async () => {
        const overriddenFeature = { ...originalFeature } as PromptInputFieldPlaceholderFeature;
        render(Renderer, { ...baseProps, overriddenFeature });
        await fireEvent.input(screen.getByLabelText('Prompt Input Placeholder'), { target: { value: 'edited' } });
        expect(overriddenFeature.promptInputFieldPlaceholder).toBe('edited');
    });

    it('disables the input when not in override mode', () => {
        render(Renderer, { ...baseProps, isOverrideMode: false, overriddenFeature: undefined });
        expect(screen.getByLabelText('Prompt Input Placeholder')).toBeDisabled();
    });
});
