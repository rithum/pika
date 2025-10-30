<script lang="ts">
	import type { AppState } from '$lib/client/app/app.state.svelte';
	import { getContext } from 'svelte';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'pika-ux/shadcn/card';
	import * as Chart from 'pika-ux/shadcn/chart';
	import { Skeleton } from 'pika-ux/shadcn/skeleton';
	import { AreaChart } from 'layerchart';
	import { scaleTime } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';

	const appState = getContext<AppState>('appState');
	const sessionAnalytics = appState.siteAdmin.sessionAnalytics;

	const analyticsData = $derived(sessionAnalytics.analyticsData);
	const loading = $derived(sessionAnalytics.isFetching);

	// Transform data for stacked area chart
	const chartData = $derived.by(() => {
		if (!analyticsData?.timeSeries) return [];

		return analyticsData.timeSeries.map((point) => ({
			date: new Date(point.date),
			inputCost: point.inputCost,
			outputCost: point.outputCost,
			totalCost: point.totalCost
		}));
	});

	const chartConfig = {
		inputCost: {
			label: 'Input Cost',
			color: 'hsl(var(--chart-1))'
		},
		outputCost: {
			label: 'Output Cost',
			color: 'hsl(var(--chart-2))'
		}
	} satisfies Chart.ChartConfig;

	const series = [
		{ key: 'inputCost', label: 'Input Cost', color: chartConfig.inputCost.color },
		{ key: 'outputCost', label: 'Output Cost', color: chartConfig.outputCost.color }
	];

	const formatCurrency = (value: number) => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(value);
	};
</script>

<Card>
	<CardHeader>
		<CardTitle>Cost Trends</CardTitle>
		<CardDescription>Input and output cost breakdown over time</CardDescription>
	</CardHeader>
	<CardContent>
		{#if loading}
			<Skeleton class="h-[300px] w-full" />
		{:else if !chartData || chartData.length === 0}
			<div class="flex items-center justify-center h-[300px] text-muted-foreground">
				No cost data available for the selected date range
			</div>
		{:else}
			<Chart.Container config={chartConfig} class="h-[300px] w-full">
				<AreaChart
					data={chartData}
					x="date"
					xScale={scaleTime()}
					{series}
					seriesLayout="stack"
					props={{
						area: {
							curve: curveMonotoneX,
							'fill-opacity': 0.4,
							line: { class: 'stroke-1' }
						},
						xAxis: {
							format: (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
						},
						yAxis: {
							format: (d: number) => formatCurrency(d)
						}
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip
							labelFormatter={(v: Date) => v.toLocaleDateString('en-US', {
								month: 'long',
								day: 'numeric',
								year: 'numeric'
							})}
							indicator="line"
						/>
					{/snippet}
				</AreaChart>
			</Chart.Container>
		{/if}
	</CardContent>
</Card>
