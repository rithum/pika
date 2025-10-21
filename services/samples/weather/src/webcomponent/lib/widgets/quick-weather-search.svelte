<svelte:options customElement={{ tag: 'quick-weather-search', shadow: 'none' }} />

<script lang="ts">
    import type { IWidgetMetadataAPI, PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import type { InvokeAgentAsComponentOptions, WidgetAction } from 'pika-shared/types/chatbot/chatbot-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import Input from 'pika-ux/shadcn/input/input.svelte';
    import Spinner from 'pika-ux/shadcn/spinner/spinner.svelte';
    import SearchIcon from '$icons/lucide/search';

    interface QuickWeatherResponse {
        location: string;
        tempF: number;
        tempC: number;
        condition: string;
        humidity?: number;
        windSpeed?: number;
    }

    interface CachedSearchData {
        response: QuickWeatherResponse;
        timestamp: string;
        searchTerm: string;
    }

    let searchCity = $state('');
    let weatherData = $state<QuickWeatherResponse | undefined>(undefined);
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
            addRefreshAction();
        } else if (wmd && ss) {
            wmd.removeAction('search');
        }
    });

    async function addRefreshAction() {
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
        widgetMetadataApi = context.chatAppState.getWidgetMetadataAPI('weather', 'quick-weather-search', context.instanceId, context.renderingContext);

        widgetMetadataApi.setMetadata({
            title: 'Quick Weather Search',
            iconSvg: await getIconSvg('search', 'lucide'),
            iconColor: '#10b981', // Green
            actions: []
        });

        // Load last search result (but don't auto-fetch)
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'quick-weather-search');
        const cachedData = await userWidgetData.getValue<CachedSearchData>('searchData');

        if (cachedData) {
            lastRefreshTime = cachedData.timestamp;
            searchCity = cachedData.searchTerm;
            weatherData = cachedData.response;
        }

        if (weatherData) {
            showSearch = false;
        }
    }

    async function searchWeather() {
        if (!context || loading || !searchCity.trim()) return;

        loading = true;
        error = '';
        weatherData = undefined;
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

            const response = await context.chatAppState.invokeAgentAsComponent<QuickWeatherResponse>(
                'weather',
                'quick-weather-search',
                'quickLookup',
                `Get current weather conditions for ${searchCity}`,
                options
            );

            // Save to component values
            const timestamp = new Date().toISOString();
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'quick-weather-search');
            await userWidgetData.setValue('searchData', {
                response,
                timestamp,
                searchTerm: searchCity
            } as CachedSearchData);
            lastRefreshTime = timestamp;

            weatherData = response;
            thinkingStatus = '';
            toolStatus = '';
        } catch (e) {
            console.error('Error searching weather:', e);
            error = 'Failed to find weather data';
        } finally {
            loading = false;
        }
    }

    function handleKeypress(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            searchWeather();
        }
    }

    function getConditionEmoji(condition: string): string {
        const lower = condition.toLowerCase();
        if (lower.includes('sun') || lower.includes('clear')) return '☀️';
        if (lower.includes('cloud')) return '☁️';
        if (lower.includes('rain') || lower.includes('shower')) return '🌧️';
        if (lower.includes('snow')) return '❄️';
        if (lower.includes('storm') || lower.includes('thunder')) return '⛈️';
        return '🌤️';
    }
</script>

<div class="h-full w-full flex flex-col">
    {#if showSearch}
        <div class="px-3 py-3">
            <div class="flex gap-2">
                <Input type="text" bind:value={searchCity} onkeypress={handleKeypress} placeholder="Enter city name..." disabled={loading} class="flex-1 text-sm" />
                <Button variant="outline" size="icon" onclick={searchWeather} disabled={loading || !searchCity.trim()}>
                    <SearchIcon class="h-4 w-4" />
                </Button>
            </div>
        </div>
    {/if}

    <div class="flex-1 overflow-auto px-3 pt-3 pb-3">
        {#if loading}
            <div class="space-y-2">
                <div class="flex items-center justify-center gap-2 text-gray-600 text-sm">
                    <Spinner class="h-3.5 w-3.5 text-green-500" />
                    <span>Searching...</span>
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
        {:else if weatherData}
            <div class="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4">
                <div class="flex items-start justify-between mb-3">
                    <div>
                        <h4 class="text-base font-bold text-gray-900 m-0">{weatherData.location}</h4>
                        <p class="text-xs text-gray-500 mt-0.5 m-0">{weatherData.condition}</p>
                    </div>
                    <span class="text-3xl">{getConditionEmoji(weatherData.condition)}</span>
                </div>

                <div class="flex items-baseline gap-2 mb-3">
                    <span class="text-2xl font-bold text-green-700">{Math.round(weatherData.tempF)}°</span>
                    <span class="text-lg text-gray-500">{Math.round(weatherData.tempC)}°C</span>
                </div>

                {#if weatherData.humidity || weatherData.windSpeed}
                    <div class="flex gap-4 text-sm text-gray-600 pt-2 border-t border-green-200">
                        {#if weatherData.humidity}
                            <div class="flex items-center gap-1">
                                <span>💧</span>
                                <span>{weatherData.humidity}%</span>
                            </div>
                        {/if}
                        {#if weatherData.windSpeed}
                            <div class="flex items-center gap-1">
                                <span>💨</span>
                                <span>{weatherData.windSpeed} mph</span>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
            {#if lastRefreshTime}
                <div class="text-right w-full italic text-gray-400 pt-2" style="font-size: 0.55rem;">
                    Searched: {new Date(lastRefreshTime).toLocaleString()}
                </div>
            {/if}
        {/if}
    </div>
</div>
