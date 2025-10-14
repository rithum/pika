<svelte:options customElement={{ tag: 'quick-weather-search', shadow: 'none' }} />

<script lang="ts">
    import MessageSquare from '$icons/lucide/message-square';
    import Search from '$icons/lucide/search';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import Input from 'pika-ux/shadcn/input/input.svelte';

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
    let weatherData = $state<QuickWeatherResponse | null>(null);
    let loading = $state(false);
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
        context = await getPikaContext($host());
        initialized = true;

        // Register widget metadata
        const metadata = context.chatAppState.getWidgetMetadataAPI('weather', 'quick-weather-search', context.instanceId, context.renderingContext);

        metadata.setMetadata({
            title: 'Quick Weather Search',
            actions: [
                {
                    id: 'search',
                    title: 'Search',
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search-icon lucide-search"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>',
                    callback: async () => {
                        await searchWeather();
                    }
                }
            ]
        });

        // Load last search result (but don't auto-fetch)
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'quick-weather-search');
        const cachedData = await userWidgetData.getValue<CachedSearchData>('searchData');

        if (cachedData) {
            lastRefreshTime = cachedData.timestamp;
            searchCity = cachedData.searchTerm;
            weatherData = cachedData.response;
        }
    }

    async function searchWeather() {
        if (!context || loading || !searchCity.trim()) return;

        loading = true;
        error = '';
        weatherData = null;

        try {
            const response = await context.chatAppState.invokeAgentAsComponent<QuickWeatherResponse>(
                'weather',
                'quick-weather-search',
                'quickLookup',
                `Get current weather conditions for ${searchCity}`
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

    async function askForDetails() {
        if (!context || !weatherData) return;

        // This would start a chat conversation about the weather
        context.appState.showToast(`Starting chat about ${weatherData.location} weather...`, { type: 'info' });
    }
</script>

<div class="quick-weather-search">
    <div class="header-section">
        <h3 class="text-base font-semibold m-0">🔍 Quick Weather Search</h3>
        {#if lastRefreshTime}
            <span class="last-update">Last search: {new Date(lastRefreshTime).toLocaleTimeString()}</span>
        {/if}
    </div>

    <div class="search-bar">
        <Input type="text" bind:value={searchCity} onkeypress={handleKeypress} placeholder="Enter city name..." disabled={loading} class="flex-1" />
        <Button variant="outline" size="icon" onclick={searchWeather} disabled={loading || !searchCity.trim()}>
            <Search class="h-4 w-4" />
        </Button>
    </div>

    {#if loading}
        <p class="loading">Searching...</p>
    {:else if error}
        <p class="error">{error}</p>
    {:else if weatherData}
        <div class="weather-result">
            <h4>{weatherData.location}</h4>
            <div class="current-temp">
                <span class="temp-f">{Math.round(weatherData.tempF)}°F</span>
                <span class="temp-c">({Math.round(weatherData.tempC)}°C)</span>
            </div>
            <p class="condition">{weatherData.condition}</p>

            {#if weatherData.humidity || weatherData.windSpeed}
                <div class="additional-info">
                    {#if weatherData.humidity}
                        <span>💧 {weatherData.humidity}%</span>
                    {/if}
                    {#if weatherData.windSpeed}
                        <span>💨 {weatherData.windSpeed} mph</span>
                    {/if}
                </div>
            {/if}

            <Button variant="outline" size="sm" onclick={askForDetails} class="w-full">
                <MessageSquare class="h-3 w-3 mr-1" />
                Ask for Details
            </Button>
        </div>
    {:else}
        <p class="no-data">Search for a city to see weather</p>
    {/if}
</div>

<style>
    .quick-weather-search {
        padding: 0.75rem;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .header-section {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        margin-bottom: 0.75rem;
    }

    .last-update {
        font-size: 0.65rem;
        color: #6b7280;
    }

    .search-bar {
        display: flex;
        gap: 0.375rem;
        margin-bottom: 0.75rem;
    }

    .weather-result {
        padding: 1rem;
        background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
        border-radius: 6px;
        border: 2px solid #3b82f6;
    }

    .weather-result h4 {
        margin: 0 0 0.5rem 0;
        font-size: 1.125rem;
        color: #111827;
    }

    .current-temp {
        margin-bottom: 0.375rem;
    }

    .temp-f {
        font-size: 2rem;
        font-weight: bold;
        color: #1e40af;
    }

    .temp-c {
        font-size: 0.875rem;
        color: #6b7280;
        margin-left: 0.375rem;
    }

    .condition {
        margin: 0 0 0.75rem 0;
        font-size: 1rem;
        color: #374151;
        font-weight: 500;
    }

    .additional-info {
        display: flex;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
        font-size: 0.75rem;
        color: #6b7280;
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
