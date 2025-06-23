<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import { ChatAppState } from '../../chat-app.state.svelte';
    import type { ProcessedTagSegment } from '../segment-types';

    interface Props {
        segment: ProcessedTagSegment;
        appState: AppState;
        chatAppState: ChatAppState;
    }

    let { segment }: Props = $props();

    // Extract raw content from the segment
    let rawTagContent = $derived(segment.rawContent);

    let canvasElement: HTMLCanvasElement | undefined = $state();
    let chart: any = null;
    let error = $state<string | null>(null);

    // Show placeholder during streaming
    let showPlaceholder = $derived(segment.streamingStatus === 'streaming');
    let chartCanBeInitialized = $derived(segment.streamingStatus === 'completed');
    let chartErroredOut = $derived(segment.streamingStatus === 'error');

    // LOGGING: Track component state changes
    // $effect(() => {
    //     console.log('[CHART-RENDERER] Segment updated:', {
    //         segmentId: segment.id,
    //         streamingStatus: segment.streamingStatus,
    //         rawContentLength: rawTagContent.length,
    //         rawContentPreview: rawTagContent.slice(0, 100) + (rawTagContent.length > 100 ? '...' : ''),
    //         showPlaceholder,
    //         chartCanBeInitialized,
    //         chartErroredOut,
    //         hasChart: !!chart,
    //         hasCanvasElement: !!canvasElement
    //     });
    // });

    // LOGGING: Track when derived values change
    // $effect(() => {
    //     console.log('[CHART-RENDERER] Derived values changed:', {
    //         segmentId: segment.id,
    //         showPlaceholder,
    //         chartCanBeInitialized,
    //         chartErroredOut,
    //         rawContentLength: rawTagContent.length
    //     });
    // });

    async function initChart() {
        // console.log('[CHART-RENDERER] initChart called:', {
        //     segmentId: segment.id,
        //     showPlaceholder,
        //     rawContentLength: rawTagContent.length,
        //     hasCanvasElement: !!canvasElement,
        //     hasExistingChart: !!chart
        // });

        if (showPlaceholder) {
            // console.log('[CHART-RENDERER] Skipping chart init - still showing placeholder');
            return; // Don't initialize while streaming
        }
        
        try {
            // Parse the JSON content
            // console.log('[CHART-RENDERER] Parsing chart config:', {
            //     segmentId: segment.id,
            //     rawContent: rawTagContent
            // });
            const chartConfig = JSON.parse(rawTagContent);

            // Yield to browser for other renders
            await new Promise(resolve => requestAnimationFrame(resolve));

            // Dynamically import Chart.js
            const { Chart, registerables } = await import('chart.js');

            // Yield before chart creation
            await new Promise(resolve => requestAnimationFrame(resolve));

            Chart.register(...registerables);

            // Create the chart
            if (canvasElement) {
                // console.log('[CHART-RENDERER] Creating chart with config:', chartConfig);
                chart = new Chart(canvasElement, {
                    ...chartConfig,
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        ...chartConfig.options,
                    },
                });
                // console.log('[CHART-RENDERER] Chart created successfully:', {
                //     segmentId: segment.id,
                //     chartType: chartConfig.type
                // });
            } else {
                // console.warn('[CHART-RENDERER] Canvas element not available for chart creation');
            }
        } catch (err) {
            // console.error('[CHART-RENDERER] Failed to render chart:', {
            //     segmentId: segment.id,
            //     error: err,
            //     rawContent: rawTagContent
            // });
            error = err instanceof Error ? err.message : 'Failed to render chart';
        }
    }

    // This will happen on load and when state changes to cause the chart to render when it's ready
    $effect(() => {
        // Doing it this way so this effect is always run when the streaming status changes
        const theChartCanBeInitialized = chartCanBeInitialized;
        const dontHaveChartYet = !chart;
        const haveCanvasEl = !!canvasElement;
        
        // console.log('[CHART-RENDERER] Chart initialization effect triggered:', {
        //     segmentId: segment.id,
        //     theChartCanBeInitialized,
        //     dontHaveChartYet,
        //     haveCanvasEl,
        //     streamingStatus: segment.streamingStatus
        // });

        if (theChartCanBeInitialized && dontHaveChartYet && haveCanvasEl) {
            // console.log('[CHART-RENDERER] Conditions met - initializing chart');
            initChart();
        }
    });

    // This should only run when the component is unmounted
    $effect(() => {
        return () => {
            if (chart) {
                // console.log('[CHART-RENDERER] Cleaning up chart:', { segmentId: segment.id });
                chart.destroy();
            }
        };
    });

    // LOGGING: Track canvas element binding
    // $effect(() => {
    //     console.log('[CHART-RENDERER] Canvas element changed:', {
    //         segmentId: segment.id,
    //         hasCanvasElement: !!canvasElement
    //     });
    // });

    // LOGGING: Track component lifecycle and DOM state
    // $effect(() => {
    //     console.log('[CHART-RENDERER] 🔄 DOM State Check:', {
    //         segmentId: segment.id,
    //         showPlaceholder,
    //         streamingStatus: segment.streamingStatus,
    //         domElements: {
    //             placeholder: document.querySelector(`[data-chart-placeholder="${segment.id}"]`),
    //             canvas: document.querySelector(`[data-chart-canvas="${segment.id}"]`),
    //             error: document.querySelector(`[data-chart-error="${segment.id}"]`)
    //         },
    //         timestamp: new Date().toISOString()
    //     });
    // });
</script>

<div class="chart-container my-4 max-w-full relative">
    {#if showPlaceholder}
        <!-- LOGGING: Track when placeholder is shown -->
        <!-- {console.log('[CHART-RENDERER] 🔴 DOM: Rendering placeholder div for segment:', segment.id, {
            streamingStatus: segment.streamingStatus,
            rawContentLength: rawTagContent.length,
            showPlaceholder,
            timestamp: new Date().toISOString()
        })} -->
        <div 
            class="animate-pulse bg-gray-100 rounded-lg p-6 text-center text-gray-500"
            data-chart-placeholder={segment.id}
            data-streaming-status={segment.streamingStatus}
        >
            Loading chart...
        </div>
    {:else if error || chartErroredOut}
        <!-- LOGGING: Track when error is shown -->
        <!-- {console.log('[CHART-RENDERER] 🔴 DOM: Rendering error div for segment:', segment.id, { 
            error, 
            chartErroredOut,
            streamingStatus: segment.streamingStatus,
            timestamp: new Date().toISOString()
        })} -->
        <div 
            class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700"
            data-chart-error={segment.id}
            data-streaming-status={segment.streamingStatus}
        >
            <p class="font-semibold">Chart Error</p>
            <p class="text-sm">{error || 'An error occurred while rendering the chart.'}</p>
        </div>
    {:else}
        <!-- LOGGING: Track when chart canvas is shown -->
        <!-- {console.log('[CHART-RENDERER] 🟢 DOM: Rendering chart canvas for segment:', segment.id, { 
            rawContentLength: rawTagContent.length,
            streamingStatus: segment.streamingStatus,
            showPlaceholder,
            timestamp: new Date().toISOString()
        })} -->
        <div 
            class="bg-white rounded-lg shadow-sm p-4"
            data-chart-canvas={segment.id}
            data-streaming-status={segment.streamingStatus}
        >
            <canvas class="max-h-[400px]" bind:this={canvasElement}></canvas>
        </div>
    {/if}
</div>