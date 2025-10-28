<svelte:options customElement={{ tag: 'weather-static-init', shadow: 'none' }} />

<script lang="ts">
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
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

            // Register a custom title bar action that opens favorite cities
            ctx.chatAppState.setOrUpdateCustomTitleBarAction({
                id: 'weather-favorite-cities',
                type: 'action',
                title: 'My Favorite Cities',
                iconSvg: await getIconSvg('cloud-sun', 'lucide'),
                callback: async () => {
                    await ctx.chatAppState.renderTag('weather.favorite-cities', 'canvas');
                }
            });

            console.log('[Weather Static Init] Registered favorite cities action in title bar');

            // Dynamically register the Weather Preferences widget
            // This demonstrates dynamic spotlight registration without database tag definitions
            ctx.chatAppState.manuallyRegisterSpotlightWidget({
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

            // Register another custom title bar action to open preferences
            ctx.chatAppState.setOrUpdateCustomTitleBarAction({
                id: 'weather-preferences',
                type: 'action',
                title: 'Weather Preferences',
                iconSvg: await getIconSvg('settings', 'lucide'),
                callback: async () => {
                    // Open preferences in spotlight if not already there
                    await ctx.chatAppState.renderTag('weather.preferences', 'spotlight');
                }
            });

            console.log('[Weather Static Init] Successfully initialized all weather app features');
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
