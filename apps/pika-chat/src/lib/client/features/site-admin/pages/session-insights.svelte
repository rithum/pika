<script lang="ts">
    import ChartBar from '$icons/lucide/chart-bar';
    import Loader from '$icons/lucide/loader';
    import MessageCircle from '$icons/lucide/message-circle';
    import MessagesSquare from '$icons/lucide/messages-square';
    import RefreshCw from '$icons/lucide/refresh-cw';
    import X from '$icons/lucide/x';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import SessionFeedback from '$lib/client/features/site-admin/components/session-insights/feedback/session-feedback.svelte';
    import SessionInsightsDetail from '$lib/client/features/site-admin/components/session-insights/session-insights-detail.svelte';
    import SessionMessages from '$lib/client/features/site-admin/components/session-insights/session-messages.svelte';
    import CopyButton from 'pika-ux/pika/copy-button/copy-button.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import { Label } from 'pika-ux/shadcn/label';
    import * as Resizable from 'pika-ux/shadcn/resizable';
    import { Separator } from 'pika-ux/shadcn/separator';
    import { getContext, type Snippet } from 'svelte';
    import SessionsTable from '../components/session-insights/sessions-table.svelte';

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
        <Resizable.Pane defaultSize={50} minSize={35}>
            <div class="h-full flex flex-col">
                <!-- Header with controls -->
                <div class="flex p-4">
                    <div class="flex w-full flex-col">
                        <div class="text-sm text-muted-foreground flex items-center gap-2">
                            <Label>Session ID:</Label>
                            <CopyButton embedded={true} value={sessionInsights.currentSession.sessionId} />
                        </div>
                        <div class="text-sm text-muted-foreground flex items-center gap-2">
                            <Label>User ID:</Label>
                            <CopyButton embedded={true} value={sessionInsights.currentSession.userId} />
                        </div>
                        <div class="text-sm text-muted-foreground flex items-center gap-2">
                            <Label>Title:</Label>
                            {sessionInsights.currentSession.title}
                        </div>
                        <div class="text-sm text-muted-foreground flex items-center gap-2">
                            <Label>Agent ID:</Label>
                            {sessionInsights.currentSession.agentId}
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
                            variant={sessionInsights.showFeedbackPanel ? 'default' : 'outline'}
                            size="sm"
                            onclick={() => sessionInsights.toggleFeedbackPanel()}
                        >
                            <MessageCircle class="w-4 h-4" />
                        </Button>
                        <Button
                            variant={sessionInsights.showMessagesPanel ? 'default' : 'outline'}
                            size="sm"
                            onclick={() => sessionInsights.toggleMessagesPanel()}
                        >
                            <MessagesSquare class="w-4 h-4" />
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
                            <Resizable.Pane defaultSize={sessionInsights.showMessagesPanel ? 33 : 100}>
                                <SessionInsightsDetail />
                            </Resizable.Pane>
                            {#if sessionInsights.showMessagesPanel || sessionInsights.showFeedbackPanel}
                                <Resizable.Handle withHandle />
                            {/if}
                        {/if}

                        {#if sessionInsights.showFeedbackPanel}
                            <Resizable.Pane defaultSize={33}>
                                <SessionFeedback />
                            </Resizable.Pane>
                            {#if sessionInsights.showMessagesPanel || sessionInsights.showInsightsPanel}
                                <Resizable.Handle withHandle />
                            {/if}
                        {/if}

                        {#if sessionInsights.showMessagesPanel}
                            <Resizable.Pane defaultSize={sessionInsights.showInsightsPanel ? 34 : 100}>
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
        {#if sessionInsights.loading}
            <div class="flex items-center gap-1">
                <Loader class="mr-2 w-4 h-4 animate-spin text-muted-foreground" />
                <span class="text-muted-foreground">{sessionInsights.loading}</span>
            </div>
        {/if}
        <Button
            variant="outline"
            onclick={() => sessionInsights.refreshData()}
            disabled={sessionInsights.isSearching}
            aria-label="Refresh sessions data"
        >
            <RefreshCw class="w-4 h-4" />
        </Button>
        <!-- Settings -->
        <!-- TODO: Implement settings -->
    </div>
{/snippet}
