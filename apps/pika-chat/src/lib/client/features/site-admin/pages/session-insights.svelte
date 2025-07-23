<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { ScrollArea } from '$lib/components/ui/scroll-area';
    import type { ChatApp } from '@pika/shared/types/chatbot/chatbot-types';
    import { getContext, type Snippet } from 'svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    interface Props {
        pageHeaderRight: Snippet<[]> | undefined;
    }

    let { pageHeaderRight = $bindable() }: Props = $props();

    // Local state
    let selectedChatApp = $state<ChatApp | undefined>(undefined);

    $effect(() => {
        setTimeout(() => {
            siteAdmin.setPageHeaderRight(pageHeaderRightSnippet);
        }, 1);
    });
</script>

<div class="flex h-full">
    <!-- <LeftNav {chatApps} {selectedChatApp} onSelectChatApp={(chatApp) => (selectedChatApp = chatApp)} /> -->

    <!-- Right Panel - Configuration -->
    <div class="flex-1 flex flex-col">
        {#if selectedChatApp}
            <!-- <Titlebar
                selectedChatApp={selectedAppToShow}
                {isOverrideMode}
                onSetInitialOverride={setInitialOverride}
                onRemoveOverride={() => removeOverride(false)}
            /> -->

            <ScrollArea class="flex-1">
                <div class="p-6 space-y-8 pt-8">stuff here</div>
            </ScrollArea>
        {:else}
            <div class="flex-1 flex items-center justify-center">
                <div class="text-center">
                    <h2 class="text-xl font-semibold text-muted-foreground">Select a Chat App</h2>
                    <p class="text-muted-foreground">
                        Choose a chat app from the left sidebar to view its session insights
                    </p>
                </div>
            </div>
        {/if}
    </div>
</div>

{#snippet pageHeaderRightSnippet()}
    {#if selectedChatApp}
        <div class="flex items-center">
            stuff here
            <!-- Section collapse controls -->
            <!-- <div class="flex items-center gap-1 mr-2">
                <Button variant="ghost" size="icon" onclick={expandAllSections}>
                    <Expand class="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onclick={collapseAllSections}>
                    <Shrink class="w-4 h-4" />
                </Button>
            </div>

            <Separator orientation="vertical" class="h-6" />

            <Button
                variant="ghost"
                size="icon"
                class="mr-2 ml-2"
                onclick={() => {
                    clearChatAppCache();
                }}
            >
                <BrushCleaning class="w-4 h-4" />
            </Button>

            {#if isClearingChatAppCache}
                <Loader class="mr-2 w-4 h-4 animate-spin text-muted-foreground" />
            {/if}

            <Separator orientation="vertical" class="h-6 mr-4" />
            <div class="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onclick={() => resetToSavedVersion()}
                    disabled={!isDirty || !isOverrideMode || isSaving}
                >
                    Reset
                </Button>
                <Button
                    variant="default"
                    size="sm"
                    onclick={handleSave}
                    disabled={(() => {
                        const disabled =
                            !isDirty ||
                            !selectedChatAppValid ||
                            (!isOverrideMode && !selectedChatApp?.override) ||
                            isSaving;

                        return disabled;
                    })()}
                >
                    Save
                </Button>

                {#if isSaving}
                    <Loader class="w-4 h-4 animate-spin text-muted-foreground" />
                {/if}
            </div> -->
        </div>
    {/if}
{/snippet}
