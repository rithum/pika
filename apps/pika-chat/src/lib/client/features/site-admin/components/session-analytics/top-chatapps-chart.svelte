<script lang="ts">
	import type { AppState } from '$lib/client/app/app.state.svelte';
	import { getContext } from 'svelte';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'pika-ux/shadcn/card';
	import * as Chart from 'pika-ux/shadcn/chart';
	import * as ToggleGroup from 'pika-ux/shadcn/toggle-group';
	import { Skeleton } from 'pika-ux/shadcn/skeleton';
	import { BarChart } from 'layerchart';
	import { scaleBand } from 'd3-scale';

	const appState = getContext<AppState>('appState');
	const sessionAnalytics = appState.siteAdmin.sessionAnalytics;

	const analyticsData = $derived(sessionAnalytics.analyticsData);
	const loading = $derived(sessionAnalytics.isFetching);

	// Metric selection
	let selectedMetric = $state<'sessions' | 'users' | 'cost'>('sessions');

	// Transform and sort data based on selected metric
	const chartData = $derived.by(() => {
		if (!analyticsData?.topChatApps) return [];

		const sorted = [...analyticsData.topChatApps].sort((a, b) => {
			switch (selectedMetric) {
				case 'sessions':
					return b.sessionCount - a.sessionCount;
				case 'users':
					return b.uniqueUserCount - a.uniqueUserCount;
				case 'cost':
					return b.totalCost - a.totalCost;
				default:
					return 0;
			}
		});

		return sorted.slice(0, 10).map((chatApp) => ({
			chatAppId: chatApp.chatAppId,
			chatAppName: chatApp.chatAppName || chatApp.chatAppId,
			sessions: chatApp.sessionCount,
			users: chatApp.uniqueUserCount,
			cost: chatApp.totalCost
		}));
	});

	const chartConfig = {
		sessions: { label: 'Sessions', color: 'hsl(var(--chart-2))' },
		users: { label: 'Users', color: 'hsl(var(--chart-2))' },
		cost: { label: 'Cost', color: 'hsl(var(--chart-2))' }
	} satisfies Chart.ChartConfig;

	const metricTitle = $derived.by(() => {
		switch (selectedMetric) {
			case 'sessions': return 'by Sessions';
			case 'users': return 'by Users';
			case 'cost': return 'by Cost';
			default: return '';
		}
	});

	const formatValue = (value: number) => {
		if (selectedMetric === 'cost') {
			return new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: 'USD',
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}).format(value);
		}
		return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
	};

	function handleChatAppClick(chatAppId: string) {
		const currentIds = [...sessionAnalytics.selectedChatAppIds];
		if (!currentIds.includes(chatAppId)) {
			currentIds.push(chatAppId);
			sessionAnalytics.setChatApps(currentIds);
		}
	}
</script>

<Card>
	<CardHeader>
		<div class="flex items-center justify-between">
			<div>
				<CardTitle>Top Chat Apps {metricTitle}</CardTitle>
				<CardDescription>Click on a bar to filter by that chat app</CardDescription>
			</div>
			<ToggleGroup.Root variant="outline" type="single" size="sm" bind:value={selectedMetric}>
				<ToggleGroup.Item value="sessions">Sessions</ToggleGroup.Item>
				<ToggleGroup.Item value="users">Users</ToggleGroup.Item>
				<ToggleGroup.Item value="cost">Cost</ToggleGroup.Item>
			</ToggleGroup.Root>
		</div>
	</CardHeader>
	<CardContent>
		{#if loading}
			<Skeleton class="h-[400px] w-full" />
		{:else if !chartData || chartData.length === 0}
			<div class="flex items-center justify-center h-[400px] text-muted-foreground">
				No chat app data available
			</div>
		{:else}
			<Chart.Container config={chartConfig} class="h-[400px] w-full">
				<BarChart
					data={chartData}
					orientation="horizontal"
					yScale={scaleBand().padding(0.25)}
					y="chatAppName"
					series={[{ key: selectedMetric, label: chartConfig[selectedMetric].label, color: chartConfig[selectedMetric].color }]}
					padding={{ left: 120 }}
					grid={false}
					rule={false}
					axis="y"
					props={{
						bars: {
							stroke: 'none',
							radius: 5,
							insets: { left: 24 },
							rounded: 'all',
							onclick: (e: any) => {
								const chatApp = chartData.find((d) => d.chatAppName === e.data.chatAppName);
								if (chatApp) {
									handleChatAppClick(chatApp.chatAppId);
								}
							}
						},
						highlight: { area: { fill: 'none' } },
						yAxis: { 
							format: (d: string) => d.length > 20 ? d.slice(0, 17) + '...' : d 
						},
						xAxis: {
							format: (d: number) => formatValue(d)
						}
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip hideLabel />
					{/snippet}
				</BarChart>
			</Chart.Container>
		{/if}
	</CardContent>
</Card>
