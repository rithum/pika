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

            // Register a custom title bar action that opens quick weather search
            ctx.chatAppState.setOrUpdateCustomTitleBarAction({
                id: 'weather-favorite-cities',
                type: 'action',
                title: 'My Favorite Cities',
                iconSvg: await getIconSvg('cloud-sun', 'lucide'),
                callback: async () => {
                    // Open the quick weather search widget in canvas mode
                    await ctx.chatAppState.renderTag('weather.favorite-cities', 'canvas');
                }
            });

            console.log('[Weather Static Init] Successfully registered quick search action in title bar');
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
