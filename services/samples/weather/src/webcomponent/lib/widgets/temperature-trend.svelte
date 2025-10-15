<svelte:options customElement={{ tag: 'temperature-trend', shadow: 'none' }} />

<script lang="ts">
    import type { IWidgetMetadataAPI, PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import type { InvokeAgentAsComponentOptions } from 'pika-shared/types/chatbot/chatbot-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import Input from 'pika-ux/shadcn/input/input.svelte';
    import Spinner from 'pika-ux/shadcn/spinner/spinner.svelte';
    import SearchIcon from '$icons/lucide/search';

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

    let searchCity = $state('');
    let location = $state('');
    let temps: number[] = $state([]);
    let hours: string[] = $state([]);
    let highF = $state(0);
    let lowF = $state(0);
    let loading = $state(false);
    let error = $state('');
    let initialized = $state(false);
    let context = $state<PikaWCContext>() as PikaWCContext;
    let lastRefreshTime = $state<string | undefined>();
    let widgetMetadataApi = $state<IWidgetMetadataAPI | undefined>();
    let thinkingStatus = $state('');
    let toolStatus = $state('');
    let showSearch = $state(true);

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    $effect(() => {
        const wmd = widgetMetadataApi;
        const ss = showSearch;
        if (wmd && !ss) {
            addSearchAction();
        } else if (wmd && ss) {
            wmd.removeAction('search');
        }
    });

    async function addSearchAction() {
        widgetMetadataApi?.addAction({
            id: 'search',
            title: 'Search',
            iconSvg: await getIconSvg('search', 'lucide'),
            callback: async () => {
                showSearch = true;
            }
        });
    }

    async function init() {
        context = await getPikaContext($host());
        initialized = true;

        // Register widget metadata
        widgetMetadataApi = context.chatAppState.getWidgetMetadataAPI('weather', 'temperature-trend', context.instanceId, context.renderingContext);

        widgetMetadataApi.setMetadata({
            title: 'Temp Trend',
            iconSvg: await getIconSvg('activity', 'lucide'),
            iconColor: '#f59e0b', // Amber/Orange
            actions: []
        });

        // Load cached trend data
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'temperature-trend');
        const cachedData = await userWidgetData.getValue<CachedTrendData>('trendData');

        if (cachedData) {
            if (typeof cachedData.response === 'string' && (cachedData.response as string).toLowerCase().includes('oops')) {
                error = 'Failed to load temperature trend';
                console.error('Temperature Trend bad data:', cachedData.response);
            } else {
                lastRefreshTime = cachedData.timestamp;
                location = cachedData.location;
                searchCity = cachedData.location;
                applyTrendData(cachedData.response);
                showSearch = false;

                // Check if data is stale (older than 1 hour)
                const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
                if (cacheAge > REFRESH_INTERVAL_MS) {
                    // Auto-refresh stale data
                    await fetchTrend();
                }
            }
        }
    }

    function applyTrendData(response: TemperatureTrendResponse) {
        if (!response || !response.dataPoints) return;
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
    }

    async function fetchTrend() {
        if (!context || loading || !searchCity || !searchCity.trim()) return;

        loading = true;
        error = '';
        thinkingStatus = '';
        toolStatus = '';

        try {
            const options: InvokeAgentAsComponentOptions = {
                onThinking: (text: string) => {
                    // Skip semantic-directives messages
                    if (text.startsWith('{"type":"semantic-directives"')) return;
                    thinkingStatus = text.length > 70 ? text.substring(0, 70) + '...' : text;
                },
                onToolCall: (call: { name: string; params: any }) => {
                    const funcName = call.name.split('__')[1] || call.name;
                    toolStatus = `Calling AI tool: ${funcName}...`;
                }
            };

            const response = await context.chatAppState.invokeAgentAsComponent<TemperatureTrendResponse>(
                'weather',
                'temperature-trend',
                'get24hTrend',
                `Get 24-hour temperature trend for ${searchCity}`,
                options
            );

            // Save to component values
            const timestamp = new Date().toISOString();
            location = response.location;
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'temperature-trend');
            await userWidgetData.setValue('trendData', {
                response,
                timestamp,
                location
            } as CachedTrendData);
            lastRefreshTime = timestamp;

            applyTrendData(response);
            thinkingStatus = '';
            toolStatus = '';
            showSearch = false;
        } catch (e) {
            console.error('Error fetching temperature trend:', e);
            error = 'Failed to fetch temperature trend';
        } finally {
            loading = false;
        }
    }

    function handleKeypress(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            fetchTrend();
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

    function getBarColor(temp: number): string {
        if (temp >= 80) return 'from-orange-500 to-red-500';
        if (temp >= 60) return 'from-amber-400 to-orange-500';
        if (temp >= 40) return 'from-blue-400 to-indigo-500';
        return 'from-cyan-400 to-blue-500';
    }
</script>

<div class="h-full w-full flex flex-col">
    {#if showSearch}
        <div class="px-3 py-2.5">
            <div class="flex gap-2">
                <Input type="text" bind:value={searchCity} onkeypress={handleKeypress} placeholder="Enter city name..." disabled={loading} class="flex-1 text-sm" />
                <Button variant="outline" size="icon" onclick={fetchTrend} disabled={loading || !searchCity || !searchCity.trim()}>
                    <SearchIcon class="h-4 w-4" />
                </Button>
            </div>
        </div>
    {/if}

    <div class="flex-1 overflow-hidden px-3 {showSearch ? 'pt-0' : 'pt-2.5'} pb-2">
        {#if loading}
            <div class="space-y-2">
                <div class="flex items-center justify-center gap-2 text-gray-600 text-sm">
                    <Spinner class="h-3.5 w-3.5 text-amber-500" />
                    <span>One sec, AI is on it...</span>
                </div>
                {#if thinkingStatus}
                    <div class="space-y-1.5 text-xs text-gray-500 pt-2">
                        <p class="font-bold">AI Reasoning</p>
                        <p class="text-indigo-600 italic">{thinkingStatus}</p>
                    </div>
                {/if}
                {#if toolStatus}
                    <div class="space-y-1.5 text-xs text-gray-500 pt-2">
                        <p class="font-bold">AI Tooling</p>
                        <p class="text-emerald-600 italic">{toolStatus}</p>
                    </div>
                {/if}
            </div>
        {:else if error}
            <p class="text-center py-6 text-red-500 text-sm">{error}</p>
        {:else if temps.length === 0}
            <p class="text-center py-6 text-gray-500 text-sm">Enter a city to view temperature trend</p>
        {:else}
            <div class="h-full flex flex-col">
                <div class="text-center text-xs text-gray-500 mt-2">
                    <span class="font-bold">{location}</span> • 24-hour trend
                </div>

                <div class="flex gap-2 mb-2 mt-4">
                    <div class="flex-1 bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg p-2 border border-orange-200">
                        <div class="text-sm text-gray-600 mb-0.5">High</div>
                        <div class="text-sm font-bold text-orange-600">{Math.round(highF)}°F</div>
                    </div>
                    <div class="flex-1 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-2 border border-blue-200">
                        <div class="text-sm text-gray-600 mb-0.5">Low</div>
                        <div class="text-sm font-bold text-blue-600">{Math.round(lowF)}°F</div>
                    </div>
                </div>

                <div class="relative h-24 text-xs flex items-end justify-between gap-0.5 px-0.5 mt-4">
                    {#each temps as temp, i}
                        {@const height = getBarHeight(temp)}
                        {@const colorClass = getBarColor(temp)}
                        <div class="flex-1 flex flex-col items-center justify-end h-full">
                            <div class="w-full bg-gradient-to-t {colorClass} rounded-t-sm relative" style="height: {height}%;">
                                {#if i % 4 === 0}
                                    <span class="absolute -top-3 left-1/2 -translate-x-1/2 text-[0.5rem] font-semibold text-gray-700 whitespace-nowrap">{Math.round(temp)}°</span>
                                {/if}
                            </div>
                            {#if i % 4 === 0}
                                <span class="text-[0.5rem] text-gray-500 mt-0.5">{hours[i]}</span>
                            {/if}
                        </div>
                    {/each}
                </div>

                {#if lastRefreshTime}
                    <div class="text-right w-full italic text-gray-400 mt-1" style="font-size: 0.5rem;">
                        Updated: {new Date(lastRefreshTime).toLocaleString()}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
