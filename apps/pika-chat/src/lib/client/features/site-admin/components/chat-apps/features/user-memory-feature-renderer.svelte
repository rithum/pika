<script lang="ts">
    import type { UserMemoryFeature } from 'pika-shared/types/chatbot/chatbot-types';
    import {
        DEFAULT_MAX_K_MATCHES_PER_STRATEGY,
        DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import { Input } from 'pika-ux/shadcn/input';
    import { Label } from 'pika-ux/shadcn/label';

    interface Props {
        featureEnabled: boolean;
        overriddenFeature: UserMemoryFeature | undefined;
        originalFeature: UserMemoryFeature | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        setValid?: (valid: boolean) => void;
        disabled: boolean;
    }

    let {
        overriddenFeature = $bindable(),
        originalFeature,
        isOverrideMode,
        isOverridden,
        setValid,
        featureEnabled,
        disabled,
    }: Props = $props();

    let validErrors = $derived.by(() => {
        const mode = isOverrideMode;
        const ovFeature = overriddenFeature;
        const orFeature = originalFeature;
        const feature = mode ? ovFeature : orFeature;

        const errors: string[] = [];

        if (feature && feature.enabled) {
            if (
                feature.maxMemoryRecordsPerPrompt !== undefined &&
                (feature.maxMemoryRecordsPerPrompt < 1 || feature.maxMemoryRecordsPerPrompt > 100)
            ) {
                errors.push('Max results per strategy must be between 1 and 100.');
            }
        }

        return errors;
    });

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    $effect(() => {
        if (isOverrideMode) {
            ensureFeature();
        } else {
            overriddenFeature = undefined;
        }
    });

    $effect(() => {
        if (setValid) {
            setValid(validErrors.length === 0);
        }
    });

    function ensureFeature(): UserMemoryFeature {
        if (!isOverrideMode) {
            throw new Error('UserMemoryFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'userMemory',
                enabled: originalFeature?.enabled ?? false,
                maxMemoryRecordsPerPrompt: originalFeature?.maxMemoryRecordsPerPrompt,
                ...originalFeature,
            } as UserMemoryFeature;
        }

        return overriddenFeature;
    }

    function updateMaxResults(value: string) {
        const f = ensureFeature();
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 1 && num <= 100) {
            f.maxMemoryRecordsPerPrompt = num;
        } else if (value === '') {
            f.maxMemoryRecordsPerPrompt = DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT; // Reset to default
        }
    }

    function updateMaxKMatchesPerStrategy(value: string) {
        const f = ensureFeature();
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 1 && num <= 100) {
            f.maxKMatchesPerStrategy = num;
        } else if (value === '') {
            f.maxKMatchesPerStrategy = DEFAULT_MAX_K_MATCHES_PER_STRATEGY; // Reset to default
        }
    }
</script>

<div class="space-y-4">
    <div>
        {#if validErrors.length > 0}
            <div class="p-3 border border-red-200 bg-red-50 rounded text-sm text-red-800 mb-4">
                {#each validErrors as error}
                    <div>{error}</div>
                {/each}
            </div>
        {/if}

        <!-- Max Memory Records Per Prompt -->
        <div>
            <div class="flex items-center gap-2 mb-2">
                <Label for="maxResults">Max Results Per Strategy</Label>
                <PopupHelp popoverClasses="max-w-[300px]">
                    <div class="text-xs text-muted-foreground">
                        <p>The maximum number of memory results to augment a single prompt with.</p>
                        <p>Higher values provide more context but may increase token usage. default: 25</p>
                    </div>
                </PopupHelp>
            </div>
            <Input
                id="maxResults"
                type="number"
                min="1"
                max="100"
                value={featureToShow?.maxMemoryRecordsPerPrompt ?? DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT}
                oninput={(e) => updateMaxResults(e.currentTarget.value)}
                disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
                class="w-32"
                placeholder="10"
            />
        </div>

        <!-- Max Top K Matches Per Strategy -->
        <div>
            <div class="flex items-center gap-2 mb-2">
                <Label for="maxKMatchesPerStrategy">Max Top K Matches Per Strategy</Label>
                <PopupHelp popoverClasses="max-w-[300px]">
                    <div class="text-xs text-muted-foreground">
                        <p>The maximum number of top matches to consider per strategy when augmenting prompts.</p>
                        <p>Higher values provide more context but may increase token usage. default: 5</p>
                    </div>
                </PopupHelp>
            </div>
            <Input
                id="maxKMatchesPerStrategy"
                type="number"
                min="1"
                max="100"
                value={featureToShow?.maxKMatchesPerStrategy ?? DEFAULT_MAX_K_MATCHES_PER_STRATEGY}
                oninput={(e) => updateMaxKMatchesPerStrategy(e.currentTarget.value)}
                disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
                class="w-32"
                placeholder="10"
            />
        </div>
    </div>

    {#if isOverridden && originalFeature}
        <div class="p-3 border border-blue-200 bg-blue-50 rounded text-sm text-blue-800">
            <div class="font-medium mb-1">Original Settings:</div>
            <div class="space-y-1">
                <div>
                    Max Results: {originalFeature.maxMemoryRecordsPerPrompt ?? DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT}
                </div>
                <div>
                    Max Top K Matches Per Strategy: {originalFeature.maxKMatchesPerStrategy ??
                        DEFAULT_MAX_K_MATCHES_PER_STRATEGY}
                </div>
            </div>
        </div>
    {/if}
</div>
