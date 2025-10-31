<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { scaleTime } from 'd3-scale';
    import { curveMonotoneX } from 'd3-shape';
    import { AreaChart } from 'layerchart';
    import * as PikaToggleGroup from 'pika-ux/pika/pika-toggle-group';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'pika-ux/shadcn/card';
    import * as Chart from 'pika-ux/shadcn/chart';
    import { Skeleton } from 'pika-ux/shadcn/skeleton';
    import { getContext } from 'svelte';

    const appState = getContext<AppState>('appState');
    const sessionAnalytics = appState.siteAdmin.sessionAnalytics;

    const analyticsData = $derived(sessionAnalytics.analyticsData);
    const loading = $derived(sessionAnalytics.isFetching);

    // View selection
    let selectedView = $state<'sessions' | 'users' | 'messages' | 'cost' | 'tokens'>('sessions');

    // Transform data for the selected view
    const chartData = $derived.by(() => {
        if (!analyticsData?.timeSeries) return [];

        return analyticsData.timeSeries.map((point) => ({
            date: new Date(point.date),
            sessions: point.sessionCount,
            users: point.uniqueUserCount,
            messages: point.messageCount,
            cost: point.totalCost,
            inputTokens: point.inputTokens,
            outputTokens: point.outputTokens,
        }));
    });

    const chartConfig = $derived.by(() => {
        const base = {
            sessions: { label: 'Sessions', color: 'hsl(var(--chart-1))' },
            users: { label: 'Users', color: 'hsl(var(--chart-1))' },
            messages: { label: 'Messages', color: 'hsl(var(--chart-1))' },
            cost: { label: 'Cost', color: 'hsl(var(--chart-1))' },
            inputTokens: { label: 'Input Tokens', color: 'hsl(var(--chart-2))' },
            outputTokens: { label: 'Output Tokens', color: 'hsl(var(--chart-3))' },
        } satisfies Chart.ChartConfig;
        return base;
    });

    const series = $derived.by(() => {
        if (selectedView === 'tokens') {
            return [
                { key: 'inputTokens', label: 'Input Tokens', color: chartConfig.inputTokens.color },
                { key: 'outputTokens', label: 'Output Tokens', color: chartConfig.outputTokens.color },
            ];
        }
        return [{ key: selectedView, label: chartConfig[selectedView].label, color: chartConfig[selectedView].color }];
    });

    const viewTitle = $derived.by(() => {
        switch (selectedView) {
            case 'sessions':
                return 'Sessions Over Time';
            case 'users':
                return 'Unique Users Over Time';
            case 'messages':
                return 'Messages Over Time';
            case 'cost':
                return 'Cost Over Time';
            case 'tokens':
                return 'Token Usage Over Time';
            default:
                return 'Usage Over Time';
        }
    });

    const viewDescription = $derived.by(() => {
        if (selectedView === 'tokens') {
            return 'View trends across your selected date range (K = thousands, M = millions)';
        }
        return 'View trends across your selected date range';
    });

    const formatValue = (value: number) => {
        if (selectedView === 'cost') {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(value);
        }
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
    };

    // Format large numbers for Y-axis (especially tokens)
    const formatYAxis = (value: number) => {
        if (selectedView === 'cost') {
            return formatValue(value);
        }

        // For tokens, use compact notation
        if (selectedView === 'tokens') {
            if (value >= 1000000) {
                return `${(value / 1000000).toFixed(1)}M`;
            }
            if (value >= 1000) {
                return `${(value / 1000).toFixed(0)}K`;
            }
            return value.toString();
        }

        // For sessions, users, messages - show full number if small, otherwise abbreviate
        if (value >= 10000) {
            return `${(value / 1000).toFixed(0)}K`;
        }
        return value.toLocaleString();
    };
</script>

<Card>
    <CardHeader>
        <div class="flex items-center justify-between">
            <div>
                <CardTitle>{viewTitle}</CardTitle>
                <CardDescription>{viewDescription}</CardDescription>
            </div>
            <PikaToggleGroup.Root variant="outline" type="single" bind:value={selectedView}>
                <PikaToggleGroup.Item value="sessions">Sessions</PikaToggleGroup.Item>
                <PikaToggleGroup.Item value="users">Users</PikaToggleGroup.Item>
                <!-- <PikaToggleGroup.Item value="messages">Messages</PikaToggleGroup.Item> -->
                <PikaToggleGroup.Item value="cost">Cost</PikaToggleGroup.Item>
                <PikaToggleGroup.Item value="tokens">Tokens</PikaToggleGroup.Item>
            </PikaToggleGroup.Root>
        </div>
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
