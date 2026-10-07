<script lang="ts">
    import type { PromptInputFieldPlaceholderFeature } from 'pika-shared/types/chatbot/chatbot-types';
    import { Input } from 'pika-ux/shadcn/input';
    import { Label } from 'pika-ux/shadcn/label';

    interface Props {
        overriddenFeature: PromptInputFieldPlaceholderFeature | undefined;
        originalFeature: PromptInputFieldPlaceholderFeature | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        chatAppId: string;
        featureEnabled: boolean;
        disabled: boolean;
    }

    let {
        overriddenFeature = $bindable(),
        originalFeature,
        isOverrideMode,
        isOverridden,
        chatAppId,
        featureEnabled,
        disabled,
    }: Props = $props();

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    const defaultPlaceholder = 'Ask me a question';

    function ensureFeature(): PromptInputFieldPlaceholderFeature {
        if (!isOverrideMode) {
            throw new Error('PromptInputFieldPlaceholderFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'promptInputFieldPlaceholder',
                enabled: originalFeature?.enabled ?? false,
                promptInputFieldPlaceholder: undefined,
                ...originalFeature,
            } as PromptInputFieldPlaceholderFeature;
        }

        return overriddenFeature;
    }

    function updatePlaceholder(value: string) {
        if (!isOverrideMode) return;
        const feature = ensureFeature();
        feature.promptInputFieldPlaceholder = value;
    }

    $effect(() => {
        if (isOverrideMode) {
            ensureFeature();
        } else {
            overriddenFeature = undefined;
        }
    });
</script>

<div class="space-y-4">
    <div>
        <Label for="placeholder-text">Prompt Input Placeholder</Label>
        <Input
            id="placeholder-text"
            bind:value={() => featureToShow?.promptInputFieldPlaceholder || '', updatePlaceholder}
            placeholder={defaultPlaceholder}
            disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
        />
    </div>

    {#if isOverridden && originalFeature}
        <div class="p-3 border border-info/20 bg-info-bg rounded text-sm text-info">
            <div class="font-medium mb-1">Original Settings:</div>
            <div class="space-y-1">
                <div>Placeholder: {originalFeature.promptInputFieldPlaceholder || 'No placeholder set'}</div>
            </div>
        </div>
    {/if}
</div>
