<script lang="ts">
    import Loader from '$icons/lucide/loader';
    import RefreshCw from '$icons/lucide/refresh-cw';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import * as Tabs from 'pika-ux/shadcn/tabs';
    import { getContext, type Snippet } from 'svelte';
    import MemoryInstructions from '../components/memory/memory-instructions.svelte';
    import MemoryList from '../components/memory/memory-list.svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const memoryState = siteAdmin.memory;
    let currentTab = $state('memory');

    interface Props {
        pageHeaderRight: Snippet<[]> | undefined;
    }

    let { pageHeaderRight = $bindable() }: Props = $props();

    // Set page title
    siteAdmin.setPageTitle('Long Term Memory');

    $effect(() => {
        setTimeout(() => {
            pageHeaderRight = pageHeaderRightSnippet;
        }, 1);
    });
</script>

{#if siteAdmin.siteFeatures?.userMemory?.enabled}
    <div class="max-w-[1300px] m-6">
        <Tabs.Root value="memory" onValueChange={(value) => (currentTab = value)}>
            <Tabs.List>
                <Tabs.Trigger value="memory">Stored Long Term Memory</Tabs.Trigger>
                <Tabs.Trigger value="instructions">User Memory Instructions</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="memory">
                <MemoryList />
            </Tabs.Content>
            <Tabs.Content value="instructions">
                <MemoryInstructions />
            </Tabs.Content>
        </Tabs.Root>
    </div>
{:else}
    <div class="flex flex-col h-full">
        <div class="flex-1 flex flex-col">
            <div class="p-6 space-y-6">
                <p class="text-sm text-muted-foreground">
                    User memory is not enabled. Please enable it in the site features.
                </p>
            </div>
        </div>
    </div>
{/if}

{#snippet pageHeaderRightSnippet()}
    {#if siteAdmin.siteFeatures?.userMemory?.enabled}
        <div class="flex items-center gap-2">
            {#if memoryState.isSearching || memoryState.isGettingInstructionsAddedForUserMemory}
                <div class="flex items-center gap-1">
                    <Loader class="mr-2 w-4 h-4 animate-spin text-muted-foreground" />
                    <span class="text-muted-foreground"
                        >{memoryState.isSearching
                            ? 'Loading memory records...'
                            : 'Loading instructions added for user memory...'}</span
                    >
                </div>
            {/if}
            <Button
                variant="outline"
                onclick={() => {
                    if (currentTab === 'memory') {
                        memoryState.loadAllMemoryRecords();
                    } else {
                        memoryState.getInstructionsAddedForUserMemory();
                    }
                }}
                disabled={(() => {
                    const memoryTabDisabled =
                        currentTab === 'memory' && (memoryState.isSearching || !memoryState.userForMemory);
                    const instructionsTabDisabled =
                        currentTab === 'instructions' &&
                        !memoryState.isGettingInstructionsAddedForUserMemory &&
                        !memoryState.readyToGetMemoryInstructions;
                    const disabled = memoryTabDisabled || instructionsTabDisabled;

                    return disabled;
                })()}
                aria-label="Refresh semantic directives"
            >
                <RefreshCw class="w-4 h-4" />
            </Button>
        </div>
    {/if}
{/snippet}
