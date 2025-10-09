<script lang="ts">
    import X from '$icons/lucide/x';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { injectChatAppWebComponent } from '$lib/client/webcomponent-utils';
    import { Button } from 'pika-ux/shadcn/button';
    import { getContext } from 'svelte';
    import type { ChatAppState } from '../chat-app.state.svelte';

    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');

    let containerEl = $state<HTMLElement>();
    let initialized = $state(false);

    $effect(() => {
        const canvasWidget = chat.canvasWidget;

        if (containerEl && canvasWidget && !initialized) {
            const tagDef = canvasWidget.tagDefinition;

            injectChatAppWebComponent(
                tagDef,
                containerEl,
                {
                    renderingContext: 'canvas',
                    appState: appState,
                    chatAppState: chat,
                    chatAppId: chat.chatApp.chatAppId,
                },
                true
            );

            initialized = true;
        }
    });
</script>

<div class="flex flex-col h-full">
    <div class="flex items-center justify-between p-4 border-b">
        <span class="font-semibold">
            {chat.canvasWidget?.tagDefinition.tagTitle || 'Canvas'}
        </span>
        <Button variant="ghost" size="icon" onclick={() => chat.closeCanvas()}>
            <X class="w-4 h-4" />
        </Button>
    </div>

    <div bind:this={containerEl} class="flex-1 overflow-auto p-4">
        {#if !chat.canvasWidget}
            <p class="text-center text-muted-foreground">No canvas widget loaded</p>
        {/if}
    </div>
</div>
