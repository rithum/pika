<script lang="ts">
    import CircleAlert from '$icons/lucide/circle-alert';
    import Loader from '$icons/lucide/loader';
    import RefreshCw from '$icons/lucide/refresh-cw';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { Alert, AlertDescription, AlertTitle } from 'pika-ux/shadcn/alert';
    import { Button } from 'pika-ux/shadcn/button';
    import { Separator } from 'pika-ux/shadcn/separator';
    import { getContext, onMount, type Snippet } from 'svelte';
    // Import analytics components
    import CostByModeChart from '../components/session-analytics/cost-by-mode-chart.svelte';
    import CostTimeSeriesChart from '../components/session-analytics/cost-time-series-chart.svelte';
    import FiltersBar from '../components/session-analytics/filters-bar.svelte';
    import KpiGrid from '../components/session-analytics/kpi-grid.svelte';
    import MessagesTimeSeriesChart from '../components/session-analytics/messages-time-series-chart.svelte';
    import TimingAnalyticsCard from '../components/session-analytics/timing-analytics-card.svelte';
    import TopChatappsChart from '../components/session-analytics/top-chatapps-chart.svelte';
    import TopEntitiesChart from '../components/session-analytics/top-entities-chart.svelte';
    import UsageTimeSeriesChart from '../components/session-analytics/usage-time-series-chart.svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    interface Props {
        pageHeaderRight: Snippet<[]> | undefined;
        pageTitlePopupHelp: string | undefined;
    }

    let { pageHeaderRight = $bindable(), pageTitlePopupHelp = $bindable() }: Props = $props();

    // This causes the state to be created if it doesn't exist.
    const sessionAnalytics = siteAdmin.sessionAnalytics;

    // Derived state
    const entityFeatureEnabled = $derived(sessionAnalytics.entityFeatureEnabled);
    const analyticsData = $derived(sessionAnalytics.analyticsData);
    const loading = $derived(sessionAnalytics.isFetching);
    const error = $derived(sessionAnalytics.error);

    // Initialize data on mount
    onMount(() => {
        sessionAnalytics.refreshData();
    });

    $effect(() => {
        setTimeout(() => {
            pageHeaderRight = pageHeaderRightSnippet;
            pageTitlePopupHelp = 'Track platform usage, costs, and performance metrics across your chat sessions';
        }, 1);
    });
</script>

<div class="flex flex-col gap-6 p-8">
    <!-- Filters Bar (Sticky) -->
    <div class="sticky top-0 z-10 bg-background pb-4">
        <FiltersBar />
    </div>

    <!-- Error State -->
    {#if error}
        <Alert variant="destructive">
            <CircleAlert class="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
        </Alert>
    {/if}

    <!-- Main Content -->
    {#if !analyticsData && !loading}
        <!-- Initial Empty State -->
        <div class="flex flex-col items-center justify-center py-12 text-center">
            <div class="rounded-full bg-muted p-6 mb-4">
                <CircleAlert class="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 class="text-xl font-semibold mb-2">No Data Available</h3>
            <p class="text-muted-foreground mb-4 max-w-md">
                Select a date range and apply filters to view analytics data
            </p>
            <Button onclick={() => sessionAnalytics.refreshData()}>Load Analytics</Button>
        </div>
    {:else}
        <!-- Summary KPIs -->
        <section>
            <h2 class="text-xl font-semibold mb-4">Key Metrics</h2>
            <KpiGrid />
        </section>

        <Separator />

        <!-- Usage Trends -->
        <section>
            <h2 class="text-xl font-semibold mb-4">Usage Trends</h2>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="lg:col-span-2">
                    <UsageTimeSeriesChart />
                </div>
                <div class="lg:col-span-2">
                    <MessagesTimeSeriesChart />
                </div>
            </div>
        </section>

        <Separator />

        <!-- Cost Analysis -->
        <section>
            <h2 class="text-xl font-semibold mb-4">Cost Analysis</h2>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="lg:col-span-2">
                    <CostTimeSeriesChart />
                </div>
                <div class="lg:col-span-2">
                    <CostByModeChart />
                </div>
            </div>
        </section>

        <Separator />

        <!-- Timing Analytics -->
        <section>
            <h2 class="text-xl font-semibold mb-4">Timing Analytics</h2>
            <TimingAnalyticsCard />
        </section>

        <Separator />

        <!-- Top Performers -->
        <section>
            <h2 class="text-xl font-semibold mb-4">Top Performers</h2>
            <div class="grid grid-cols-1 {entityFeatureEnabled ? 'lg:grid-cols-2' : ''} gap-4">
                {#if entityFeatureEnabled}
                    <TopEntitiesChart />
                {/if}
                <TopChatappsChart />
            </div>
        </section>

        <!-- Empty State for No Results -->
        {#if analyticsData && analyticsData.summary.totalSessions === 0}
            <div class="flex flex-col items-center justify-center py-12 text-center mt-8">
                <div class="rounded-full bg-muted p-6 mb-4">
                    <CircleAlert class="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 class="text-xl font-semibold mb-2">No Sessions Found</h3>
                <p class="text-muted-foreground mb-4 max-w-md">
                    No sessions match your current filters. Try adjusting your date range or filter criteria.
                </p>
            </div>
        {/if}
    {/if}
</div>

{#snippet pageHeaderRightSnippet()}
    <div class="flex items-center gap-2">
        {#if sessionAnalytics.loading}
            <div class="flex items-center gap-1">
                <Loader class="mr-2 w-4 h-4 animate-spin text-muted-foreground" />
                <span class="text-muted-foreground text-sm">{sessionAnalytics.loading}</span>
            </div>
        {/if}
        <Button
            variant="outline"
            size="sm"
            onclick={() => sessionAnalytics.refreshData()}
            disabled={!!sessionAnalytics.loading}
            aria-label="Refresh analytics data"
        >
            <RefreshCw class="w-4 h-4" />
        </Button>
    </div>
{/snippet}
