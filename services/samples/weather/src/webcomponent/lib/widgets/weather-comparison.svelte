<svelte:options customElement="weather-comparison" />

<script lang="ts">
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import type { InvokeAgentAsComponentOptions } from 'pika-shared/types/chatbot/chatbot-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import Shuffle from '$icons/lucide/shuffle';
    import MessageSquare from '$icons/lucide/message-square';

    interface CityWeather {
        location: string;
        tempF: number;
        tempC: number;
        condition?: string;
    }

    interface ComparisonResponse {
        cities: CityWeather[];
    }

    interface CachedComparisonData {
        response: ComparisonResponse;
        timestamp: string;
    }

    let cities: CityWeather[] = $state([]);
    let loading = $state(false);
    let error = $state('');
    let initialized = $state(false);
    let context = $state<PikaWCContext>() as PikaWCContext;
    let thinkingStatus = $state('');
    let toolStatus = $state('');
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
        const metadata = context.chatAppState.getWidgetMetadataAPI('weather', 'weather-comparison', context.instanceId, context.renderingContext);

        metadata.setMetadata({
            title: 'Weather Comparison',
            actions: [
                {
                    id: 'compare',
                    title: 'Compare Random Cities',
                    // shuffle icon svg
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shuffle-icon lucide-shuffle"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/></svg>',
                    callback: async () => {
                        await compareRandomCities();
                    }
                }
            ]
        });

        // Load cached comparison data (but don't auto-fetch)
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'weather-comparison');
        const cachedData = await userWidgetData.getValue<CachedComparisonData>('comparisonData');

        if (cachedData) {
            lastRefreshTime = cachedData.timestamp;
            cities = cachedData.response.cities;
        }
    }

    async function compareRandomCities() {
        if (!context || loading) return;

        loading = true;
        error = '';
        thinkingStatus = '';
        toolStatus = '';

        try {
            const options: InvokeAgentAsComponentOptions = {
                onThinking: (text: string) => {
                    thinkingStatus = text.length > 60 ? text.substring(0, 60) + '...' : text;
                },
                onToolCall: (call: { name: string; params: any }) => {
                    const funcName = call.name.split('__')[1] || call.name;
                    toolStatus = `🔧 Calling ${funcName}...`;
                }
            };

            const response = await context.chatAppState.invokeAgentAsComponent<ComparisonResponse>(
                'weather',
                'weather-comparison',
                'compareCities',
                'Get current weather for 4 random major cities around the world',
                options
            );

            // Save to component values
            const timestamp = new Date().toISOString();
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'weather-comparison');
            await userWidgetData.setValue('comparisonData', {
                response,
                timestamp
            } as CachedComparisonData);
            lastRefreshTime = timestamp;

            cities = response.cities;
            thinkingStatus = '';
            toolStatus = '';
        } catch (e) {
            console.error('Error comparing cities:', e);
            error = 'Failed to compare cities';
        } finally {
            loading = false;
        }
    }

    async function addToPrompt() {
        if (!context || cities.length === 0) return;

        const comparisonText = cities.map((city) => `${city.location}: ${Math.round(city.tempF)}°F`).join(', ');

        // This would add the comparison to the chat input
        context.appState.showToast(`Weather comparison: ${comparisonText}`, { type: 'info' });
    }

    function getRelativeTemp(tempF: number): string {
        if (tempF >= 85) return 'hot';
        if (tempF >= 70) return 'warm';
        if (tempF >= 50) return 'cool';
        return 'cold';
    }
</script>

<div class="weather-comparison">
    <div class="header">
        <div class="title-section">
            {#if lastRefreshTime}
                <span class="last-update">Last: {new Date(lastRefreshTime).toLocaleTimeString()}</span>
            {/if}
        </div>
        <Button variant="outline" size="sm" onclick={compareRandomCities} disabled={loading}>
            <Shuffle class="h-3 w-3 mr-1" />
            {loading ? 'Loading...' : 'Compare'}
        </Button>
    </div>

    {#if loading}
        <div class="loading">
            <p>Loading weather data...</p>
            {#if thinkingStatus}
                <p class="status thinking">💭 {thinkingStatus}</p>
            {/if}
            {#if toolStatus}
                <p class="status tool">{toolStatus}</p>
            {/if}
        </div>
    {:else if error}
        <p class="error">{error}</p>
    {:else if cities.length === 0}
        <p class="no-data">Click "Compare" to see weather across the globe</p>
    {:else}
        <div class="comparison-grid">
            {#each cities as city}
                <div class="city-card {getRelativeTemp(city.tempF)}">
                    <h4>{city.location}</h4>
                    <div class="temp">{Math.round(city.tempF)}°F</div>
                    <div class="temp-c">{Math.round(city.tempC)}°C</div>
                    {#if city.condition}
                        <div class="condition">{city.condition}</div>
                    {/if}
                </div>
            {/each}
        </div>
        <Button variant="outline" size="sm" onclick={addToPrompt} class="w-full">
            <MessageSquare class="h-3 w-3 mr-1" />
            Add to Prompt
        </Button>
    {/if}
</div>

<style>
    .weather-comparison {
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

    .title-section {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
    }

    .last-update {
        font-size: 0.65rem;
        color: #6b7280;
    }

    .comparison-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: 0.5rem;
        margin-bottom: 0.75rem;
    }

    .city-card {
        padding: 0.75rem;
        border-radius: 6px;
        text-align: center;
        border: 2px solid #e5e7eb;
    }

    .city-card.hot {
        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        border-color: #fbbf24;
    }

    .city-card.warm {
        background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
        border-color: #60a5fa;
    }

    .city-card.cool {
        background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
        border-color: #818cf8;
    }

    .city-card.cold {
        background: linear-gradient(135deg, #dbeafe 0%, #bae6fd 100%);
        border-color: #38bdf8;
    }

    .city-card h4 {
        margin: 0 0 0.375rem 0;
        font-size: 0.875rem;
        color: #111827;
    }

    .temp {
        font-size: 1.5rem;
        font-weight: bold;
        color: #111827;
    }

    .temp-c {
        font-size: 0.75rem;
        color: #6b7280;
        margin-top: 0.125rem;
    }

    .condition {
        margin-top: 0.375rem;
        font-size: 0.75rem;
        color: #374151;
        font-style: italic;
    }

    .loading,
    .no-data,
    .error {
        text-align: center;
        padding: 1.5rem;
        color: #6b7280;
        font-size: 0.875rem;
    }

    .loading .status {
        font-size: 0.75rem;
        padding: 0.375rem;
        margin: 0.375rem 0 0 0;
        border-radius: 3px;
        background: #f3f4f6;
    }

    .loading .status.thinking {
        color: #6366f1;
        background: #eef2ff;
    }

    .loading .status.tool {
        color: #059669;
        background: #d1fae5;
    }

    .error {
        color: #ef4444;
    }
</style>
