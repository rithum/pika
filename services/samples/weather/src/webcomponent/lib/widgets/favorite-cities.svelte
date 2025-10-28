<svelte:options customElement={{ tag: 'favorite-cities', shadow: 'none' }} />

<script lang="ts">
    import type { IWidgetMetadataAPI, PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import type { InvokeAgentAsComponentOptions, WidgetAction, ContextSourceDef } from 'pika-shared/types/chatbot/chatbot-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import Spinner from 'pika-ux/shadcn/spinner/spinner.svelte';

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
        error?: string;
    }

    interface CachedWeatherData {
        response: WeatherDataResponse;
        timestamp: string;
    }

    const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    let cities: CityWeather[] = $state([]);
    let loading = $state(false);
    let error = $state('');
    let initialized = $state(false);
    let context = $state<PikaWCContext>() as PikaWCContext;
    let lastRefreshTime = $state<string | undefined>();
    let widgetMetadataApi = $state<IWidgetMetadataAPI | undefined>();
    let thinkingStatus = $state('');
    let toolStatus = $state('');

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    $effect(() => {
        if (widgetMetadataApi) {
            widgetMetadataApi.updateAction('refresh', {
                disabled: loading
            });
        }
    });

    async function init() {
        context = await getPikaContext($host());
        initialized = true;

        // Register widget metadata
        widgetMetadataApi = context.chatAppState.getWidgetMetadataAPI('weather', 'favorite-cities', context.instanceId, context.renderingContext);

        const actions: WidgetAction[] = [
            {
                id: 'refresh',
                title: 'Refresh Weather',
                iconSvg: await getIconSvg('refresh-cw', 'lucide'),
                callback: async () => {
                    await refreshWeather();
                }
            }
        ];

        // Add canvas launch action if in spotlight
        if (context.renderingContext === 'spotlight') {
            actions.push(
                {
                    id: 'expand',
                    title: 'Open in Canvas',
                    iconSvg: await getIconSvg('maximize-2', 'lucide'),
                    callback: async () => {
                        await context.chatAppState.renderTag('weather.favorite-cities', 'canvas');
                    }
                },
                {
                    id: 'fullscreen',
                    title: 'Open Full Screen',
                    iconSvg: await getIconSvg('maximize-2', 'lucide'),
                    callback: async () => {
                        await context.chatAppState.renderTag('weather.favorite-cities', 'dialog');
                    }
                }
            );
        }

        widgetMetadataApi.setMetadata({
            title: 'Favorite Cities',
            iconSvg: await getIconSvg('heart', 'lucide'),
            iconColor: '#ef4444',
            actions
        });

        try {
            // Get component values for this widget
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'favorite-cities');
            const storedCityNames = await userWidgetData.getValue<string[]>('cities');
            const cityNames = storedCityNames || ['San Francisco', 'New York', 'London'];

            // Initialize cities
            cities = cityNames.map((name) => ({ name }));

            // Load cached weather data
            const cachedData = await userWidgetData.getValue<CachedWeatherData>('weatherData');
            if (cachedData) {
                lastRefreshTime = cachedData.timestamp;
                if (typeof cachedData.response === 'string' && (cachedData.response as string).toLowerCase().includes('oops')) {
                    error = 'Failed to load favorite cities';
                    console.error('Favorite Cities bad data:', cachedData.response);
                } else {
                    // Apply cached weather to cities
                    cities = cities.map((city) => {
                        const weatherData =
                            cachedData.response && cachedData.response.locations
                                ? cachedData.response.locations.find((loc) => loc.location.toLowerCase().includes(city.name.toLowerCase()))
                                : undefined;
                        return {
                            ...city,
                            weather: weatherData,
                            error: weatherData ? undefined : undefined
                        };
                    });
                }

                // Check if data is stale (older than 1 hour)
                const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
                if (cacheAge > REFRESH_INTERVAL_MS) {
                    // Auto-refresh stale data
                    await refreshWeather();
                } else {
                    // Cached data is fresh - notify system that context is available
                    if (context && context.instanceId) {
                        context.chatAppState.updateWidgetContext(context.instanceId);
                    }
                }
            } else {
                // No cached data, fetch immediately (auto-load)
                await refreshWeather();
            }
        } catch (e) {
            error = 'Failed to load favorite cities';
            console.error('Init error:', e);
        }
    }

    async function refreshWeather() {
        if (!context || loading) return;

        loading = true;
        error = '';
        thinkingStatus = '';
        toolStatus = '';

        try {
            const cityNames = cities.map((c) => c.name).join(', ');

            const options: InvokeAgentAsComponentOptions = {
                source: 'component',
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

            const response = await context.chatAppState.invokeAgentAsComponent<WeatherDataResponse>(
                'weather',
                'favorite-cities',
                'getCurrentWeather',
                `Get current weather for: ${cityNames}`,
                options
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
                const weatherData = response && response.locations ? response.locations.find((loc) => loc.location.toLowerCase().includes(city.name.toLowerCase())) : undefined;
                return {
                    ...city,
                    weather: weatherData,
                    error: weatherData ? undefined : 'No data'
                };
            });

            // Notify system that context has changed
            if (context && context.instanceId) {
                context.chatAppState.updateWidgetContext(context.instanceId);
            }

            thinkingStatus = '';
            toolStatus = '';
        } catch (e) {
            console.error('Error fetching weather:', e);
            error = 'Failed to fetch weather';
        } finally {
            loading = false;
        }
    }

    function getConditionEmoji(temp: number): string {
        if (temp >= 80) return '☀️';
        if (temp >= 60) return '⛅';
        if (temp >= 40) return '☁️';
        return '🌧️';
    }

    /**
     * Provide context about favorite cities and their current weather to AI.
     * This context is added automatically and includes current temperature data.
     */
    export function getContextForLlm(): ContextSourceDef[] | undefined {
        // Only provide context if we have weather data
        if (!cities || cities.length === 0 || !cities.some((c) => c.weather)) {
            return undefined;
        }

        const citiesWithWeather = cities
            .filter((c) => c.weather)
            .map((c) => ({
                name: c.name,
                tempF: c.weather!.tempF,
                tempC: c.weather!.tempC,
                location: c.weather!.location
            }));

        if (citiesWithWeather.length === 0) {
            return undefined;
        }

        return [
            {
                sourceId: 'favorite-cities-weather',
                llmInclusionDescription: "Current weather conditions for the user's favorite cities including temperature in Fahrenheit and Celsius",
                origin: 'auto',
                lucideIconName: 'heart',
                title: 'Favorite Cities Weather',
                description: `${citiesWithWeather.length} cities`,
                data: {
                    cities: citiesWithWeather,
                    lastUpdated: lastRefreshTime
                },
                addAutomatically: true,
                maxAgeMs: 60 * 60 * 1000 // 1 hour - weather data becomes stale
            }
        ];
    }
