<script lang="ts">
    import X from '$icons/lucide/x';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import WidgetActionButton from '$lib/client/features/chat/widgets/widget-action-button.svelte';
    import { injectChatAppWebComponent } from '$lib/client/webcomponent-utils';
    import { Button } from 'pika-ux/shadcn/button';
    import { getContext } from 'svelte';
    import type { ChatAppState } from '../chat-app.state.svelte';

    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');

    let containerEl = $state<HTMLElement>();
    let initialized = $state(false);
    let instanceId = $state<string | undefined>(undefined);
    let iconComponent = $state<any>(null);

    $effect(() => {
        const canvasWidget = chat.canvasWidget;

        if (containerEl && canvasWidget && !initialized) {
            const tagDef = canvasWidget.tagDefinition;

            // Inject component and get instance ID for metadata tracking (async operation)
            injectChatAppWebComponent(
                tagDef,
                containerEl,
                {
                    renderingContext: 'canvas',
                    appState: appState,
                    chatAppState: chat,
                    chatAppId: chat.chatApp.chatAppId,
                    dataForWidget: canvasWidget.data || {},
                },
                true
            )
                .then((id) => {
                    // Store instance ID for metadata lookup
                    instanceId = id;
                })
                .catch((error) => {
                    console.error('Error injecting canvas widget:', error);
                });

            initialized = true;
        }
    });

    // Derived values for metadata
    const metadata = $derived(instanceId ? chat.widgetMetadata.get(instanceId) : undefined);
    const title = $derived(metadata?.title ?? chat.canvasWidget?.tagDefinition.tagTitle ?? 'Widget');
    const actions = $derived(metadata?.actions ?? []);
</script>

<div class="flex flex-col h-full">
    <!-- Title bar with metadata -->
    <div class="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div class="flex items-center gap-2 min-w-0 flex-1">
            {#if iconComponent}
                {@const Icon = iconComponent}
                <Icon class="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            {/if}
            <span class="font-semibold truncate" {title}>
                {title}
            </span>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
            {#each actions as action (action.id)}
                <WidgetActionButton {action} />
            {/each}
            <Button variant="ghost" size="icon" onclick={() => chat.closeCanvas()} aria-label="Close">
                <X class="h-4 w-4" />
            </Button>
        </div>
    </div>

    <div bind:this={containerEl} class="flex-1 overflow-auto p-4">
        {#if !chat.canvasWidget}
            <p class="text-center text-muted-foreground">No canvas widget loaded</p>
        {/if}
    </div>
</div>
