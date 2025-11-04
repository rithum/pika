<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { CostDistributionBucket } from 'pika-shared/types/chatbot/chatbot-types';
    import { BarChart } from 'layerchart';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'pika-ux/shadcn/card';
    import * as Chart from 'pika-ux/shadcn/chart';
    import { Skeleton } from 'pika-ux/shadcn/skeleton';
    import { getContext } from 'svelte';

    // Props
    let {
        title,
        description,
        distributionData,
        isSessionLevel = true,
    }: {
        title: string;
        description: string;
        distributionData: CostDistributionBucket[] | undefined;
        isSessionLevel?: boolean;
    } = $props();

    const appState = getContext<AppState>('appState');
    const sessionAnalytics = appState.siteAdmin.sessionAnalytics;
    const loading = $derived(sessionAnalytics.isFetching);

    // Transform data for bar chart
    const chartData = $derived.by(() => {
        if (!distributionData || distributionData.length === 0) return [];

        return distributionData.map((bucket) => ({
            range: bucket.label,
            percentile: bucket.percentileLabel,
            count: bucket.count,
            percentage: 0, // Will calculate below
        }));
    });

    // Calculate total for percentages
    const totalCount = $derived(chartData.reduce((sum, item) => sum + item.count, 0));

    // Add percentages to chart data
    const chartDataWithPercentages = $derived.by(() => {
        return chartData.map((item) => ({
            ...item,
            percentage: totalCount > 0 ? (item.count / totalCount) * 100 : 0,
        }));
    });

    const chartConfig = {
        count: {
            label: isSessionLevel ? 'Sessions' : 'Turns',
            color: 'hsl(var(--chart-1))',
        },
    } satisfies Chart.ChartConfig;

    const formatNumber = (value: number) => {
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
    };
</script>

<Card>
    <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent>
        {#if loading}
            <Skeleton class="h-[350px] w-full" />
        {:else if !chartDataWithPercentages || chartDataWithPercentages.length === 0}
            <div class="flex items-center justify-center h-[350px] text-muted-foreground">
                No distribution data available
            </div>
        {:else}
            <div class="flex flex-col gap-4">
                <!-- Bar Chart -->
                <Chart.Container config={chartConfig} class="h-[300px] w-full">
                    <BarChart
                        data={chartDataWithPercentages}
                        x="percentile"
                        y="count"
                        props={{
                            bars: {
                                fill: chartConfig.count.color,
                                'fill-opacity': 0.8,
                                radius: 4,
                            },
                            xAxis: {
                                format: (value: string) => {
                                    // Shorten long labels for display
                                    if (value.includes('Bottom')) return 'Bottom 10%';
                                    if (value.includes('Top')) return 'Top 1%';
                                    return value;
                                },
                            },
                            yAxis: {
                                format: formatNumber,
                            },
                        }}
                    >
                        {#snippet tooltip()}
                            <Chart.Tooltip hideLabel />
                        {/snippet}
                    </BarChart>
                </Chart.Container>

                <!-- Enhanced Details Table (Phase 11.3: Token/Model Stats) -->
                <div class="grid grid-cols-1 gap-2">
                    {#each chartDataWithPercentages as item, idx}
                        {@const bucket = distributionData?.[idx]}
                        <div class="flex flex-col gap-2 p-2 rounded bg-muted/30">
                            <!-- Main row -->
                            <div class="flex items-center justify-between text-sm">
                                <div class="flex flex-col gap-0.5">
                                    <span class="font-medium">{item.range}</span>
                                    <span class="text-xs text-muted-foreground">{item.percentile}</span>
                                </div>
                                <div class="flex items-center gap-4">
                                    <span class="font-semibold">{formatNumber(item.count)}</span>
                                    <span class="text-xs text-muted-foreground min-w-[45px] text-right">
                                        ({item.percentage.toFixed(1)}%)
                                    </span>
                                </div>
                            </div>

                            <!-- Phase 11.3: Token stats (if available for turn distribution) -->
                            {#if bucket?.avgInputTokens !== undefined && bucket?.avgOutputTokens !== undefined}
                                <div class="text-xs text-muted-foreground flex gap-4 pl-2 border-l-2 border-muted">
                                    <span>Avg Input: {Math.round(bucket.avgInputTokens).toLocaleString()} tokens</span>
                                    <span>Avg Output: {Math.round(bucket.avgOutputTokens).toLocaleString()} tokens</span
                                    >
                                </div>
                            {/if}

                            <!-- Phase 11.3: Model breakdown (if available) -->
                            {#if bucket?.modelBreakdown && bucket.modelBreakdown.length > 0}
                                <div class="text-xs text-muted-foreground pl-2 border-l-2 border-muted">
                                    <span class="font-medium">Top models:</span>
                                    {bucket.modelBreakdown
                                        .map((m: { model: string; count: number }) => `${m.model} (${m.count})`)
                                        .join(', ')}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </CardContent>
</Card>
