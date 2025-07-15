<script lang="ts">
    import List from '$lib/components/ui-pika/list/list.svelte';
    import { Button } from '$lib/components/ui/button';
    import { Label } from '$lib/components/ui/label';
    import type { FileUploadFeature } from '@pika/shared/types/chatbot/chatbot-types';

    interface Props {
        overriddenFeature: FileUploadFeature | undefined;
        originalFeature: FileUploadFeature | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        setValid: (valid: boolean) => void;
    }

    let { overriddenFeature = $bindable(), originalFeature, isOverrideMode, isOverridden, setValid }: Props = $props();
    let validErrors = $derived.by(() => {
        const mode = isOverrideMode;
        const ovFeature = overriddenFeature;
        const orFeature = originalFeature;
        const feature = mode ? ovFeature : orFeature;

        if (feature && feature.enabled && (!feature.mimeTypesAllowed || feature.mimeTypesAllowed.length === 0)) {
            return ['No MIME types configured.  Correct this or disable feature.'];
        }

        return [];
    });

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    // Common MIME type presets
    const commonMimeTypes = [
        { value: 'text/csv', label: 'CSV Files' },
        { value: 'application/pdf', label: 'PDF Files' },
        { value: 'text/plain', label: 'Text Files' },
        { value: 'application/json', label: 'JSON Files' },
        { value: 'image/*', label: 'All Images' },
        { value: 'text/*', label: 'All Text Files' },
        { value: '*', label: 'All Files' },
    ];

    $effect(() => {
        if (isOverrideMode) {
            ensureFeature();
        } else {
            overriddenFeature = undefined;
        }
    });

    $effect(() => {
        setValid(validErrors.length === 0);
    });

    function ensureFeature(): FileUploadFeature {
        if (!isOverrideMode) {
            throw new Error('FileUploadFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'fileUpload',
                enabled: originalFeature?.enabled ?? false,
                mimeTypesAllowed: originalFeature?.enabled ? (originalFeature?.mimeTypesAllowed ?? []) : [],
                ...originalFeature,
            } as FileUploadFeature;
        } else if (overriddenFeature.enabled && !overriddenFeature.mimeTypesAllowed) {
            overriddenFeature.mimeTypesAllowed = [];
        }

        return overriddenFeature;
    }

    function addPresetMimeType(preset: string) {
        const f = ensureFeature();

        if (!f.mimeTypesAllowed.includes(preset)) {
            f.mimeTypesAllowed.push(preset);
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

        <!-- Current MIME types -->
        <div>
            <Label>Allowed MIME Types</Label>
            <List
                classes="w-[300px] h-[200px]"
                items={featureToShow?.mimeTypesAllowed || []}
                mapping={{
                    value: (item) => item,
                    label: (item) => item,
                }}
                allowSelection={true}
                multiSelect={true}
                emptyMessage={`No MIME types configured.`}
                disabled={!isOverrideMode || !overriddenFeature?.enabled}
                addRemove={isOverrideMode
                    ? {
                          addValueInputPlaceholder: 'Enter MIME type (e.g., text/csv)...',
                          triggerAddOnEnter: true,
                          addItem: (item) => {
                              const feature = ensureFeature();
                              if (!feature.mimeTypesAllowed.includes(item)) {
                                  feature.mimeTypesAllowed.push(item);
                              }
                          },
                          removeItem: (item) => {
                              const feature = ensureFeature();
                              feature.mimeTypesAllowed = feature.mimeTypesAllowed.filter((r) => r !== item);
                          },
                          allowArbitraryValues: {
                              convertValueToType: (value) => value,
                          },
                      }
                    : undefined}
            />
        </div>

        <!-- Common presets -->
        <div>
            <Label class="text-sm">Common Types</Label>
            <div class="flex flex-wrap gap-2 mt-1">
                {#each commonMimeTypes as preset}
                    <Button
                        variant="outline"
                        size="sm"
                        onclick={() => addPresetMimeType(preset.value)}
                        disabled={featureToShow?.mimeTypesAllowed?.includes(preset.value) ||
                            !isOverrideMode ||
                            !overriddenFeature?.enabled}
                    >
                        {preset.label}
                    </Button>
                {/each}
            </div>
        </div>
    </div>

    {#if isOverridden && originalFeature}
        <div class="p-3 border border-blue-200 bg-blue-50 rounded text-sm text-blue-800">
            <div class="font-medium mb-1">Original Settings:</div>
            <div class="space-y-1">
                <div>MIME Types: {originalFeature.mimeTypesAllowed?.join(', ') || 'None'}</div>
            </div>
        </div>
    {/if}
</div>
