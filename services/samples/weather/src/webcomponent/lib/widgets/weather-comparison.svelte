<svelte:options customElement={{ tag: 'weather-comparison', shadow: 'none' }} />

<script lang="ts">
    import type { IWidgetMetadataAPI, PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import type { InvokeAgentAsComponentOptions, ContextSourceDef } from 'pika-shared/types/chatbot/chatbot-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import Spinner from 'pika-ux/shadcn/spinner/spinner.svelte';
    import { getIconSvg } from 'pika-shared/util/icon-utils';

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

            // Enable/disable fullForecast based on whether we have cities
            const hasCities = cities && cities.length > 0;
            widgetMetadataApi.updateAction('fullForecast', {
                disabled: !hasCities
            });
        }
    });

    async function init() {
        context = await getPikaContext($host());
        initialized = true;

        // Register widget metadata
        widgetMetadataApi = context.chatAppState.getWidgetMetadataAPI('weather', 'weather-comparison', context.instanceId, context.renderingContext);

        const metadataToSet = {
            title: 'Weather Comparison',
            iconSvg: await getIconSvg('git-compare-arrows', 'lucide'),
            iconColor: '#3b82f6', // Brighter blue (Tailwind blue-500)
            actions: [
                {
                    id: compareActionId,
                    title: compareActionTitle,
                    iconSvg: await getIconSvg('shuffle', 'lucide'),
                    callback: async () => {
                        await compareRandomCities();
                    }
                },
                {
                    id: 'fullForecast',
                    title: 'Open Full Forecast',
                    iconSvg: await getIconSvg('panel-right-open', 'lucide'),
                    callback: async () => {
                        // Randomly pick one of the cities
                        if (cities && cities.length > 0) {
                            const randomCity = cities[Math.floor(Math.random() * cities.length)];
                            await context.chatAppState.renderTag('weather.full-forecast', 'canvas', {
                                location: randomCity.location
                            });
                        }
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

            // Notify system that context is available
            if (context && context.instanceId) {
                context.chatAppState.updateWidgetContext(context.instanceId);
            }
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

            // Notify system that context has changed
            if (context && context.instanceId) {
                context.chatAppState.updateWidgetContext(context.instanceId);
            }

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

    /**
     * Provide context about the cities currently being compared.
     * This helps AI understand what locations are being viewed side-by-side.
     */
    export function getContextForLlm(): ContextSourceDef[] | undefined {
        // Only provide context if we have cities data
        if (!cities || cities.length === 0) {
            return undefined;
        }

        return [
            {
                sourceId: 'weather-comparison-cities',
                llmInclusionDescription: 'Cities currently being compared in the weather comparison widget with their temperatures and conditions',
                origin: 'auto',
                lucideIconName: 'git-compare-arrows',
                title: 'Weather Comparison',
                description: cities.map((c) => c.location).join(', '),
                data: {
                    cities: cities.map((c) => ({
                        location: c.location,
                        tempF: c.tempF,
                        tempC: c.tempC,
                        condition: c.condition
                    })),
                    comparedAt: lastRefreshTime
                },
                addAutomatically: true,
                maxAgeMs: 2 * 60 * 60 * 1000 // 2 hours - comparison data
            }
        ];
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
                <div class="text-xs text-gray-600 font-bold mb-2 leading-tight">{city.location}</div>
                <div class="text-sm font-bold text-gray-900 leading-none">{Math.round(city.tempF)}°F</div>
                <div class="text-xs text-gray-400 mb-2">{Math.round(city.tempC)}°C</div>
                {#if city.condition}
                    <div class="text-xs text-gray-500 italic leading-snug">{city.condition}</div>
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
