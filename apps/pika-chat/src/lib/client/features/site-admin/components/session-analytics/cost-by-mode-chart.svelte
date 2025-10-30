<script lang="ts">
	import type { AppState } from '$lib/client/app/app.state.svelte';
	import { getContext } from 'svelte';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'pika-ux/shadcn/card';
	import * as Chart from 'pika-ux/shadcn/chart';
	import { Skeleton } from 'pika-ux/shadcn/skeleton';
	import { PieChart } from 'layerchart';

	const appState = getContext<AppState>('appState');
	const sessionAnalytics = appState.siteAdmin.sessionAnalytics;

	const analyticsData = $derived(sessionAnalytics.analyticsData);
	const loading = $derived(sessionAnalytics.isFetching);

	// Transform data for pie chart
	const chartData = $derived.by(() => {
		if (!analyticsData?.costByInvocationMode) return [];

		return analyticsData.costByInvocationMode
			.filter((mode) => mode.totalCost > 0)
			.map((mode) => ({
				mode: mode.invocationMode,
				description: mode.description,
				cost: mode.totalCost,
				sessions: mode.sessionCount,
				inputCost: mode.inputCost,
				outputCost: mode.outputCost,
				inputTokens: mode.inputTokens,
				outputTokens: mode.outputTokens,
				color: getColorForMode(mode.invocationMode)
			}));
	});

	// Calculate total for percentages
	const totalCost = $derived(chartData.reduce((sum, item) => sum + item.cost, 0));

	// Chart config with distinct colors
	const chartConfig = {
		'undefined': {
			label: 'User-Initiated (undefined)',
			color: 'hsl(var(--chart-1))'
		},
		'chat-app': {
			label: 'User-Initiated (chat-app)',
			color: 'hsl(var(--chart-2))'
		},
		'direct-agent-invoke': {
			label: 'Direct Agent API',
			color: 'hsl(var(--chart-3))'
		},
		'chat-app-component': {
			label: 'Widget Invocations',
			color: 'hsl(var(--chart-4))'
		},
		cost: {
			label: 'Cost'
		}
	} satisfies Chart.ChartConfig;

	function getColorForMode(mode: string): string {
		const config = chartConfig[mode as keyof typeof chartConfig];
		return config && 'color' in config ? config.color : 'hsl(var(--chart-5))';
	}

	const formatCurrency = (value: number) => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(value);
	};

	const getPercentage = (cost: number) => {
		return totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) : '0.0';
	};
</script>

<Card>
	<CardHeader>
		<CardTitle>Cost by Invocation Mode</CardTitle>
		<CardDescription>Cost breakdown by how sessions were initiated</CardDescription>
	</CardHeader>
	<CardContent>
		{#if loading}
			<Skeleton class="h-[350px] w-full" />
		{:else if !chartData || chartData.length === 0}
			<div class="flex items-center justify-center h-[350px] text-muted-foreground">
				No invocation mode data available
			</div>
		{:else}
			<div class="flex flex-col gap-4">
				<!-- Pie Chart -->
				<Chart.Container config={chartConfig} class="mx-auto aspect-square max-h-[250px]">
					<PieChart
						data={chartData}
						key="mode"
						value="cost"
						cRange={chartData.map((d) => d.color)}
						c="color"
						props={{
							pie: {
								innerRadius: 60
							}
						}}
					>
						{#snippet tooltip()}
							<Chart.Tooltip hideLabel />
						{/snippet}
					</PieChart>
				</Chart.Container>

				<!-- Legend -->
				<div class="grid grid-cols-1 gap-2">
					{#each chartData as item}
						{@const config = chartConfig[item.mode as keyof typeof chartConfig]}
						<div class="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
							<div class="flex items-center gap-2">
								<div
									class="w-3 h-3 rounded"
									style="background-color: {item.color}"
								></div>
								<span class="font-medium">{item.description}</span>
							</div>
							<div class="flex items-center gap-4">
								<span class="text-muted-foreground">{item.sessions} sessions</span>
								<span class="font-semibold">{formatCurrency(item.cost)}</span>
								<span class="text-xs text-muted-foreground">({getPercentage(item.cost)}%)</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</CardContent>
</Card>
