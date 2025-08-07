<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { ScrollArea } from '$ui/shadcn/scroll-area';
    import { getContext, type Snippet } from 'svelte';
    import SessionsTable from '../components/session-insights/sessions-table.svelte';
    import { RefreshCw, ChartBar, MessageSquare } from '$icons/lucide';
    import { Button } from '$ui/shadcn/button';
    import SessionMessages from '../components/session-insights/session-messages.svelte';
    import * as Resizable from '$ui/shadcn/resizable';
    import { Separator } from '$ui/shadcn/separator';
    import { X } from '$icons/lucide';
    import SessionInsightsDetail from '../components/session-insights/session-insights-detail.svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    interface Props {
        pageHeaderRight: Snippet<[]> | undefined;
    }

    let { pageHeaderRight = $bindable() }: Props = $props();

    // Tis causes the state to be created if it doesn't exist.
    const sessionInsights = siteAdmin.sessionInsights;

    $effect(() => {
        setTimeout(() => {
            pageHeaderRight = pageHeaderRightSnippet;
        }, 1);
    });
</script>

<Resizable.PaneGroup direction="horizontal" class="flex flex-col">
    <Resizable.Pane defaultSize={50}>
        <div class="flex h-full">
            <div class="p-6 flex flex-col flex-1">
                <SessionsTable />
            </div>
        </div>
    </Resizable.Pane>
    {#if sessionInsights.currentSession}
        <Resizable.Handle withHandle />
        <Resizable.Pane defaultSize={50}>
            <div class="h-full flex flex-col">
                <!-- Header with controls -->
                <div class="flex p-4">
                    <div class="flex w-full flex-col">
                        <div class="text-sm text-muted-foreground">
                            {sessionInsights.currentSession.sessionId}
                        </div>
                        <div class="text-sm text-muted-foreground">
                            {sessionInsights.currentSession.title}
                        </div>
                    </div>

                    <!-- Panel Toggle Controls -->
                    <div class="flex gap-2">
                        <Button
                            variant={sessionInsights.showInsightsPanel ? 'default' : 'outline'}
                            size="sm"
                            onclick={() => sessionInsights.toggleInsightsPanel()}
                        >
                            <ChartBar class="w-4 h-4" />
                        </Button>
                        <Button
                            variant={sessionInsights.showMessagesPanel ? 'default' : 'outline'}
                            size="sm"
                            onclick={() => sessionInsights.toggleMessagesPanel()}
                        >
                            <MessageSquare class="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onclick={() => sessionInsights.closeRightPanel()}>
                            <X class="w-4 h-4" />
                        </Button>
                    </div>
                </div>
                <Separator />

                <!-- Vertical Resizable Panels -->
                <div class="flex-1">
                    <Resizable.PaneGroup direction="vertical">
                        {#if sessionInsights.showInsightsPanel}
                            <Resizable.Pane defaultSize={sessionInsights.showMessagesPanel ? 40 : 100}>
                                <SessionInsightsDetail />
                            </Resizable.Pane>
                            {#if sessionInsights.showMessagesPanel}
                                <Resizable.Handle withHandle />
                            {/if}
                        {/if}

                        {#if sessionInsights.showMessagesPanel}
                            <Resizable.Pane defaultSize={sessionInsights.showInsightsPanel ? 60 : 100}>
                                <div class="flex h-full justify-center p-6 pl-4 pr-4">
                                    <SessionMessages />
                                </div>
                            </Resizable.Pane>
                        {/if}
                    </Resizable.PaneGroup>
                </div>
            </div>
        </Resizable.Pane>
    {/if}
</Resizable.PaneGroup>

<!-- OLD COMMENTED OUT CODE:
<div class="flex flex-col h-full">
    <div class="flex-1 flex flex-col">
        <ScrollArea class="flex-1">
            <div class="p-6 space-y-6">
                {#if sessionInsights.totalResults > 0}
                    <div class="flex items-center justify-between">
                        <div class="text-sm text-muted-foreground">
                            Found {sessionInsights.totalResults.toLocaleString()} sessions
                        </div>
                        {#if sessionInsights.lastSearchTimestamp}
                            <div class="text-xs text-muted-foreground">
                                Last updated: {sessionInsights.lastSearchTimestamp.toLocaleString()}
                            </div>
                        {/if}
                    </div>
                {/if}

                <SessionsTable />
                <SessionMessages />
            </div>
        </ScrollArea>
    </div>
</div> -->

{#snippet pageHeaderRightSnippet()}
    <div class="flex items-center gap-2">
        <!-- Search Presets -->
        <!-- TODO: Implement saved search presets -->

        <!-- Export Options -->
        <!-- TODO: Implement export functionality -->
        <Button
            variant="outline"
            onclick={() => sessionInsights.refreshData()}
            disabled={sessionInsights.isSearching}
            aria-label="Refresh sessions data"
        >
            <RefreshCw class="w-4 h-4 {sessionInsights.isSearching ? 'animate-spin' : ''}" />
        </Button>

        <!-- Settings -->
        <!-- TODO: Implement settings -->
    </div>
{/snippet}
