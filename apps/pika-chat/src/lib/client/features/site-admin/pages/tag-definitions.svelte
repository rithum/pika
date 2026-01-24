<script lang="ts">
    import Loader from '$icons/lucide/loader';
    import RefreshCw from '$icons/lucide/refresh-cw';
    import X from '$icons/lucide/x';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { TagDefinition, TagDefinitionWidget } from 'pika-shared/types/chatbot/chatbot-types';
    import { Button } from 'pika-ux/shadcn/button';
    import * as Resizable from 'pika-ux/shadcn/resizable';
    import { ScrollArea } from 'pika-ux/shadcn/scroll-area';
    import { getContext, type Snippet } from 'svelte';
    import TagDefinitionDetail from '../components/tag-definitions/tag-definition-detail.svelte';
    import TagDefinitionsList from '../components/tag-definitions/tag-definitions-list.svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    interface Props {
        pageHeaderRight: Snippet<[]> | undefined;
    }

    let { pageHeaderRight = $bindable() }: Props = $props();

    // State
    let selectedTagDefinition = $state<TagDefinition<TagDefinitionWidget> | undefined>(undefined);
    let isLoading = $state(false);
    let hasUnsavedChanges = $state(false);

    // Set page title
    siteAdmin.setPageTitle('Tag Definitions (Widgets)');

    $effect(() => {
        setTimeout(() => {
            pageHeaderRight = pageHeaderRightSnippet;
        }, 1);
    });

    // Load tag definitions on mount
    let loaded = $state(false);
    $effect(() => {
        if (!loaded && siteAdmin.tagDefinitions.length === 0) {
            loaded = true;
            refreshData();
        }
    });

    async function refreshData() {
        isLoading = true;
        try {
            await siteAdmin.loadTagDefinitions();
        } finally {
            isLoading = false;
        }
    }

    function handleTagSelected(tag: TagDefinition<TagDefinitionWidget> | undefined) {
        selectedTagDefinition = tag;
        hasUnsavedChanges = false;
    }

    function handleTagUpdated() {
        hasUnsavedChanges = false;
        refreshData();
    }
</script>

<Resizable.PaneGroup direction="horizontal" class="flex flex-col">
    <Resizable.Pane defaultSize={40} minSize={25}>
        <div class="flex h-full">
            <div class="p-6 flex flex-col flex-1">
                <TagDefinitionsList
                    tagDefinitions={siteAdmin.tagDefinitions}
                    {selectedTagDefinition}
                    onSelect={handleTagSelected}
                    {isLoading}
                />
            </div>
        </div>
    </Resizable.Pane>

    {#if selectedTagDefinition}
        <Resizable.Handle withHandle />
        <Resizable.Pane defaultSize={60} minSize={40}>
            <div class="h-full flex flex-col">
                <!-- Header -->
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="font-medium">
                        {selectedTagDefinition.scope}.{selectedTagDefinition.tag}
                    </h3>
                    <Button variant="ghost" size="icon" onclick={() => handleTagSelected(undefined)}>
                        <X class="w-4 h-4" />
                    </Button>
                </div>

                <!-- Detail content -->
                <div class="flex-1 overflow-hidden">
                    <ScrollArea class="h-full w-full">
                        <div class="p-4">
                            <TagDefinitionDetail
                                tagDefinition={selectedTagDefinition}
                                onUpdated={handleTagUpdated}
                                bind:hasUnsavedChanges
                            />
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </Resizable.Pane>
    {/if}
</Resizable.PaneGroup>

{#snippet pageHeaderRightSnippet()}
    <div class="flex items-center gap-2">
        {#if isLoading}
            <div class="flex items-center gap-1">
                <Loader class="mr-2 w-4 h-4 animate-spin text-muted-foreground" />
                <span class="text-muted-foreground">Loading...</span>
            </div>
        {/if}
        <Button
            variant="outline"
            onclick={() => refreshData()}
            disabled={isLoading}
            aria-label="Refresh tag definitions"
        >
            <RefreshCw class="w-4 h-4" />
            Refresh
        </Button>
    </div>
{/snippet}
