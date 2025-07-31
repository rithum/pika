<script lang="ts">
    import { Input } from '$ui/shadcn/input';
    import { Label } from '$ui/shadcn/label';
    import type { PromptInputFieldLabelFeature } from '@pika/shared/types/chatbot/chatbot-types';

    interface Props {
        overriddenFeature: PromptInputFieldLabelFeature | undefined;
        originalFeature: PromptInputFieldLabelFeature | undefined;
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

    const defaultLabel = 'Ready to chat';

    function ensureFeature(): PromptInputFieldLabelFeature {
        if (!isOverrideMode) {
            throw new Error('PromptInputFieldLabelFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'promptInputFieldLabel',
                enabled: originalFeature?.enabled ?? false,
                promptInputFieldLabel: undefined,
                ...originalFeature,
            } as PromptInputFieldLabelFeature;
        }

        return overriddenFeature;
    }

    function updateLabel(value: string) {
        if (!isOverrideMode) return;
        const feature = ensureFeature();
        feature.promptInputFieldLabel = value;
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
        <Label for="label-text">Prompt Input Label</Label>
        <Input
            id="label-text"
            bind:value={() => featureToShow?.promptInputFieldLabel || '', updateLabel}
            placeholder={defaultLabel}
            disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
        />
    </div>

    {#if isOverridden && originalFeature}
        <div class="p-3 border border-blue-200 bg-blue-50 rounded text-sm text-blue-800">
            <div class="font-medium mb-1">Original Settings:</div>
            <div class="space-y-1">
                <div>Label: {originalFeature.promptInputFieldLabel || 'No label set'}</div>
            </div>
        </div>
    {/if}
</div>
