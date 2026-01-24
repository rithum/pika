<svelte:options customElement={{ tag: 'weather-static-init', shadow: 'none' }} />

<script lang="ts">
    import type { PikaWCContext, CanvasWidgetOptions } from 'pika-shared/types/chatbot/webcomp-types';
    import type { IntentRouterCommandEvent, IntentRouterHandlerResult } from 'pika-shared/types/chatbot/chatbot-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';

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

            console.log('[Weather Static Init] Initializing weather app features...');

            const { chatAppState, instanceId } = ctx;

            // Register a custom title bar action that opens favorite cities
            chatAppState.setOrUpdateCustomTitleBarAction({
                id: 'weather-favorite-cities',
                type: 'action',
                title: 'My Favorite Cities',
                iconSvg: await getIconSvg('cloud-sun', 'lucide'),
                callback: async () => {
                    const canvasOptions: CanvasWidgetOptions = { companionMode: true, chatPaneMinimized: true };
                    await chatAppState.renderTag('weather.favorite-cities', 'canvas', {}, canvasOptions);
                }
            });

            console.log('[Weather Static Init] Registered favorite cities action in title bar');

            // Dynamically register the Weather Preferences widget
            // This demonstrates dynamic spotlight registration without database tag definitions
            chatAppState.manuallyRegisterSpotlightWidget({
                tag: 'preferences',
                scope: 'weather',
                tagTitle: 'Weather Preferences',
                customElementName: 'weather-preferences',
                displayOrder: 100, // Place at bottom
                autoCreateInstance: false, // Don't auto-show, let user add it
                singleton: true, // Only one instance allowed
                showInUnpinnedMenu: true // Show in add widget menu
            });

            console.log('[Weather Static Init] Dynamically registered Weather Preferences widget');

            // Listen for hero lifecycle events to demonstrate the new event system
            chatAppState.addEventListener(
                'heroWillShow',
                () => {
                    console.log('[Weather Static Init] Hero widget is about to show');
                },
                instanceId
            );

            chatAppState.addEventListener(
                'heroDidShow',
                () => {
                    console.log('[Weather Static Init] Hero widget is now visible');
                },
                instanceId
            );

            chatAppState.addEventListener(
                'heroWillHide',
                () => {
                    console.log('[Weather Static Init] Hero widget is about to hide');
                },
                instanceId
            );

            chatAppState.addEventListener(
                'heroDidHide',
                () => {
                    console.log('[Weather Static Init] Hero widget is now hidden');
                },
                instanceId
            );

            chatAppState.addEventListener(
                'heroCollapse',
                () => {
                    console.log('[Weather Static Init] Hero widget collapsed');
                },
                instanceId
            );

            chatAppState.addEventListener(
                'heroExpand',
                () => {
                    console.log('[Weather Static Init] Hero widget expanded');
                },
                instanceId
            );

            // Render the hero widget on startup
            await chatAppState.renderTag('weather.hero', 'hero');
            console.log('[Weather Static Init] Rendered hero widget');

            // Start with spotlight hidden to demonstrate the feature
            chatAppState.hideSpotlight();
            console.log('[Weather Static Init] Hidden spotlight');

            // Register another custom title bar action to open preferences
            chatAppState.setOrUpdateCustomTitleBarAction({
                id: 'weather-preferences',
                type: 'action',
                title: 'Weather Preferences',
                iconSvg: await getIconSvg('settings', 'lucide'),
                callback: async () => {
                    // Open preferences in spotlight if not already there
                    await chatAppState.renderTag('weather.preferences', 'spotlight');
                }
            });

            // Register an Intent Router handler to handle dispatched commands
            // This demonstrates how widgets can respond to user intents detected by the Intent Router
            chatAppState.registerIntentRouterHandler(
                instanceId,
                ctx.tagId, // e.g., 'weather.static-init' - provided by Pika context
                async (event: IntentRouterCommandEvent): Promise<IntentRouterHandlerResult> => {
                    console.log('[Weather Static Init] Intent Router command received:', event);

                    // Handle the "show_favorite_cities" command by opening the widget in canvas with companion mode
                    if (event.commandId === 'show_favorite_cities' || event.intent === 'show_favorite_cities') {
                        // Open in canvas with companion mode - chat pane starts minimized
                        const canvasOptions: CanvasWidgetOptions = {
                            title: 'Favorite Cities Weather',
                            companionMode: true,
                            chatPaneMinimized: true
                        };
                        await chatAppState.renderTag('weather.favorite-cities', 'canvas', {}, canvasOptions);

                        return {
                            handled: true,
                            response: 'Here are your favorite cities and their current weather. Use the ✨ button to ask AI questions about the weather!'
                        };
                    }

                    // Handle the "show_forecast" command
                    if (event.commandId === 'show_forecast' || event.intent === 'show_forecast') {
                        // Extract city from payload or context, or default to 'your area'
                        const city = (event.payload?.city as string) || (event.context?.city as string) || 'your area';
                        const forecastOptions: CanvasWidgetOptions = {
                            title: `Forecast for ${city}`,
                            companionMode: true
                        };
                        await chatAppState.renderTag('weather.full-forecast', 'canvas', { city }, forecastOptions);

                        return {
                            handled: true,
                            response: `Here's the forecast for ${city}. You can ask follow-up questions in the chat!`
                        };
                    }

                    // Not handled by this widget
                    return { handled: false };
                }
            );

            console.log('[Weather Static Init] Registered Intent Router handler');
            console.log('[Weather Static Init] Successfully initialized all weather app features');

            // Signal that this static widget is ready
            // Best practice: Signal ready after all initialization is complete
            chatAppState.signalWidgetReady(instanceId);
            console.log('[Weather Static Init] Signaled widget ready');
        } catch (error) {
            console.error('[Weather Static Init] Failed to initialize:', error);
        }
    }
</script>

<!-- 
    This is a static context component - it doesn't render any visible UI.
    It runs initialization code when the chat app loads, such as registering
    title bar actions that users can access at any time.
-->
