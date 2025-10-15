<svelte:options customElement={{ tag: 'weather-fun-fact', shadow: 'none' }} />

<script lang="ts">
    import type { IWidgetMetadataAPI, PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import type { InvokeAgentAsComponentOptions } from 'pika-shared/types/chatbot/chatbot-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import Spinner from 'pika-ux/shadcn/spinner/spinner.svelte';

    interface FunFactResponse {
        fact: string;
        category?: string;
    }

    interface CachedFunFactData {
        response: FunFactResponse;
        timestamp: string;
    }

    const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (once a day)

    let funFact = $state('');
    let category = $state('');
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
            widgetMetadataApi.updateAction('new-fact', {
                disabled: loading
            });
        }
    });

    async function init() {
        context = await getPikaContext($host());
        initialized = true;

        // Register widget metadata
        widgetMetadataApi = context.chatAppState.getWidgetMetadataAPI('weather', 'weather-fun-fact', context.instanceId, context.renderingContext);

        widgetMetadataApi.setMetadata({
            title: 'Weather Fun Fact',
            iconSvg: await getIconSvg('sparkles', 'lucide'),
            iconColor: '#a855f7', // Purple
            actions: [
                {
                    id: 'new-fact',
                    title: 'New Fact',
                    iconSvg: await getIconSvg('refresh-ccw', 'lucide'),
                    callback: async () => {
                        await fetchFunFact();
                    }
                }
            ]
        });

        // Load cached fun fact data
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'weather-fun-fact');
        const cachedData = await userWidgetData.getValue<CachedFunFactData>('funFactData');

        if (cachedData) {
            lastRefreshTime = cachedData.timestamp;
            funFact = cachedData.response.fact;
            category = cachedData.response.category || '';

            // Check if data is stale (older than 24 hours)
            const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
            if (cacheAge > REFRESH_INTERVAL_MS) {
                // Auto-refresh stale data (once a day)
                await fetchFunFact();
            }
        } else {
            // No cached data, fetch immediately (auto-load)
            await fetchFunFact();
        }
    }

    async function fetchFunFact() {
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

            const response = await context.chatAppState.invokeAgentAsComponent<FunFactResponse>(
                'weather',
                'weather-fun-fact',
                'getFunFact',
                'Generate an interesting weather-related fun fact or trivia',
                options
            );

            // Save to component values
            const timestamp = new Date().toISOString();
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'weather-fun-fact');
            await userWidgetData.setValue('funFactData', {
                response,
                timestamp
            } as CachedFunFactData);
            lastRefreshTime = timestamp;

            funFact = response.fact;
            category = response.category || '';
            thinkingStatus = '';
            toolStatus = '';
        } catch (e) {
            console.error('Error fetching fun fact:', e);
            error = 'Failed to fetch fun fact';
        } finally {
            loading = false;
        }
    }
</script>

<div class="h-full w-full flex flex-col">
    {#if loading}
        <div class="px-3 py-3 space-y-2">
            <div class="flex items-center justify-center gap-2 text-gray-600 text-sm">
                <Spinner class="h-3.5 w-3.5 text-purple-500" />
                <span>Generating fun fact...</span>
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
    {:else if funFact}
        <div class="flex-1 p-3 pl-4 pr-4">
            <!-- {#if category}
                    <div class="inline-block px-3 py-1 bg-purple-500 text-white text-xs font-bold uppercase rounded-full mb-3">{category}</div>
                {/if} -->
            <p class="text-sm leading-relaxed text-gray-800">{funFact}</p>
        </div>
        {#if lastRefreshTime}
            <div class="px-3 pb-2 text-right w-full italic text-gray-400" style="font-size: 0.55rem;">
                Generated: {new Date(lastRefreshTime).toLocaleString()}
            </div>
        {/if}
    {:else}
        <div class="flex-1 flex items-center justify-center px-4">
            <div class="text-center">
                <div class="text-5xl mb-2">✨</div>
                <p class="text-sm text-gray-600">Loading fun fact...</p>
            </div>
        </div>
    {/if}
</div>