</script>

<div class="h-full w-full flex flex-col">
    {#if loading}
        <div class="px-3 py-3 space-y-2">
            <div class="flex items-center justify-center gap-2 text-gray-600 text-sm">
                <Spinner class="h-3.5 w-3.5 text-red-500" />
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
        <p class="text-center p-6 text-red-500 text-sm">{error}</p>
    {:else if cities.length === 0}
        <p class="text-center p-6 text-gray-500 text-sm">Configure your favorite cities to see weather at a glance</p>
    {:else}
        <div class="flex-1 overflow-auto px-3 py-3">
            <div class="space-y-2">
                {#each cities as city}
                    <div class="flex items-center justify-between py-2.5 px-3 rounded-lg bg-gradient-to-r from-red-50 to-rose-50 border border-red-100">
                        <div class="flex items-center gap-3">
                            {#if city.weather}
                                <span class="text-xl">{getConditionEmoji(city.weather.tempF)}</span>
                            {/if}
                            <div>
                                <div class="text-sm font-semibold text-gray-800">{city.name}</div>
                                {#if city.weather}
                                    <div class="text-xs text-gray-500">
                                        {Math.round(city.weather.tempC)}°C
                                    </div>
                                {/if}
                            </div>
                        </div>
                        {#if city.weather}
                            <div class="text-right">
                                <div class="text-lg font-bold text-red-600">{Math.round(city.weather.tempF)}°F</div>
                            </div>
                        {:else if city.error}
                            <div class="text-xs text-red-500">{city.error}</div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
        {#if lastRefreshTime}
            <div class="px-3 pb-2 text-right w-full italic text-gray-400" style="font-size: 0.55rem;">
                Updated: {new Date(lastRefreshTime).toLocaleString()}
            </div>
        {/if}
    {/if}
</div>
