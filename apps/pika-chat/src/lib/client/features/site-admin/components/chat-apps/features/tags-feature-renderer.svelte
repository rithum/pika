<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { assert } from '$lib/utils';
    import List from '$ui/pika/list/list.svelte';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import { Label } from '$ui/shadcn/label';
    import type {
        TagDefinition,
        TagDefinitionLite,
        TagDefinitionWidget,
        TagsFeatureForChatApp,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';

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

    const appState = getContext<AppState>('appState');
    const siteAdminState = appState.siteAdmin;
    let selectedTag = $state<TagDefinition<TagDefinitionWidget> | undefined>(undefined);

    let validErrors = $derived.by(() => {
        // No validation errors for tags feature currently
        return [];
    });

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    // Available tag definitions from the site admin state
    let availableTagDefinitions = $derived(siteAdminState.tagDefinitions || []);

    let tagsEnabled = $derived.by(() => {
        const availableTags = availableTagDefinitions;
        const enabledTags = featureToShow?.tagsEnabled || [];
        return availableTags.filter((tag) =>
            enabledTags.some((enabled) => enabled.scope === tag.scope && enabled.tag === tag.tag)
        );
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

    // Load all tag definitions when component mounts
    $effect(() => {
        if (siteAdminState && (!siteAdminState.tagDefinitions || siteAdminState.tagDefinitions.length === 0)) {
            loadAllTagDefinitions();
        }
    });

    // Function to load all tag definitions with pagination
    async function loadAllTagDefinitions() {
        let allTagDefinitions: TagDefinition<TagDefinitionWidget>[] = [];
        let paginationToken: Record<string, any> | undefined = undefined;

        do {
            const response = await siteAdminState.sendSiteAdminCommand({
                command: 'searchTagDefinitions',
                request: {
                    includeInstructions: true, // Include instructions as requested
                    paginationToken,
                },
            });

            // The response will be processed by the site admin state and stored in tagDefinitions
            // We need to break after the first call since the state handles the response
            break;
        } while (paginationToken);
    }
</script>

<div class="space-y-4">
    {#if !featureEnabled}
        <p class="text-sm text-muted-foreground italic">
            This feature is not enabled at the site level and cannot be configured.
        </p>
    {:else}
        <div class="flex items-center gap-2 mb-2">
            <Label class="text-sm font-medium">Enabled Tags:</Label>
            <PopupHelp popoverClasses="max-w-[500px] text-xs text-muted-foreground">
                <div class="text-xs text-muted-foreground">
                    <p class="mb-2">The Tags feature enables AI-driven UI components in chat responses.</p>
                    <p class="mb-2">
                        When enabled, the AI can use special tags in its responses to create interactive components like
                        charts, images, prompts, and other rich UI elements.
                    </p>
                    <p class="mb-2">
                        Each tag definition has a scope (category) and tag name. You can enable specific tags that will
                        be available to the AI for this chat app.
                    </p>
                    <p>Only enabled tags will be accessible - the AI cannot use tags that aren't in this list.</p>
                </div>
            </PopupHelp>
        </div>

        {#if siteAdminState.siteAdminOperationInProgress.searchTagDefinitions}
            <p class="text-sm text-muted-foreground">Loading available tag definitions...</p>
        {:else if availableTagDefinitions.length === 0}
            <div class="p-4 border rounded bg-yellow-50">
                <p class="text-sm text-yellow-800">
                    No tag definitions are currently available. Tag definitions should be loaded into the database
                    during deployment.
                </p>
            </div>
        {:else}
            <div class="flex gap-4">
                <!-- List column -->
                <div class="flex-shrink-0">
                    <List
                        classes="w-[300px] h-[300px]"
                        items={tagsEnabled}
                        mapping={{
                            value: (item) => `${item.scope}:${item.tag}`,
                            label: (item) => `${item.scope}:${item.tag}`,
                        }}
                        allowSelection={true}
                        multiSelect={false}
                        disabled={!isOverrideMode || disabled}
                        bind:selectedItems={
                            () => (selectedTag ? [selectedTag] : []),
                            (value) => {
                                if (!value || value.length === 0) {
                                    selectedTag = undefined;
                                } else {
                                    selectedTag = value[0];
                                }
                            }
                        }
                        emptyMessage="No tags are currently enabled. Add tags to designate tags that are available for either the LLM or the tool to return."
                        addRemove={{
                            addItem: (tag) => {
                                assert(isOverrideMode, 'isOverrideMode must be true');
                                const feature = ensureFeature();
                                feature.tagsEnabled = feature.tagsEnabled || [];
                                // Check if tag is already enabled
                                const alreadyEnabled = feature.tagsEnabled.some(
                                    (enabled) => enabled.scope === tag.scope && enabled.tag === tag.tag
                                );
                                if (!alreadyEnabled) {
                                    feature.tagsEnabled.push({ tag: tag.tag, scope: tag.scope });
                                }
                            },
                            removeItem: (tag) => {
                                assert(isOverrideMode, 'isOverrideMode must be true');
                                const feature = ensureFeature();
                                if (feature.tagsEnabled) {
                                    feature.tagsEnabled = feature.tagsEnabled.filter(
                                        (enabled) => !(enabled.scope === tag.scope && enabled.tag === tag.tag)
                                    );
                                }
                            },
                            predefinedOptions: {
                                items: availableTagDefinitions,
                                optionTypeName: 'Tag Definition',
                                optionTypeNamePlural: 'Tag Definitions',
                                mapping: {
                                    value: (item) => `${item.scope}:${item.tag}`,
                                    label: (item) => `${item.scope}:${item.tag}`,
                                },
                            },
                        }}
                    />
                    <p class="text-xs text-muted-foreground mt-2">Click a tag to view details</p>
                </div>

                <!-- Details pane -->
                <div class="flex-1 min-w-0">
                    {#if selectedTag}
                        <div class="border rounded-md p-4 space-y-4">
                            <div class="border-b pb-2 mb-4">
                                <h3 class="text-lg font-semibold">Tag Definition Details</h3>
                            </div>

                            <!-- Tag Name -->
                            <div class="space-y-1">
                                <Label class="text-sm font-medium">Tag Name</Label>
                                <p class="text-sm font-mono bg-gray-50 p-2 rounded border">
                                    {selectedTag.scope}.{selectedTag.tag}
                                </p>
                            </div>

                            <!-- Description -->
                            <div class="space-y-1">
                                <Label class="text-sm font-medium">Description</Label>
                                <p class="text-sm text-gray-700">
                                    {selectedTag.description}
                                </p>
                            </div>

                            <!-- Tag Title -->
                            <div class="space-y-1">
                                <Label class="text-sm font-medium">Tag Title</Label>
                                <p class="text-sm text-gray-700">
                                    {selectedTag.tagTitle}
                                </p>
                            </div>

                            <!-- Short Tag Example -->
                            <div class="space-y-1">
                                <Label class="text-sm font-medium">Tag Structure Example</Label>
                                <p class="text-sm font-mono bg-gray-50 p-2 rounded border">
                                    {selectedTag.shortTagEx}
                                </p>
                            </div>

                            <!-- Boolean flags with help -->
                            <div class="space-y-3">
                                <div class="flex items-center gap-2">
                                    <Label class="text-sm font-medium">Can be generated by LLM</Label>
                                    <PopupHelp popoverClasses="w-60">
                                        <div class="text-xs text-muted-foreground">
                                            <p>
                                                When enabled, this tag can be generated directly by the AI language
                                                model in its responses.
                                            </p>
                                        </div>
                                    </PopupHelp>
                                    <span
                                        class="text-sm px-2 py-1 rounded-md {selectedTag.canBeGeneratedByLlm
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-gray-100 text-gray-600'}"
                                    >
                                        {selectedTag.canBeGeneratedByLlm ? 'Yes' : 'No'}
                                    </span>
                                </div>

                                <div class="flex items-center gap-2">
                                    <Label class="text-sm font-medium">Can be generated by Tool</Label>
                                    <PopupHelp popoverClasses="w-60">
                                        <div class="text-xs text-muted-foreground">
                                            <p>
                                                When enabled, this tag can be generated by agent tools and functions
                                                during execution.
                                            </p>
                                        </div>
                                    </PopupHelp>
                                    <span
                                        class="text-sm px-2 py-1 rounded-md {selectedTag.canBeGeneratedByTool
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-gray-100 text-gray-600'}"
                                    >
                                        {selectedTag.canBeGeneratedByTool ? 'Yes' : 'No'}
                                    </span>
                                </div>

                                <div class="flex items-center gap-2">
                                    <Label class="text-sm font-medium">Disabled</Label>
                                    <span
                                        class="text-sm px-2 py-1 rounded-md {selectedTag.disabled
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-green-100 text-green-800'}"
                                    >
                                        {selectedTag.disabled ? 'Yes' : 'No'}
                                    </span>
                                </div>
                            </div>

                            <!-- LLM Instructions (raw markdown) -->
                            {#if selectedTag.llmInstructionsMd}
                                <div class="space-y-1">
                                    <Label class="text-sm font-medium">LLM Instructions (Markdown)</Label>
                                    <div
                                        class="text-sm font-mono bg-gray-50 p-3 rounded border max-h-40 overflow-auto whitespace-pre-wrap"
                                    >
                                        {selectedTag.llmInstructionsMd}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {:else}
                        <div class="border rounded-md p-4 text-center text-muted-foreground">
                            <p class="text-sm">Select a tag from the list to view its details</p>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    {/if}

    {#if validErrors.length > 0}
        <div class="space-y-2">
            {#each validErrors as error}
                <p class="text-sm text-red-500">{error}</p>
            {/each}
        </div>
    {/if}
</div>
