<svelte:options customElement="temperature-trend" />

<script lang="ts">
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import RefreshCw from '$icons/lucide/refresh-cw';
    import MapPin from '$icons/lucide/map-pin';

    interface TemperatureDataPoint {
        timestamp: string;
        tempF: number;
    }

    interface TemperatureTrendResponse {
        location: string;
        dataPoints: TemperatureDataPoint[];
        highF: number;
        lowF: number;
    }

    interface CachedTrendData {
        response: TemperatureTrendResponse;
        timestamp: string;
        location: string;
    }

    const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    let location = $state('San Francisco');
    let temps: number[] = $state([]);
    let hours: string[] = $state([]);
    let highF = $state(0);
    let lowF = $state(0);
    let loading = $state(true);
    let error = $state('');
    let initialized = $state(false);
    let context = $state<PikaWCContext>() as PikaWCContext;
    let lastRefreshTime = $state<string>('');

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    async function init() {
        // $host() is svelte's way to get the host element of the web component
        context = await getPikaContext($host());
        initialized = true;

        // Register widget metadata
        const metadata = context.chatAppState.getWidgetMetadataAPI('weather', 'temperature-trend', context.instanceId, context.renderingContext);

        metadata.setMetadata({
            title: `Temperature Trend - ${location}`,
            actions: [
                {
                    id: 'refresh',
                    title: 'Refresh Data',
                    // refresh-cw icon svg
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw-icon lucide-refresh-cw"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
                    callback: async () => {
                        await fetchTrend();
                    }
                }
            ]
        });

        // Load cached trend data
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'temperature-trend');
        const cachedData = await userWidgetData.getValue<CachedTrendData>('trendData');

        if (cachedData) {
            lastRefreshTime = cachedData.timestamp;
            location = cachedData.location;
            temps = cachedData.response.dataPoints.map((dp) => dp.tempF);
            hours = cachedData.response.dataPoints.map((dp) => {
                const date = new Date(dp.timestamp);
                const hour = date.getHours();
                const ampm = hour >= 12 ? 'pm' : 'am';
                const displayHour = hour % 12 || 12;
                return `${displayHour}${ampm}`;
            });
            highF = cachedData.response.highF;
            lowF = cachedData.response.lowF;

            // Check if data is stale (older than 1 hour)
            const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
            if (cacheAge > REFRESH_INTERVAL_MS) {
                // Auto-refresh stale data
                await fetchTrend();
            }
        } else {
            // No cached data, fetch immediately
            await fetchTrend();
        }

        loading = false;
    }

    async function fetchTrend() {
        if (!context) return;

        loading = true;
        error = '';

        try {
            const response = await context.chatAppState.invokeAgentAsComponent<TemperatureTrendResponse>(
                'weather',
                'temperature-trend',
                'get24hTrend',
                `Get 24-hour temperature trend for ${location}`
            );

            // Save to component values
            const timestamp = new Date().toISOString();
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'temperature-trend');
            await userWidgetData.setValue('trendData', {
                response,
                timestamp,
                location
            } as CachedTrendData);
            lastRefreshTime = timestamp;

            // Extract temperatures and format times
            temps = response.dataPoints.map((dp) => dp.tempF);
            hours = response.dataPoints.map((dp) => {
                const date = new Date(dp.timestamp);
                const hour = date.getHours();
                const ampm = hour >= 12 ? 'pm' : 'am';
                const displayHour = hour % 12 || 12;
                return `${displayHour}${ampm}`;
            });
            highF = response.highF;
            lowF = response.lowF;
        } catch (e) {
            console.error('Error fetching temperature trend:', e);
            error = 'Failed to fetch temperature trend';
        } finally {
            loading = false;
        }
    }

    function getBarHeight(temp: number) {
        if (temps.length === 0) return 0;
        const min = Math.min(...temps);
        const max = Math.max(...temps);
        const range = max - min;
        if (range === 0) return 50; // All temps the same
        return ((temp - min) / range) * 100;
    }

    function changeLocation() {
        const newLocation = prompt('Enter city name:', location);
        if (newLocation) {
            location = newLocation;
        }
    }
</script>

<div class="temperature-trend">
    <div class="header">
        <div class="title">
            <h3 class="text-base font-semibold m-0">🌡️ Temperature Trend (24h)</h3>
            {#if lastRefreshTime}
                <span class="last-update">Updated {new Date(lastRefreshTime).toLocaleTimeString()}</span>
            {/if}
            <Button variant="ghost" size="sm" onclick={changeLocation} disabled={loading} class="h-7 px-2">
                <MapPin class="h-3 w-3 mr-1" />
                {location}
            </Button>
        </div>
        <Button variant="outline" size="sm" onclick={fetchTrend} disabled={loading}>
            <RefreshCw class="h-3 w-3 mr-1" />
            {loading ? 'Loading...' : 'Refresh'}
        </Button>
    </div>

    {#if loading}
        <p class="loading">Loading data...</p>
    {:else if error}
        <p class="error">{error}</p>
    {:else if temps.length === 0}
        <p class="no-data">Click Refresh to load data</p>
    {:else}
        <div class="stats">
            <span class="stat">High: <strong>{Math.round(highF)}°F</strong></span>
            <span class="stat">Low: <strong>{Math.round(lowF)}°F</strong></span>
        </div>
        <div class="chart">
            {#each temps as temp, i}
                <div class="bar-container">
                    <div class="bar" style="height: {getBarHeight(temp)}%">
                        <span class="temp-label">{Math.round(temp)}°</span>
                    </div>
                    <span class="hour-label">{hours[i]}</span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .temperature-trend {
        padding: 0.75rem;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
    }

    .title {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
    }

    .last-update {
        font-size: 0.65rem;
        color: #6b7280;
    }

    .stats {
        display: flex;
        gap: 1rem;
        margin-bottom: 0.75rem;
        padding: 0.5rem;
        background: #f9fafb;
        border-radius: 4px;
    }

    .stat {
        font-size: 0.75rem;
        color: #6b7280;
    }

    .stat strong {
        color: #111827;
        font-size: 0.875rem;
    }

    .chart {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        height: 120px;
        padding: 0.75rem 0;
    }

    .bar-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
        height: 100%;
        position: relative;
    }

    .bar {
        width: 80%;
        background: linear-gradient(to top, #3b82f6, #60a5fa);
        border-radius: 3px 3px 0 0;
        position: relative;
        min-height: 20%;
        display: flex;
        align-items: flex-start;
        justify-content: center;
    }

    .temp-label {
        font-size: 0.625rem;
        font-weight: bold;
        color: #1e40af;
        margin-top: 0.125rem;
    }

    .hour-label {
        font-size: 0.625rem;
        color: #6b7280;
        margin-top: 0.375rem;
    }

    .loading,
    .no-data,
    .error {
        text-align: center;
        padding: 1.5rem;
        color: #6b7280;
        font-size: 0.875rem;
    }

    .error {
        color: #ef4444;
    }
</style>
