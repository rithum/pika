<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import WidgetActionButton from '$lib/client/features/chat/widgets/widget-action-button.svelte';
    import { injectChatAppWebComponent } from '$lib/client/webcomponent-utils';
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import { getContext } from 'svelte';
    import type { ChatAppState } from '../chat-app.state.svelte';

    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');

    let containerEl = $state<HTMLElement>();
    let initialized = $state(false);
    let previousWidget = $state<any>(undefined);
    let instanceId = $state<string | undefined>(undefined);
    let iconComponent = $state<any>(null);

    /**
     * Get dialog dimensions based on sizing configuration.
     * Supports presets ('fullscreen', 'large', 'medium', 'small') and custom dimensions.
     * Returns width and height as CSS values.
     */
    function getDialogDimensions(): { width: string; height: string } {
        const tagDef = chat.dialogWidget?.tagDefinition;

        // Default to fullscreen
        const defaults = { width: '95vw', height: '90vh' };

        if (!tagDef || tagDef.widget.type !== 'web-component') {
            return defaults;
        }

        const sizing = tagDef.widget.webComponent.sizing?.dialog;

        if (!sizing) {
            return defaults;
        }

        // Handle preset strings
        if (typeof sizing === 'string') {
            switch (sizing) {
                case 'fullscreen':
                    return { width: '95vw', height: '90vh' };
                case 'large':
                    return { width: '85vw', height: '80vh' };
                case 'medium':
                    return { width: '70vw', height: '70vh' };
                case 'small':
                    return { width: '50vw', height: '50vh' };
                default:
                    return defaults;
            }
        }

        // Handle custom object - use specified values or fall back to defaults
        return {
            width: sizing.width || defaults.width,
            height: sizing.height || defaults.height,
        };
    }

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

            // Inject component and get instance ID for metadata tracking (async operation)
            injectChatAppWebComponent(
                tagDef,
                containerEl,
                {
                    renderingContext: 'dialog',
                    appState: appState,
                    chatAppState: chat,
                    chatAppId: chat.chatApp.chatAppId,
                    dataForWidget: dialogWidget.data || {},
                },
                true
            )
                .then((id) => {
                    // Store instance ID for metadata lookup
                    instanceId = id;
                })
                .catch((error) => {
                    console.error('Error injecting dialog widget:', error);
                });

            initialized = true;
        }
    });

    // Derived values for metadata
    const metadata = $derived(instanceId ? chat.widgetMetadata.get(instanceId) : undefined);
    const title = $derived(metadata?.title ?? chat.dialogWidget?.tagDefinition.tagTitle ?? 'Widget');
    const actions = $derived(metadata?.actions ?? []);

    // Compute dialog dimensions dynamically
    const dimensions = $derived(getDialogDimensions());
    const dialogStyle = $derived(`width: ${dimensions.width}; height: ${dimensions.height};`);
</script>

<!-- Only render dialog when BOTH dialogOpen AND dialogWidget are present -->
{#if chat.widgetDialogOpen && chat.dialogWidget}
    <Dialog.Root bind:open={chat.widgetDialogOpen}>
        <Dialog.Content class="overflow-hidden flex flex-col" style={dialogStyle}>
            <Dialog.Header>
                <Dialog.Title>
                    <div class="flex items-center gap-2">
                        {#if iconComponent}
                            {@const Icon = iconComponent}
                            <Icon class="h-5 w-5 text-muted-foreground" />
                        {/if}
                        <span>{title}</span>
                    </div>
                </Dialog.Title>
            </Dialog.Header>

            <div bind:this={containerEl} class="flex-1 overflow-auto p-2">
                <!-- Web component injected here -->
            </div>

            {#if actions.length > 0}
                <Dialog.Footer class="flex items-center justify-end gap-2">
                    {#each actions as action (action.id)}
                        <WidgetActionButton {action} variant="with-text" size="default" />
                    {/each}
                </Dialog.Footer>
            {/if}
        </Dialog.Content>
    </Dialog.Root>
{/if}
