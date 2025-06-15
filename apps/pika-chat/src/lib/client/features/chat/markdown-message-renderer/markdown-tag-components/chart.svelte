<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import { onMount, onDestroy } from 'svelte';
    import { ChatAppState } from '../../chat-app.state.svelte';

    interface Props {
        rawTagContent: string;
        appState: AppState;
        chatAppState: ChatAppState;
    }

    let { rawTagContent, appState }: Props = $props();

    let canvasElement: HTMLCanvasElement | undefined = $state();
    let chart: any = null;
    let error = $state<string | null>(null);

    async function initChart() {
        try {
            // Parse the JSON content
            const chartConfig = JSON.parse(rawTagContent);

            // Dynamically import Chart.js
            const { Chart, registerables } = await import('chart.js');
            Chart.register(...registerables);

            // Create the chart
            if (canvasElement) {
                chart = new Chart(canvasElement, {
                    ...chartConfig,
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        ...chartConfig.options,
                    },
                });
            }
        } catch (err) {
            console.error('Failed to render chart:', err);
            error = err instanceof Error ? err.message : 'Failed to render chart';
        }
    }

    onMount(() => {
        initChart();
    });

    onDestroy(() => {
        if (chart) {
            chart.destroy();
        }
    });
</script>

<div class="chart-container my-4">
    {#if error}
        <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <p class="font-semibold">Chart Error</p>
            <p class="text-sm">{error}</p>
        </div>
    {:else}
        <div class="bg-white rounded-lg shadow-sm p-4">
            <canvas bind:this={canvasElement}></canvas>
        </div>
    {/if}
</div>

<style>
    .chart-container {
        max-width: 100%;
        position: relative;
    }

    canvas {
        max-height: 400px;
    }
</style>
