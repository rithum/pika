<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { injectChatAppWebComponent } from '$lib/client/webcomponent-utils';
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import { getContext } from 'svelte';
    import type { ChatAppState } from '../chat-app.state.svelte';

    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');

    let containerEl = $state<HTMLElement>();
    let initialized = $state(false);
    let previousWidget = $state<any>(undefined);

    $effect(() => {
        const dialogWidget = chat.dialogWidget;
        const dialogOpen = chat.widgetDialogOpen;

        // Reset initialization when dialog closes or widget changes
        if (
            !dialogOpen ||
            dialogWidget?.tagDefinition.tag !== previousWidget?.tagDefinition.tag ||
            dialogWidget?.tagDefinition.scope !== previousWidget?.tagDefinition.scope
        ) {
            initialized = false;
            previousWidget = dialogWidget;
        }

        // Only inject when BOTH conditions are true:
        // 1. Dialog is open
        // 2. Widget is defined
        if (containerEl && dialogWidget && dialogOpen && !initialized) {
            const tagDef = dialogWidget.tagDefinition;

            injectChatAppWebComponent(
                tagDef,
                containerEl,
                {
                    renderingContext: 'dialog',
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

<!-- Only render dialog when BOTH dialogOpen AND dialogWidget are present -->
{#if chat.widgetDialogOpen && chat.dialogWidget}
    <Dialog.Root bind:open={chat.widgetDialogOpen}>
        <Dialog.Content class="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <Dialog.Header>
                <Dialog.Title>
                    {chat.dialogWidget.tagDefinition.tagTitle || 'Widget'}
                </Dialog.Title>
            </Dialog.Header>

            <div bind:this={containerEl} class="flex-1 overflow-auto p-4">
                <!-- Web component injected here -->
            </div>
        </Dialog.Content>
    </Dialog.Root>
{/if}
