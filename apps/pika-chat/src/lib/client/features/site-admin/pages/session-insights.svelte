<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { ScrollArea } from '$ui/shadcn/scroll-area';
    import { getContext, type Snippet } from 'svelte';
    import SessionsTable from '../components/session-insights/sessions-table.svelte';
    import { RefreshCw } from '$icons/lucide';
    import { Button } from '$ui/shadcn/button';
    import SessionMessages from '../components/session-insights/session-messages.svelte';

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

<div class="flex flex-col h-full">
    <div class="flex-1 flex flex-col">
        <ScrollArea class="flex-1">
            <div class="p-6 space-y-6">
                <!-- Results Summary -->
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

                <!-- Sessions Table -->
                <SessionsTable />
                <SessionMessages />
            </div>
        </ScrollArea>
    </div>
</div>

{#snippet pageHeaderRightSnippet()}
    <div class="flex items-center gap-2">
        <!-- Search Presets -->
        <!-- TODO: Implement saved search presets -->

        <!-- Export Options -->
        <!-- TODO: Implement export functionality -->

        <!-- Refresh -->
        <Button
            class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
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
