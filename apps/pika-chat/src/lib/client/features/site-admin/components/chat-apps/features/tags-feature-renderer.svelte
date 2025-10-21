<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { assert } from '$lib/utils';
    import type {
        TagDefinition,
        TagDefinitionWidget,
        TagsFeatureForChatApp,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import List from 'pika-ux/pika/list/list.svelte';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import { Label } from 'pika-ux/shadcn/label';
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
        // Only show chat-app specific tags (usageMode='chat-app'), not global tags
        // Global tags are available by default and don't need to be explicitly enabled
        return availableTags.filter(
            (tag) =>
                tag.usageMode === 'chat-app' &&
                enabledTags.some((enabled) => enabled.scope === tag.scope && enabled.tag === tag.tag)
        );
    });

    let tagsDisabled = $derived.by(() => {
        const availableTags = availableTagDefinitions;
        const disabledTags = featureToShow?.tagsDisabled || [];
        return availableTags.filter((tag) =>
            disabledTags.some((disabled) => disabled.scope === tag.scope && disabled.tag === tag.tag)
        );
    });

    // Global tags that can be disabled (scope='pika' or usageMode='global')
    let globalTags = $derived.by(() => {
        return availableTagDefinitions.filter((tag) => tag.usageMode === 'global');
    });

    // Enabled global tags (global tags that are NOT disabled)
    let enabledGlobalTags = $derived.by(() => {
        const disabledTags = featureToShow?.tagsDisabled || [];
        return globalTags.filter(
            (tag) => !disabledTags.some((disabled) => disabled.scope === tag.scope && disabled.tag === tag.tag)
        );
    });

    // Chat-app specific tags that can be enabled
    let chatAppTags = $derived.by(() => {
        return availableTagDefinitions.filter((tag) => tag.usageMode === 'chat-app');
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
                tagsDisabled: [],
                ...originalFeature,
            } as TagsFeatureForChatApp;
        } else {
            if (!overriddenFeature.tagsEnabled) {
                overriddenFeature.tagsEnabled = [];
            }
            if (!overriddenFeature.tagsDisabled) {
                overriddenFeature.tagsDisabled = [];
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
    let tagDefinitionsLoaded = $state(false);

    $effect(() => {
        // Only load if we haven't tried loading before
        // tagDefinitions is initialized as empty array [], so we check if not loaded yet
        if (siteAdminState && !tagDefinitionsLoaded) {
            tagDefinitionsLoaded = true; // Mark as attempted BEFORE calling API
            siteAdminState.loadTagDefinitions();
        }
    });
</script>

<div class="space-y-4">
    {#if !featureEnabled}
        <p class="text-sm text-muted-foreground italic">
            This feature is not enabled at the site level and cannot be configured.
        </p>
    {:else}
        <div class="mb-4">
            <div class="flex items-center gap-2 mb-2">
                <Label class="text-sm font-medium">Tags Configuration</Label>
                <PopupHelp popoverClasses="max-w-[600px] text-xs text-muted-foreground">
                    <div class="text-xs text-muted-foreground space-y-2">
                        <p class="font-semibold">Tag System Overview:</p>
                        <p>Tags enable AI-driven UI components in chat responses. There are two types:</p>
                        <ul class="list-disc pl-4 space-y-1">
                            <li>
                                <strong>Global Tags:</strong> Available to all chat apps by default (e.g., chart, image,
                                prompt). Can be disabled if not needed.
                            </li>
                            <li>
                                <strong>Chat-App Tags:</strong> Must be explicitly enabled per chat app (e.g., download).
                            </li>
                        </ul>
                        <p class="pt-2">
                            <strong>Built-in Pika Tags (scope='pika'):</strong> Core platform tags like chart, image, and
                            prompt that provide standard UI components.
                        </p>
                    </div>
                </PopupHelp>
            </div>
            <p class="text-xs text-muted-foreground">
                Manage which tags are available for this chat app. Global tags are included by default unless disabled.
            </p>
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
            <!-- Two columns: Enabled Tags and Disabled Global Tags -->
            <div class="grid grid-cols-2 gap-4 mb-4">
                <!-- Enabled Chat-App Tags List -->
                <div class="space-y-2">
                    <div class="flex items-center gap-2">
                        <Label class="text-sm font-medium">Enabled Chat-App Tags</Label>
                        <PopupHelp popoverClasses="w-80">
                            <div class="text-xs text-muted-foreground">
                                <p class="mb-2">Chat-app specific tags that must be explicitly enabled.</p>
                                <p class="mb-2">
                                    These tags (usageMode='chat-app') are only available if you add them here.
                                </p>
                                <p>Note: Global tags are automatically included (see right panel to disable them).</p>
                            </div>
                        </PopupHelp>
                    </div>
                    <List
                        classes="w-full h-[300px]"
                        items={tagsEnabled}
                        mapping={{
                            value: (item) => `${item.scope}.${item.tag}`,
                            label: (item) => {
                                const isPika = item.scope === 'pika';
                                const prefix = isPika ? '⭐ ' : '';
                                return `${prefix}${item.scope}.${item.tag}`;
                            },
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
                        emptyMessage="No chat-app tags enabled. Add tags that require explicit configuration."
                        addRemove={{
                            addItem: (tag) => {
                                assert(isOverrideMode, 'isOverrideMode must be true');
                                const feature = ensureFeature();
                                feature.tagsEnabled = feature.tagsEnabled || [];
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
                                items: chatAppTags,
                                optionTypeName: 'Chat-App Tag',
                                optionTypeNamePlural: 'Chat-App Tags',
                                mapping: {
                                    value: (item) => `${item.scope}.${item.tag}`,
                                    label: (item) => {
                                        const isPika = item.scope === 'pika';
                                        const prefix = isPika ? '⭐ ' : '';
                                        return `${prefix}${item.scope}.${item.tag}`;
                                    },
                                },
                            },
                        }}
                    />
                    <p class="text-xs text-muted-foreground">⭐ = Built-in Pika tag</p>

                    <!-- Show base config tags when in override mode -->
                    {#if isOverrideMode && originalFeature?.tagsEnabled && originalFeature.tagsEnabled.length > 0}
                        <div class="mt-3 p-3 bg-muted/50 rounded-md border border-border">
                            <p class="text-xs font-medium text-muted-foreground mb-2">
                                In Base Config ({originalFeature.tagsEnabled.length}):
                            </p>
                            <div class="flex flex-wrap gap-1">
                                {#each originalFeature.tagsEnabled as tagLite}
                                    {@const fullTag = availableTagDefinitions.find(
                                        (t) => t.scope === tagLite.scope && t.tag === tagLite.tag
                                    )}
                                    {#if fullTag && fullTag.usageMode === 'chat-app'}
                                        <span
                                            class="inline-flex items-center px-2 py-1 rounded-md bg-background border border-border text-xs"
                                        >
                                            {#if fullTag.scope === 'pika'}⭐{/if}
                                            {fullTag.scope}.{fullTag.tag}
                                        </span>
                                    {/if}
                                {/each}
                            </div>
                            <p class="text-xs text-muted-foreground mt-2">
                                {#if tagsEnabled.length === 0}
                                    These are configured in the base chat app. Override is empty.
                                {:else}
                                    These are configured in the base chat app. Override adds {tagsEnabled.length} tag(s).
                                {/if}
                            </p>
                        </div>
                    {/if}
                </div>

                <!-- Disabled Global Tags List -->
                <div class="space-y-2">
                    <div class="flex items-center gap-2">
                        <Label class="text-sm font-medium">Disabled Global Tags</Label>
                        <PopupHelp popoverClasses="w-80">
                            <div class="text-xs text-muted-foreground">
                                <p class="mb-2">Global tags are automatically available to all chat apps.</p>
                                <p class="mb-2">Add tags here to explicitly disable them for this chat app.</p>
                                <p>Example: Disable 'chart' if you don't want charts in this chat app.</p>
                            </div>
                        </PopupHelp>
                    </div>
                    <List
                        classes="w-full h-[300px]"
                        items={tagsDisabled}
                        mapping={{
                            value: (item) => `${item.scope}.${item.tag}`,
                            label: (item) => {
                                const isPika = item.scope === 'pika';
                                const prefix = isPika ? '⭐ ' : '';
                                return `${prefix}${item.scope}.${item.tag}`;
                            },
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
                        emptyMessage="No global tags disabled. All global tags are available."
                        addRemove={{
                            addItem: (tag) => {
                                assert(isOverrideMode, 'isOverrideMode must be true');
                                const feature = ensureFeature();
                                feature.tagsDisabled = feature.tagsDisabled || [];
                                const alreadyDisabled = feature.tagsDisabled.some(
                                    (disabled) => disabled.scope === tag.scope && disabled.tag === tag.tag
                                );
                                if (!alreadyDisabled) {
                                    feature.tagsDisabled.push({ tag: tag.tag, scope: tag.scope });
                                }
                            },
                            removeItem: (tag) => {
                                assert(isOverrideMode, 'isOverrideMode must be true');
                                const feature = ensureFeature();
                                if (feature.tagsDisabled) {
                                    feature.tagsDisabled = feature.tagsDisabled.filter(
                                        (disabled) => !(disabled.scope === tag.scope && disabled.tag === tag.tag)
                                    );
                                }
                            },
                            predefinedOptions: {
                                items: globalTags,
                                optionTypeName: 'Global Tag',
                                optionTypeNamePlural: 'Global Tags',
                                mapping: {
                                    value: (item) => `${item.scope}.${item.tag}`,
                                    label: (item) => {
                                        const isPika = item.scope === 'pika';
                                        const prefix = isPika ? '⭐ ' : '';
                                        return `${prefix}${item.scope}.${item.tag}`;
                                    },
                                },
                            },
                        }}
                    />
                    <p class="text-xs text-muted-foreground">⭐ = Built-in Pika tag</p>

                    <!-- Show enabled global tags info -->
                    {#if enabledGlobalTags.length > 0}
                        <div class="mt-3 p-3 bg-muted/50 rounded-md border border-border">
                            <p class="text-xs font-medium text-muted-foreground mb-2">
                                {#if tagsDisabled.length > 0}
                                    Enabled Global Tags ({enabledGlobalTags.length} of {globalTags.length}):
                                {:else}
                                    Available Global Tags ({enabledGlobalTags.length}):
                                {/if}
                            </p>
                            <div class="flex flex-wrap gap-1">
                                {#each enabledGlobalTags as tag}
                                    <span
                                        class="inline-flex items-center px-2 py-1 rounded-md bg-background border border-border text-xs"
                                    >
                                        {#if tag.scope === 'pika'}⭐{/if}
                                        {tag.scope}.{tag.tag}
                                    </span>
                                {/each}
                            </div>
                            <p class="text-xs text-muted-foreground mt-2">
                                {#if tagsDisabled.length > 0}
                                    These global tags are enabled. {tagsDisabled.length} tag(s) disabled.
                                {:else}
                                    These tags are automatically included. Use the dropdown above to disable any.
                                {/if}
                            </p>
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Tag Details Section (below both lists) -->
            <div class="mt-4">
                <Label class="text-sm font-medium mb-2 block">Tag Details</Label>
                <div>
                    {#if selectedTag}
                        <div class="border rounded-md p-4 space-y-4">
                            <div class="border-b pb-2 mb-4">
                                <h3 class="text-lg font-semibold">Tag Definition Details</h3>
                            </div>

                            <!-- Tag Name -->
                            <div class="space-y-1">
                                <Label class="text-sm font-medium">Tag Name</Label>
                                <p class="text-sm font-mono bg-gray-50 p-2 rounded border">
                                    {selectedTag.scope === 'pika' ? '⭐ ' : ''}{selectedTag.scope}.{selectedTag.tag}
                                </p>
                                {#if selectedTag.scope === 'pika'}
                                    <p class="text-xs text-blue-600">Built-in Pika tag</p>
                                {/if}
                            </div>

                            <!-- Usage Mode -->
                            <div class="space-y-1">
                                <Label class="text-sm font-medium">Usage Mode</Label>
                                <div class="flex items-center gap-2">
                                    <span
                                        class="text-sm px-2 py-1 rounded-md {selectedTag.usageMode === 'global'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-purple-100 text-purple-800'}"
                                    >
                                        {selectedTag.usageMode === 'global' ? 'Global' : 'Chat-App'}
                                    </span>
                                    <PopupHelp popoverClasses="w-60">
                                        <div class="text-xs text-muted-foreground">
                                            {#if selectedTag.usageMode === 'global'}
                                                <p>
                                                    Global tags are automatically available to all chat apps unless
                                                    explicitly disabled.
                                                </p>
                                            {:else}
                                                <p>
                                                    Chat-app tags must be explicitly enabled in each chat app's
                                                    configuration.
                                                </p>
                                            {/if}
                                        </div>
                                    </PopupHelp>
                                </div>
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
                                        class="text-sm px-2 py-1 rounded-md {selectedTag.status !== 'enabled'
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-green-100 text-green-800'}"
                                    >
                                        {selectedTag.status !== 'enabled' ? 'Yes' : 'No'}
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
