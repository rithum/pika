<script lang="ts">
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'pika-ux/shadcn/card';
	import { Skeleton } from 'pika-ux/shadcn/skeleton';
	import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
	import TrendingUp from '$icons/lucide/trending-up';
	import TrendingDown from '$icons/lucide/trending-down';

	interface Props {
		title: string;
		value: string | number;
		subtitle?: string;
		trend?: {
			value: number;
			direction: 'up' | 'down';
			label?: string;
		};
		loading?: boolean;
		helpText?: string;
		format?: 'currency' | 'number' | 'percentage' | 'none';
	}

	let {
		title,
		value,
		subtitle,
		trend,
		loading = false,
		helpText,
		format = 'number'
	}: Props = $props();

	// Format the value based on the format prop
	const formattedValue = $derived.by(() => {
		if (loading) return '';
		
		const numValue = typeof value === 'string' ? parseFloat(value) : value;
		
		switch (format) {
			case 'currency':
				return new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD',
					minimumFractionDigits: 2,
					maximumFractionDigits: 2
				}).format(numValue);
			
			case 'number':
				return new Intl.NumberFormat('en-US', {
					maximumFractionDigits: 0
				}).format(numValue);
			
			case 'percentage':
				return `${numValue.toFixed(1)}%`;
			
			case 'none':
			default:
				return String(value);
		}
	});

	const trendColor = $derived(trend ? (trend.direction === 'up' ? 'text-green-600' : 'text-red-600') : '');
	const TrendIcon = $derived(trend ? (trend.direction === 'up' ? TrendingUp : TrendingDown) : null);
</script>

<Card>
	<CardHeader class="pb-2">
		<div class="flex items-center justify-between">
			<CardTitle class="text-sm font-medium text-muted-foreground">
				{title}
			</CardTitle>
			{#if helpText}
				<PopupHelp popoverClasses="text-xs w-auto p-2 max-w-xs">
					{helpText}
				</PopupHelp>
			{/if}
		</div>
	</CardHeader>
	<CardContent>
		{#if loading}
			<Skeleton class="h-8 w-24 mb-1" />
			{#if subtitle || trend}
				<Skeleton class="h-4 w-32" />
			{/if}
		{:else}
			<div class="text-2xl font-bold">
				{formattedValue}
			</div>
			{#if subtitle || trend}
				<div class="flex items-center gap-2 mt-1">
					{#if trend}
						<div class="flex items-center gap-1 {trendColor} text-xs font-medium">
							{#if TrendIcon}
								<TrendIcon class="h-3 w-3" />
							{/if}
							{trend.value > 0 ? '+' : ''}{trend.value.toFixed(1)}%
							{#if trend.label}
								<span class="text-muted-foreground">{trend.label}</span>
							{/if}
						</div>
					{/if}
					{#if subtitle}
						<CardDescription class="text-xs">
							{subtitle}
						</CardDescription>
					{/if}
				</div>
			{/if}
		{/if}
	</CardContent>
</Card>

