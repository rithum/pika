<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { scaleTime } from 'd3-scale';
    import { curveMonotoneX } from 'd3-shape';
    import { AreaChart } from 'layerchart';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'pika-ux/shadcn/card';
    import * as Chart from 'pika-ux/shadcn/chart';
    import { Skeleton } from 'pika-ux/shadcn/skeleton';
    import { getContext } from 'svelte';

    const appState = getContext<AppState>('appState');
    const sessionAnalytics = appState.siteAdmin.sessionAnalytics;

    const analyticsData = $derived(sessionAnalytics.analyticsData);
    const loading = $derived(sessionAnalytics.isFetching);

    // Transform data for the chart
    const chartData = $derived.by(() => {
        if (!analyticsData?.timeSeries) return [];

        return analyticsData.timeSeries.map((point) => ({
            date: new Date(point.date),
            userMessages: point.userMessageCount ?? 0,
            assistantMessages: point.assistantMessageCount ?? 0,
        }));
    });

    const chartConfig = {
        userMessages: { label: 'User Messages', color: 'hsl(var(--chart-1))' },
        assistantMessages: { label: 'Assistant Responses', color: 'hsl(var(--chart-2))' },
    } satisfies Chart.ChartConfig;

    const series = [
        { key: 'userMessages', label: 'User Messages', color: chartConfig.userMessages.color },
        { key: 'assistantMessages', label: 'Assistant Responses', color: chartConfig.assistantMessages.color },
    ];

    const formatValue = (value: number) => {
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
    };

    // Format large numbers for Y-axis
    const formatYAxis = (value: number) => {
        if (value >= 10000) {
            return `${(value / 1000).toFixed(0)}K`;
        }
        return value.toLocaleString();
    };
</script>

<Card>
    <CardHeader>
        <CardTitle>Messages Over Time</CardTitle>
        <CardDescription>User messages vs AI responses across your selected date range</CardDescription>
    </CardHeader>
    <CardContent>
        {#if loading}
            <Skeleton class="h-[300px] w-full" />
        {:else if !chartData || chartData.length === 0}
            <div class="flex items-center justify-center h-[300px] text-muted-foreground">
                No data available for the selected date range
            </div>
        {:else}
            <Chart.Container config={chartConfig} class="h-[300px] w-full">
                <AreaChart
                    data={chartData}
                    x="date"
                    xScale={scaleTime()}
                    {series}
                    props={{
                        area: {
                            curve: curveMonotoneX,
                            'fill-opacity': 0.2,
                            line: { class: 'stroke-2' },
                        },
                        xAxis: {
                            format: (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        },
                        yAxis: {
                            format: formatYAxis,
                        },
                    }}
                >
                    {#snippet tooltip()}
                        <Chart.Tooltip
                            labelFormatter={(v: Date) =>
                                v.toLocaleDateString('en-US', {
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric',
                                })}
                            indicator="line"
                        />
                    {/snippet}
                </AreaChart>
            </Chart.Container>
        {/if}
    </CardContent>
</Card>
