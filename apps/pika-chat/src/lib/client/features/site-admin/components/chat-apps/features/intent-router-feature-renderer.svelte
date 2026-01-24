<script lang="ts">
    import type { IntentRouterFeature, IntentRouterFeatureForChatApp } from 'pika-shared/types/chatbot/chatbot-types';
    import { Input } from 'pika-ux/shadcn/input';
    import { Label } from 'pika-ux/shadcn/label';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';

    interface Props {
        featureEnabled: boolean;
        overriddenFeature: IntentRouterFeatureForChatApp | undefined;
        originalFeature: IntentRouterFeature | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        disabled?: boolean;
        setValid?: (valid: boolean) => void;
    }

    let {
        featureEnabled,
        overriddenFeature = $bindable(),
        originalFeature,
        isOverrideMode,
        isOverridden,
        disabled = false,
        setValid,
    }: Props = $props();

    // Get effective values
    const effectiveThreshold = $derived(
        overriddenFeature?.confidenceThreshold ?? originalFeature?.confidenceThreshold ?? 0.85
    );

    function handleThresholdChange(e: Event) {
        const input = e.target as HTMLInputElement;
        const value = parseFloat(input.value);

        if (!isOverrideMode) return;

        // Validate the value is a number between 0 and 1
        if (isNaN(value) || value < 0 || value > 1) {
            console.warn('[IntentRouterFeatureRenderer] Invalid confidence threshold:', input.value);
            return;
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'intentRouter',
                enabled: featureEnabled,
                confidenceThreshold: value,
            };
        } else {
            overriddenFeature = {
                ...overriddenFeature,
                confidenceThreshold: value,
            };
        }
    }
</script>

<div class="space-y-4">
    <div class="text-sm text-muted-foreground mb-4">
        <p>
            The Intent Router intercepts user messages and routes them to widgets using fast LLM classification.
            Commands are defined on tag definitions.
        </p>
    </div>

    <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
            <div class="flex items-center gap-1">
                <Label for="confidence-threshold">Confidence Threshold</Label>
                <PopupHelp popoverClasses="max-w-[400px]">
                    <p class="text-xs text-muted-foreground">
                        Minimum confidence required for a command to match (0.0 to 1.0). Higher values require more
                        certainty before routing to a command. Default is 0.85.
                    </p>
                </PopupHelp>
            </div>
            <Input
                id="confidence-threshold"
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={effectiveThreshold}
                onchange={handleThresholdChange}
                disabled={!isOverrideMode || !featureEnabled || disabled}
                class={isOverridden && overriddenFeature?.confidenceThreshold !== undefined ? 'border-warning' : ''}
            />
        </div>
    </div>

    {#if featureEnabled}
        <div class="mt-4 p-3 bg-muted/50 rounded-lg">
            <p class="text-xs text-muted-foreground">
                <strong>To configure commands:</strong> Add <code>intentRouterCommands</code> to your tag definitions. Each
                command specifies examples, priority, and how to execute when matched. See the Intent Router documentation
                for details.
            </p>
        </div>
    {/if}
</div>
