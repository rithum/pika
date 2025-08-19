<script lang="ts">
    import List from '$ui/pika/list/list.svelte';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import { Button } from '$ui/shadcn/button';
    import { Input } from '$ui/shadcn/input';
    import { Label } from '$ui/shadcn/label';
    import { Separator } from '$ui/shadcn/separator';
    import { Trash2, Plus } from '$icons/lucide';
    import { assert } from '$lib/utils';
    import type {
        TagsFeatureForChatApp,
        TagDefinitionLite,
        SiteAdminCommand,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import type { SiteAdminState } from '$lib/client/features/site-admin/site-admin.state.svelte';

    interface Props {
        overriddenFeature: TagsFeatureForChatApp | undefined;
        originalFeature: TagsFeatureForChatApp | undefined;
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

    const siteAdminState = getContext<SiteAdminState>('siteAdminState');

    let validErrors = $derived.by(() => {
        // No validation errors for tags feature currently
        return [];
    });

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    // Available tag definitions from the site admin state
    let availableTagDefinitions = $derived(siteAdminState.tagDefinitions || []);

    // Track available scopes for the scope selector
    let availableScopes = $derived.by(() => {
        const scopes = new Set<string>();
        availableTagDefinitions.forEach((def) => scopes.add(def.scope));
        return Array.from(scopes).sort();
    });

    function ensureFeature(): TagsFeatureForChatApp {
        if (!isOverrideMode) {
            throw new Error('TagsFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'tags',
                enabled: originalFeature?.enabled ?? false,
                tagsEnabled: [],
                ...originalFeature,
            } as TagsFeatureForChatApp;
        } else {
            if (!overriddenFeature.tagsEnabled) {
                overriddenFeature.tagsEnabled = [];
            }
        }

        return overriddenFeature;
    }

    $effect(() => {
        if (isOverrideMode) {
            ensureFeature();
        } else {
            overriddenFeature = undefined;
        }
    });

    // Load tag definitions when component mounts
    $effect(() => {
        if (siteAdminState && (!siteAdminState.tagDefinitions || siteAdminState.tagDefinitions.length === 0)) {
            // Load tag definitions from the server
            siteAdminState.sendSiteAdminCommand({
                command: 'searchTagDefinitions',
                request: {
                    includeInstructions: false, // We don't need instructions for the feature config
                },
            });
        }
    });

    function addEnabledTag() {
        assert(isOverrideMode, 'isOverrideMode must be true');
        const feature = ensureFeature();
        feature.tagsEnabled = feature.tagsEnabled || [];
        feature.tagsEnabled.push({ tag: '', scope: '' });
    }

    function removeEnabledTag(index: number) {
        assert(isOverrideMode, 'isOverrideMode must be true');
        const feature = ensureFeature();
        if (feature.tagsEnabled && feature.tagsEnabled.length > index) {
            feature.tagsEnabled.splice(index, 1);
        }
    }

    // Function to get available tags for a given scope
    function getTagsForScope(scope: string): string[] {
        return availableTagDefinitions
            .filter((def) => def.scope === scope)
            .map((def) => def.tag)
            .sort();
    }

    // Function to check if a tag combination is valid
    function isValidTagCombination(tagLite: TagDefinitionLite): boolean {
        if (!tagLite.tag || !tagLite.scope) return false;
        return availableTagDefinitions.some((def) => def.tag === tagLite.tag && def.scope === tagLite.scope);
    }
</script>

<div class="space-y-4">
    {#if !featureEnabled}
        <p class="text-sm text-muted-foreground italic">
            This feature is not enabled at the site level and cannot be configured.
        </p>
    {:else if featureToShow && !isOverrideMode}
        <div class="space-y-4">
            <div>
                <Label class="text-sm font-medium">Enabled Tags:</Label>
                {#if featureToShow.tagsEnabled && featureToShow.tagsEnabled.length > 0}
                    <div class="mt-2 space-y-2">
                        {#each featureToShow.tagsEnabled as tagLite}
                            <div class="flex items-center gap-2 p-2 border rounded">
                                <span class="font-mono text-sm">{tagLite.scope}:{tagLite.tag}</span>
                                {#if !isValidTagCombination(tagLite)}
                                    <span class="text-xs text-red-500">(Invalid - tag definition not found)</span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {:else}
                    <p class="text-sm text-muted-foreground mt-2">No tags are currently enabled for this chat app.</p>
                {/if}
            </div>
        </div>
    {:else if featureEnabled && isOverrideMode}
        <div class="space-y-4">
            {#if siteAdminState.siteAdminOperationInProgress.searchTagDefinitions}
                <p class="text-sm text-muted-foreground">Loading available tag definitions...</p>
            {:else if availableTagDefinitions.length === 0}
                <div class="p-4 border rounded bg-yellow-50">
                    <p class="text-sm text-yellow-800">
                        No tag definitions are currently available. Tag definitions need to be created by a site
                        administrator before they can be enabled for chat apps.
                    </p>
                </div>
            {:else}
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <Label class="text-sm font-medium">Enabled Tags:</Label>
                        <Button variant="outline" size="sm" onclick={addEnabledTag} {disabled}>
                            <Plus class="w-4 h-4 mr-1" />
                            Add Tag
                        </Button>
                    </div>

                    {#if overriddenFeature?.tagsEnabled && overriddenFeature.tagsEnabled.length > 0}
                        <div class="space-y-3">
                            {#each overriddenFeature.tagsEnabled as tagLite, index}
                                <div class="flex items-center gap-2 p-3 border rounded">
                                    <div class="flex-1 grid grid-cols-2 gap-2">
                                        <div class="space-y-1">
                                            <Label for="scope-{index}" class="text-xs">Scope:</Label>
                                            <select
                                                id="scope-{index}"
                                                class="w-full h-8 px-2 text-sm border rounded"
                                                bind:value={tagLite.scope}
                                                onchange={() => {
                                                    // Clear tag when scope changes
                                                    tagLite.tag = '';
                                                }}
                                                {disabled}
                                            >
                                                <option value="">Select scope...</option>
                                                {#each availableScopes as scope}
                                                    <option value={scope}>{scope}</option>
                                                {/each}
                                            </select>
                                        </div>

                                        <div class="space-y-1">
                                            <Label for="tag-{index}" class="text-xs">Tag:</Label>
                                            <select
                                                id="tag-{index}"
                                                class="w-full h-8 px-2 text-sm border rounded"
                                                bind:value={tagLite.tag}
                                                disabled={disabled || !tagLite.scope}
                                            >
                                                <option value="">Select tag...</option>
                                                {#each getTagsForScope(tagLite.scope) as tag}
                                                    <option value={tag}>{tag}</option>
                                                {/each}
                                            </select>
                                        </div>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onclick={() => removeEnabledTag(index)}
                                        {disabled}
                                        class="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </Button>
                                </div>

                                {#if tagLite.tag && tagLite.scope && !isValidTagCombination(tagLite)}
                                    <div class="text-xs text-red-500 ml-3">
                                        Warning: The tag definition "{tagLite.scope}:{tagLite.tag}" was not found in the
                                        available tag definitions.
                                    </div>
                                {/if}
                            {/each}
                        </div>
                    {:else}
                        <p class="text-sm text-muted-foreground">
                            No tags are currently enabled. Add tags to allow the LLM to use AI-driven UI components.
                        </p>
                    {/if}
                </div>

                <Separator />

                <div class="space-y-2">
                    <Label class="text-sm font-medium"
                        >Available Tag Definitions ({availableTagDefinitions.length}):</Label
                    >
                    <div class="max-h-48 overflow-y-auto border rounded p-2">
                        {#if availableTagDefinitions.length > 0}
                            <div class="space-y-1">
                                {#each availableTagDefinitions as def}
                                    <div class="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                                        <span class="font-mono text-sm">{def.scope}:{def.tag}</span>
                                        <span class="text-xs text-muted-foreground">
                                            {overriddenFeature?.tagsEnabled?.some(
                                                (enabled) => enabled.scope === def.scope && enabled.tag === def.tag
                                            )
                                                ? 'Enabled'
                                                : 'Available'}
                                        </span>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <p class="text-sm text-muted-foreground">No tag definitions available.</p>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    {/if}

    {#if validErrors.length > 0}
        <div class="space-y-2">
            {#each validErrors as error}
                <p class="text-sm text-red-500">{error}</p>
            {/each}
        </div>
    {/if}
</div>
