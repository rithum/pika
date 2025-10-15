<svelte:options customElement={{ tag: 'full-forecast', shadow: 'none' }} />

<script lang="ts">
    import type { IWidgetMetadataAPI, PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import type { InvokeAgentAsComponentOptions } from 'pika-shared/types/chatbot/chatbot-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import Spinner from 'pika-ux/shadcn/spinner/spinner.svelte';

    interface DayForecast {
        date: string;
        condition: string;
        highF: number;
        lowF: number;
        description?: string;
        precipChance?: number;
    }

    interface ForecastResponse {
        location: string;
        forecast: DayForecast[];
    }

    interface CachedForecastData {
        response: ForecastResponse;
        timestamp: string;
    }

    let forecast: DayForecast[] | undefined = $state(undefined);
    let loading = $state(false);
    let error = $state('');
    let selectedCity = $state('San Francisco');
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
        if (widgetMetadataApi && loading) {
            widgetMetadataApi.updateAction('refresh', {
                disabled: true
            });
        } else if (widgetMetadataApi) {
            widgetMetadataApi.updateAction('refresh', {
                disabled: false
            });
        }
    });

    async function init() {
        context = await getPikaContext($host());
        initialized = true;

        // Check if location was passed in dataForWidget
        if (context.dataForWidget?.location) {
            selectedCity = context.dataForWidget.location;
        }

        // Register widget metadata
        widgetMetadataApi = context.chatAppState.getWidgetMetadataAPI('weather', 'full-forecast', context.instanceId, context.renderingContext);

        const actions: any[] = [
            {
                id: 'refresh',
                title: 'Refresh Forecast',
                iconSvg: await getIconSvg('refresh-cw', 'lucide'),
                callback: async () => {
                    await loadForecast();
                }
            }
        ];

        // Add dialog launch action if in spotlight
        if (context.renderingContext === 'spotlight') {
            actions.push({
                id: 'expand',
                title: 'Open in Dialog',
                iconSvg: await getIconSvg('maximize-2', 'lucide'),
                callback: async () => {
                    await context.chatAppState.renderTag('weather.full-forecast', 'dialog');
                }
            });
        }

        widgetMetadataApi.setMetadata({
            title: `5-Day Forecast - ${selectedCity}`,
            iconSvg: await getIconSvg('calendar-days', 'lucide'),
            iconColor: '#0ea5e9', // Sky blue
            actions
        });

        // If location was provided via dataForWidget, immediately load forecast
        if (context.dataForWidget?.location) {
            await loadForecast();
        } else {
            // Otherwise, load cached forecast data
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'full-forecast');
            const cachedData = await userWidgetData.getValue<CachedForecastData>('forecastData');

            if (cachedData) {
                lastRefreshTime = cachedData.timestamp;
                selectedCity = cachedData.response.location;
                forecast = cachedData.response.forecast;
            }
        }
    }

    async function loadForecast() {
        if (!context || loading) return;

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

            const response = await context.chatAppState.invokeAgentAsComponent<ForecastResponse>(
                'weather',
                'full-forecast',
                'get5dayForecast',
                `Get 5-day weather forecast for ${selectedCity}`,
                options
            );

            // Save to component values
            const timestamp = new Date().toISOString();
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'full-forecast');
            await userWidgetData.setValue('forecastData', {
                response,
                timestamp
            } as CachedForecastData);
            lastRefreshTime = timestamp;

            selectedCity = response.location;
            forecast = response.forecast;
            widgetMetadataApi?.updateTitle(`5-Day Forecast - ${selectedCity}`);
            thinkingStatus = '';
            toolStatus = '';
        } catch (e) {
            console.error('Error loading forecast:', e);
            error = 'Failed to load forecast';
        } finally {
            loading = false;
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

    function getTempColor(temp: number): string {
        if (temp >= 80) return 'text-red-600';
        if (temp >= 60) return 'text-orange-600';
        if (temp >= 40) return 'text-blue-600';
        return 'text-cyan-600';
    }

    function getDayOfWeek(dateString: string): string {
        const date = new Date(dateString);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[date.getDay()];
    }
</script>

<div class="h-full w-full flex flex-col">
    {#if loading}
        <div class="px-3 py-3 space-y-2">
            <div class="flex items-center justify-center gap-2 text-gray-600 text-sm">
                <Spinner class="h-3.5 w-3.5 text-blue-500" />
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
    {:else if !forecast || forecast.length === 0}
        <div class="flex-1 flex items-center justify-center px-4">
            <div class="text-center">
                <div class="text-5xl mb-2">📅</div>
                <p class="text-sm font-medium text-gray-700">Click refresh to load 5-day forecast</p>
                <p class="text-xs text-gray-500 mt-1">for {selectedCity}</p>
            </div>
        </div>
    {:else}
        <div class="flex-1 overflow-auto px-3 py-3">
            <div class="grid grid-cols-1 gap-2 {context?.renderingContext === 'dialog' || context?.renderingContext === 'canvas' ? 'sm:grid-cols-2 lg:grid-cols-3' : ''}">
                {#each forecast as day}
                    <div class="bg-gradient-to-br from-sky-50 to-blue-50 border-2 border-sky-200 rounded-xl p-3">
                        <div class="flex items-center justify-between mb-2">
                            <div>
                                <div class="text-sm font-bold text-gray-900">{getDayOfWeek(day.date)}</div>
                                <div class="text-xs text-gray-500">{day.date}</div>
                            </div>
                            <span class="text-3xl">{getConditionEmoji(day.condition)}</span>
                        </div>
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-baseline gap-1">
                                <span class="text-2xl font-bold {getTempColor(day.highF)}">{Math.round(day.highF)}°</span>
                                <span class="text-sm text-gray-500">/{Math.round(day.lowF)}°</span>
                            </div>
                        </div>
                        <p class="text-xs text-gray-600">{day.condition}</p>
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
