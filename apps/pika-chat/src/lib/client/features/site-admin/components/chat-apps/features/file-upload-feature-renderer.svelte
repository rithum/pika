<script lang="ts">
    import { Plus, X } from '$icons/lucide';
    import { Badge } from '$lib/components/ui/badge';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
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

    let newMimeType = $state('');

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
        setValid(validErrors.length === 0);
    });

    let enabled = $derived.by(() => {
        if (isOverridden) {
            return overriddenFeature?.enabled ?? false;
        } else {
            return originalFeature?.enabled ?? false;
        }
    });

    function ensureFeature(): FileUploadFeature {
        if (!isOverrideMode) {
            throw new Error('FileUploadFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'fileUpload',
                enabled: originalFeature?.enabled ?? false,
                mimeTypesAllowed: [],
                ...originalFeature,
            } as FileUploadFeature;
        } else if (overriddenFeature.enabled && !overriddenFeature.mimeTypesAllowed) {
            overriddenFeature.mimeTypesAllowed = [];
        }

        return overriddenFeature;
    }

    // Initialize MIME types from feature
    // $effect(() => {
    //     if (feature) {
    //         mimeTypes = [...(feature.mimeTypesAllowed || [])];
    //     } else {
    //         mimeTypes = [];
    //     }
    // });

    // Update feature when MIME types change
    // $effect(() => {
    //     if (isOverrideMode && feature) {
    //         const updatedFeature: FileUploadFeature = {
    //             ...feature,
    //             mimeTypesAllowed: mimeTypes,
    //         };
    //         onFeatureChange(updatedFeature);
    //     }
    // });

    function addMimeType() {
        const f = ensureFeature();

        if (!f.mimeTypesAllowed) {
            f.mimeTypesAllowed = [];
        }

        const newMimeTypeTrimmed = newMimeType.trim();

        if (newMimeTypeTrimmed && !f.mimeTypesAllowed.includes(newMimeTypeTrimmed)) {
            f.mimeTypesAllowed.push(newMimeTypeTrimmed);
            newMimeType = '';
        }
    }

    function removeMimeType(index: number) {
        const f = ensureFeature();

        f.mimeTypesAllowed = f.mimeTypesAllowed.filter((_, i) => i !== index);
    }

    function addPresetMimeType(preset: string) {
        const f = ensureFeature();

        if (!f.mimeTypesAllowed.includes(preset)) {
            f.mimeTypesAllowed.push(preset);
        }
    }

    function handleKeyPress(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault();
            addMimeType();
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
        <Label>Allowed MIME Types</Label>
        {#if (featureToShow?.mimeTypesAllowed ?? []).length > 0}
            <div class="flex flex-wrap gap-2 mb-4 mt-4">
                {#each featureToShow?.mimeTypesAllowed ?? [] as mimeType, index}
                    <Badge variant="secondary" class="flex items-center gap-1">
                        {mimeType}
                        {#if isOverrideMode}
                            <button
                                onclick={() => removeMimeType(index)}
                                disabled={!isOverrideMode || !enabled}
                                class="text-muted-foreground hover:text-destructive"
                            >
                                <X class="w-3 h-3" />
                            </button>
                        {/if}
                    </Badge>
                {/each}
            </div>
        {/if}

        <!-- {#if (featureToShow?.mimeTypesAllowed ?? []).length === 0}
            <div class="p-3 border border-yellow-200 bg-yellow-50 rounded text-sm text-yellow-800">
                No MIME types configured. File uploads will be disabled.
            </div>
        {/if} -->

        {#if isOverrideMode}
            <!-- Add new MIME type -->
            <div class="flex gap-2 mb-3 w-[300px]">
                <Input
                    bind:value={newMimeType}
                    placeholder="Enter MIME type (e.g., text/csv)"
                    onkeypress={handleKeyPress}
                    disabled={!isOverrideMode || !enabled}
                />
                <Button onclick={addMimeType} disabled={!newMimeType.trim() || !isOverrideMode || !enabled}>
                    <Plus class="w-4 h-4" />
                </Button>
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
                                !enabled}
                        >
                            {preset.label}
                        </Button>
                    {/each}
                </div>
            </div>
        {/if}
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
