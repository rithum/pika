<svelte:options customElement={{ tag: 'weather-comparison', shadow: 'none' }} />

<script lang="ts">
    import type { IWidgetMetadataAPI, PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import type { InvokeAgentAsComponentOptions } from 'pika-shared/types/chatbot/chatbot-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import Spinner from 'pika-ux/shadcn/spinner/spinner.svelte';

    const shuffleIconSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shuffle-icon lucide-shuffle"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/></svg>';

    const gitCompareArrowsIconSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-git-compare-arrows-icon lucide-git-compare-arrows"><circle cx="5" cy="6" r="3"/><path d="M12 6h5a2 2 0 0 1 2 2v7"/><path d="m15 9-3-3 3-3"/><circle cx="19" cy="18" r="3"/><path d="M12 18H7a2 2 0 0 1-2-2V9"/><path d="m9 15 3 3-3 3"/></svg>';

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

    const compareActionId = 'compare';
    const compareActionTitle = 'Compare Random Cities';
    let cities = $state<CityWeather[] | undefined>([]);
    let loading = $state(false);
    let error = $state('');
    let initialized = $state(false);
    let context = $state<PikaWCContext>() as PikaWCContext;
    let thinkingStatus = $state('');
    let toolStatus = $state('');
    let lastRefreshTime = $state<string | undefined>();
    let widgetMetadataApi = $state<IWidgetMetadataAPI | undefined>();

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    $effect(() => {
        if (widgetMetadataApi) {
            if (loading) {
                widgetMetadataApi.updateAction(compareActionId, {
                    disabled: true
                });
            } else {
                widgetMetadataApi.updateAction(compareActionId, {
                    disabled: false
                });
            }
        }
    });

    async function init() {
        context = await getPikaContext($host());
        initialized = true;

        // Register widget metadata
        widgetMetadataApi = context.chatAppState.getWidgetMetadataAPI('weather', 'weather-comparison', context.instanceId, context.renderingContext);

        const metadataToSet = {
            title: 'Weather Comparison',
            iconSvg: gitCompareArrowsIconSvg,
            iconColor: '#3b82f6', // Brighter blue (Tailwind blue-500)
            actions: [
                {
                    id: compareActionId,
                    title: compareActionTitle,
                    iconSvg: shuffleIconSvg,
                    callback: async () => {
                        await compareRandomCities();
                    }
                }
            ]
        };

        widgetMetadataApi.setMetadata(metadataToSet);

        // Load cached comparison data (but don't auto-fetch)
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'weather-comparison');
        const cachedData = await userWidgetData.getValue<CachedComparisonData>('comparisonData');

        if (cachedData) {
            lastRefreshTime = cachedData.timestamp;
            cities = cachedData.response.cities;
        }

        // setTimeout(() => {
        //     widgetMetadataApi?.setLoadingStatus(true, 'One sec.  AI is on it...');
        // }, 10000);
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
                    thinkingStatus = text.length > 70 ? text.substring(0, 70) + '...' : text;
                },
                onToolCall: (call: { name: string; params: any }) => {
                    const funcName = call.name.split('__')[1] || call.name;
                    toolStatus = `Calling AI tool: ${funcName}...`;
                }
            };

            const response = await context.chatAppState.invokeAgentAsComponent<ComparisonResponse>(
                'weather',
                'weather-comparison',
                'compareCities',
                cities && cities.length > 0
                    ? `Don't pick any of these cities you just returned: ${cities.map((city) => city.location).join(', ')}`
                    : 'Follow the instructions you have been given',
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
        if (!context || !cities || cities.length === 0) return;

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
{:else if cities && cities.length === 0}
    <p class="text-center p-6 text-gray-500 text-sm">Click Compare button (top right) to see weather across the globe</p>
{:else}
    <div class="flex divide-x divide-gray-200 pt-4">
        {#each cities || [] as city, i}
            {@const tempCategory = getRelativeTemp(city.tempF)}
            {@const accentColor =
                tempCategory === 'hot' ? 'border-amber-500' : tempCategory === 'warm' ? 'border-blue-500' : tempCategory === 'cool' ? 'border-indigo-500' : 'border-cyan-500'}
            <div class="flex-1 text-center px-1">
                <h4 class="text-[0.7rem] text-gray-600 font-medium mb-2 leading-tight">{city.location}</h4>
                <div class="text-sm font-bold text-gray-900 leading-none">{Math.round(city.tempF)}°F</div>
                <div class="text-[0.7rem] text-gray-400 mb-2">{Math.round(city.tempC)}°C</div>
                {#if city.condition}
                    <div class="text-[0.7rem] text-gray-500 italic leading-snug">{city.condition}</div>
                {/if}
                <div class="mt-2 mx-auto w-8 h-0.5 rounded-full {accentColor}"></div>
            </div>
        {/each}
    </div>
    {#if lastRefreshTime}
        <div class="position absolute bottom-0 left-0 text-gray-500 text-right w-full px-2 italic" style="font-size: 0.55rem;">
            Updated: {new Date(lastRefreshTime).toLocaleString()}
        </div>
    {/if}
{/if}
