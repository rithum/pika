<svelte:options customElement={{ tag: 'weather-orchestrator', shadow: 'none' }} />

<script lang="ts">
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import type { IntentRouterCommandEvent, IntentRouterHandlerResult } from 'pika-shared/types/chatbot/intent-router-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';

    let context = $state<PikaWCContext>();
    let initialized = $state(false);

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

            console.log('[Weather Orchestrator] Initializing...');

            // Register to handle Intent Router commands
            ctx.chatAppState.registerIntentRouterHandler(
                ctx.instanceId,
                ctx.tagId, // e.g., 'weather.orchestrator' - provided by Pika context
                handleCommand
            );

            console.log('[Weather Orchestrator] Ready to receive commands');
        } catch (error) {
            console.error('[Weather Orchestrator] Failed to initialize:', error);
        }
    }

    /**
     * Handle commands dispatched by the Intent Router.
     *
     * This orchestrator demonstrates handling various weather-related commands
     * that are faster than going through the full Bedrock agent.
     */
    async function handleCommand(event: IntentRouterCommandEvent): Promise<IntentRouterHandlerResult> {
        console.log('[Weather Orchestrator] Received command:', event);

        const { commandId, payload } = event;
        const action = (payload?.action as string) || commandId;

        switch (action) {
            case 'show_forecast':
                return await handleShowForecast(event);

            case 'manage_cities':
                return await handleManageCities();

            case 'compare_weather':
                return await handleCompareWeather();

            case 'check_alerts':
                return await handleCheckAlerts();

            case 'show_hero':
                return await handleShowHero();

            default:
                console.log(`[Weather Orchestrator] Unknown action: ${action}, not handling`);
                return { handled: false };
        }
    }

    // ============================================================
    // Command Handlers
    // ============================================================

    async function handleShowForecast(event: IntentRouterCommandEvent): Promise<IntentRouterHandlerResult> {
        // Check if a city was mentioned in context
        const city = event.context?.selectedCity as string | undefined;

        await context!.chatAppState.renderTag('weather.full-forecast', 'canvas', city ? { location: city } : undefined);

        return {
            handled: true,
            response: city ? `Opening the forecast for ${city}...` : 'Opening the 5-day forecast...'
        };
    }

    async function handleManageCities(): Promise<IntentRouterHandlerResult> {
        await context!.chatAppState.renderTag('weather.city-selector', 'dialog');

        return {
            handled: true,
            response: 'Opening the city manager...'
        };
    }

    async function handleCompareWeather(): Promise<IntentRouterHandlerResult> {
        await context!.chatAppState.renderTag('weather.weather-comparison', 'spotlight');

        return {
            handled: true,
            response: 'Opening weather comparison...'
        };
    }

    async function handleCheckAlerts(): Promise<IntentRouterHandlerResult> {
        await context!.chatAppState.renderTag('weather.weather-alerts', 'spotlight');

        return {
            handled: true,
            response: 'Checking weather alerts...'
        };
    }

    async function handleShowHero(): Promise<IntentRouterHandlerResult> {
        await context!.chatAppState.renderTag('weather.hero', 'hero');

        return {
            handled: true,
            response: 'Welcome to your weather dashboard!'
        };
    }

</script>

<!-- 
    This is a static orchestrator component - it doesn't render any visible UI.
    It runs when the chat app loads and handles Intent Router command dispatch.
    
    Commands handled:
    - show_forecast: Opens the 5-day forecast in canvas
    - manage_cities: Opens the city selector dialog
    - compare_weather: Opens weather comparison in spotlight
    - check_alerts: Opens weather alerts in spotlight
    - show_hero: Opens the hero welcome banner
-->
