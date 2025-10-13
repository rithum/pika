<svelte:options customElement="favorite-cities" />

<script lang="ts">
    import Plus from '$icons/lucide/plus';
    import RefreshCw from '$icons/lucide/refresh-cw';
    import X from '$icons/lucide/x';
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import Button from 'pika-ux/shadcn/button/button.svelte';

    interface WeatherData {
        location: string;
        lon: number;
        lat: number;
        tempF: number;
        tempC: number;
        timestamp: string;
    }

    interface WeatherDataResponse {
        locations: WeatherData[];
    }

    interface CityWeather {
        name: string;
        weather?: WeatherData;
        loading: boolean;
        error?: string;
    }

    interface CachedWeatherData {
        response: WeatherDataResponse;
        timestamp: string;
    }

    const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    let cities: CityWeather[] = $state([]);
    let loading = $state(true);
    let error = $state('');
    let initialized = $state(false);
    let context = $state<PikaWCContext>() as PikaWCContext;
    let fetchingWeather = $state(false);
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
        const metadata = context.chatAppState.getWidgetMetadataAPI('weather', 'favorite-cities', context.instanceId, context.renderingContext);

        metadata.setMetadata({
            title: 'Favorite Cities',
            actions: [
                {
                    id: 'refresh',
                    title: 'Refresh Weather',
                    // refresh-cw icon svg
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw-icon lucide-refresh-cw"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
                    disabled: fetchingWeather,
                    callback: async () => {
                        await refreshWeather();
                    }
                }
            ]
        });

        try {
            // Get component values for this widget
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'favorite-cities');
            const storedCityNames = await userWidgetData.getValue<string[]>('cities');
            const cityNames = storedCityNames || ['San Francisco', 'New York', 'London'];

            // Initialize cities with loading state
            cities = cityNames.map((name) => ({ name, loading: false }));

            // Load cached weather data
            const cachedData = await userWidgetData.getValue<CachedWeatherData>('weatherData');
            if (cachedData) {
                lastRefreshTime = cachedData.timestamp;
                // Apply cached weather to cities
                cities = cities.map((city) => {
                    const weatherData = cachedData.response.locations.find((loc) => loc.location.toLowerCase().includes(city.name.toLowerCase()));
                    return {
                        ...city,
                        weather: weatherData,
                        error: weatherData ? undefined : undefined
                    };
                });

                // Check if data is stale (older than 1 hour)
                const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
                if (cacheAge > REFRESH_INTERVAL_MS) {
                    // Auto-refresh stale data
                    await refreshWeather();
                }
            } else {
                // No cached data, fetch immediately
                await refreshWeather();
            }

            loading = false;
        } catch (e) {
            error = 'Failed to load favorite cities';
            loading = false;
        }
    }

    async function refreshWeather() {
        if (!context || fetchingWeather) return;

        fetchingWeather = true;
        const cityNames = cities.map((c) => c.name).join(', ');

        try {
            const response = await context.chatAppState.invokeAgentAsComponent<WeatherDataResponse>(
                'weather',
                'favorite-cities',
                'getCurrentWeather',
                `Get current weather for: ${cityNames}`
            );

            // Save to component values
            const timestamp = new Date().toISOString();
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'favorite-cities');
            await userWidgetData.setValue('weatherData', {
                response,
                timestamp
            } as CachedWeatherData);
            lastRefreshTime = timestamp;

            // Update cities with weather data
            cities = cities.map((city) => {
                const weatherData = response.locations.find((loc) => loc.location.toLowerCase().includes(city.name.toLowerCase()));
                return {
                    ...city,
                    weather: weatherData,
                    loading: false,
                    error: weatherData ? undefined : 'No data'
                };
            });
        } catch (e) {
            console.error('Error fetching weather:', e);
            cities = cities.map((city) => ({ ...city, loading: false, error: 'Failed to fetch' }));
        } finally {
            fetchingWeather = false;
        }
    }

    async function addCity() {
        if (!context) return;
        const cityName = prompt('Enter city name:');
        if (cityName) {
            const newCities = [...cities, { name: cityName, loading: false }];
            cities = newCities;

            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'favorite-cities');
            await userWidgetData.setValue(
                'cities',
                newCities.map((c) => c.name)
            );
        }
    }

    async function removeCity(index: number) {
        if (!context) return;
        cities = cities.filter((_, i) => i !== index);
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'favorite-cities');
        await userWidgetData.setValue(
            'cities',
            cities.map((c) => c.name)
        );
    }
</script>

<div class="favorite-cities">
    <div class="header">
        <h3 class="text-base font-semibold m-0">My Favorite Cities</h3>
        <div class="actions">
            {#if lastRefreshTime}
                <span class="last-update">Updated {new Date(lastRefreshTime).toLocaleTimeString()}</span>
            {/if}
            <Button variant="outline" size="sm" onclick={refreshWeather} disabled={fetchingWeather}>
                <RefreshCw class="h-3 w-3 mr-1" />
                {fetchingWeather ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button variant="outline" size="sm" onclick={addCity}>
                <Plus class="h-3 w-3 mr-1" />
                Add
            </Button>
        </div>
    </div>

    {#if loading}
        <p class="loading">Loading...</p>
    {:else if error}
        <p class="error">{error}</p>
    {:else}
        <ul class="cities-list">
            {#each cities as city, i}
                <li class="city-item">
                    <div class="city-info">
                        <span class="city-name">{city.name}</span>
                        {#if city.weather}
                            <span class="temp">{Math.round(city.weather.tempF)}°F</span>
                        {:else if city.error}
                            <span class="error-text">{city.error}</span>
                        {/if}
                    </div>
                    <Button variant="ghost" size="icon" onclick={() => removeCity(i)} class="h-6 w-6">
                        <X class="h-4 w-4" />
                    </Button>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .favorite-cities {
        padding: 0.75rem;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }

    .actions {
        display: flex;
        gap: 0.25rem;
        align-items: center;
    }

    .last-update {
        font-size: 0.65rem;
        color: #6b7280;
        margin-right: 0.5rem;
    }

    .cities-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .city-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        border-bottom: 1px solid #e5e7eb;
    }

    .city-item:last-child {
        border-bottom: none;
    }

    .city-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex: 1;
    }

    .city-name {
        font-size: 0.875rem;
        color: #374151;
        font-weight: 500;
    }

    .temp {
        font-size: 1rem;
        color: #3b82f6;
        font-weight: 600;
    }

    .error-text {
        font-size: 0.75rem;
        color: #ef4444;
    }

    .loading,
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
