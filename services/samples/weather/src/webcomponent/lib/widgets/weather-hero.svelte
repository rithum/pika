<svelte:options customElement={{ tag: 'weather-hero', shadow: 'none' }} />

<script lang="ts">
    import type { IWidgetMetadataAPI, PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';

    let context = $state<PikaWCContext>();
    let initialized = $state(false);
    let widgetMetadataApi = $state<IWidgetMetadataAPI | undefined>();

    // Available commands that users can trigger
    const commands = [
        {
            id: 'forecast',
            icon: '📅',
            title: '5-Day Forecast',
            description: 'View detailed weather predictions for the next 5 days',
            prompt: 'Show me the 5-day forecast'
        },
        {
            id: 'favorites',
            icon: '❤️',
            title: 'My Favorite Cities',
            description: 'Quick view of weather in your saved locations',
            prompt: 'Show my favorite cities'
        },
        {
            id: 'manage',
            icon: '🏙️',
            title: 'Manage Cities',
            description: 'Add, remove, or organize your saved cities',
            prompt: 'Manage my cities'
        },
        {
            id: 'compare',
            icon: '🌍',
            title: 'Compare Weather',
            description: 'See weather side-by-side across multiple cities',
            prompt: 'Compare weather in different cities'
        },
        {
            id: 'alerts',
            icon: '⚠️',
            title: 'Weather Alerts',
            description: 'Check for severe weather warnings in your area',
            prompt: 'Check weather alerts'
        }
    ];

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    async function init() {
        try {
            const ctx = await getPikaContext($host());
            context = ctx;
            initialized = true;

            // Register widget metadata
            widgetMetadataApi = ctx.chatAppState.getWidgetMetadataAPI('weather', 'hero', ctx.instanceId, ctx.renderingContext);

            widgetMetadataApi.setMetadata({
                title: 'Weather Dashboard',
                iconSvg: await getIconSvg('cloud-sun', 'lucide'),
                iconColor: '#f59e0b'
            });

            // Signal that widget is ready
            ctx.chatAppState.signalWidgetReady(ctx.instanceId);
            console.log('[Weather Hero] Initialized and signaled ready');
        } catch (error) {
            console.error('[Weather Hero] Failed to initialize:', error);
        }
    }

    function suggestCommand(prompt: string) {
        if (!context) return;
        context.chatAppState.suggestQuestion(prompt);
    }
</script>

<div class="w-full py-4 px-4">
    <div class="max-w-3xl mx-auto">
        <!-- Header -->
        <div class="mb-4 text-center">
            <p class="text-sm text-muted-foreground">Quick Actions — click to get started</p>
        </div>

        <!-- Command Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {#each commands as command}
                <button
                    onclick={() => suggestCommand(command.prompt)}
                    class="group flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                >
                    <span class="text-xl flex-shrink-0 mt-0.5">{command.icon}</span>
                    <div class="min-w-0">
                        <div class="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                            {command.title}
                        </div>
                        <div class="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {command.description}
                        </div>
                    </div>
                </button>
            {/each}
        </div>

        <!-- Hint -->
        <div class="mt-4 text-center">
            <p class="text-xs text-muted-foreground">
                Or ask anything: <span class="italic">"What's the weather in Tokyo?"</span>
            </p>
        </div>
    </div>
</div>
