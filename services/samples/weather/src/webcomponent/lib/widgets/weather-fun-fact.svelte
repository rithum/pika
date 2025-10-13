<svelte:options customElement="weather-fun-fact" />

<script lang="ts">
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import Sparkles from '$icons/lucide/sparkles';

    interface FunFactResponse {
        fact: string;
        category?: string;
    }

    interface CachedFunFactData {
        response: FunFactResponse;
        timestamp: string;
    }

    const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    let funFact = $state('');
    let category = $state('');
    let loading = $state(true);
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
        const metadata = context.chatAppState.getWidgetMetadataAPI('weather', 'weather-fun-fact', context.instanceId, context.renderingContext);

        metadata.setMetadata({
            title: 'Weather Fun Fact',
            actions: [
                {
                    id: 'new-fact',
                    title: 'New Fact',
                    // sparkles icon svg
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles-icon lucide-sparkles"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></svg>',
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

            // Check if data is stale (older than 1 hour)
            const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
            if (cacheAge > REFRESH_INTERVAL_MS) {
                // Auto-refresh stale data
                await fetchFunFact();
            }
        } else {
            // No cached data, fetch immediately
            await fetchFunFact();
        }

        loading = false;
    }

    async function fetchFunFact() {
        if (!context) return;

        loading = true;
        error = '';

        try {
            const response = await context.chatAppState.invokeAgentAsComponent<FunFactResponse>(
                'weather',
                'weather-fun-fact',
                'getFunFact',
                'Generate an interesting weather-related fun fact or trivia'
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
        } catch (e) {
            console.error('Error fetching fun fact:', e);
            error = 'Failed to fetch fun fact';
        } finally {
            loading = false;
        }
    }
</script>

<div class="weather-fun-fact">
    <div class="header">
        <div class="title-section">
            <h3 class="text-base font-semibold m-0">⚡ Weather Fun Fact</h3>
            {#if lastRefreshTime}
                <span class="last-update">Updated {new Date(lastRefreshTime).toLocaleTimeString()}</span>
            {/if}
        </div>
        <Button variant="outline" size="sm" onclick={fetchFunFact} disabled={loading}>
            <Sparkles class="h-3 w-3 mr-1" />
            {loading ? 'Loading...' : 'New Fact'}
        </Button>
    </div>

    {#if loading}
        <p class="loading">Generating fun fact...</p>
    {:else if error}
        <p class="error">{error}</p>
    {:else if funFact}
        <div class="fact-card">
            {#if category}
                <span class="category">{category}</span>
            {/if}
            <p class="fact-text">{funFact}</p>
        </div>
    {:else}
        <p class="no-data">Click "New Fact" to learn something interesting!</p>
    {/if}
</div>

<style>
    .weather-fun-fact {
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

    .fact-card {
        padding: 1rem;
        background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
        border-left: 3px solid #8b5cf6;
        border-radius: 6px;
    }

    .category {
        display: inline-block;
        padding: 0.125rem 0.5rem;
        background: #8b5cf6;
        color: white;
        border-radius: 10px;
        font-size: 0.625rem;
        font-weight: 600;
        text-transform: uppercase;
        margin-bottom: 0.5rem;
    }

    .fact-text {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.5;
        color: #374151;
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
