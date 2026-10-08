<script lang="ts">
    import type { AssistantPrivacyNoticeFeature } from 'pika-shared/types/chatbot/chatbot-types';
    import { Input } from 'pika-ux/shadcn/input';
    import { Label } from 'pika-ux/shadcn/label';

    interface Props {
        overriddenFeature: AssistantPrivacyNoticeFeature | undefined;
        originalFeature: AssistantPrivacyNoticeFeature | undefined;
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

    // Shown only as the input's placeholder hint — the notice is opt-in, so when
    // enabled with no value nothing renders (no default is injected).
    const examplePlaceholder = 'Only you can see conversations with your assistant.';

    function ensureFeature(): AssistantPrivacyNoticeFeature {
        if (!isOverrideMode) {
            throw new Error('AssistantPrivacyNoticeFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'assistantPrivacyNotice',
                enabled: originalFeature?.enabled ?? false,
                assistantPrivacyNotice: undefined,
                ...originalFeature,
            } as AssistantPrivacyNoticeFeature;
        }

        return overriddenFeature;
    }

    function updateNotice(value: string) {
        if (!isOverrideMode) return;
        const feature = ensureFeature();
        feature.assistantPrivacyNotice = value;
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
        <Label for="privacy-notice-text">Privacy Notice</Label>
        <Input
            id="privacy-notice-text"
            bind:value={() => featureToShow?.assistantPrivacyNotice || '', updateNotice}
            placeholder={examplePlaceholder}
            disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
        />
    </div>

    {#if isOverridden && originalFeature}
        <div class="p-3 border border-info/20 bg-info-bg rounded text-sm text-info">
            <div class="font-medium mb-1">Original Settings:</div>
            <div class="space-y-1">
                <div>Notice: {originalFeature.assistantPrivacyNotice || 'No notice set'}</div>
            </div>
        </div>
    {/if}
</div>
