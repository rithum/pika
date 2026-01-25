<script lang="ts">
    import X from '$icons/lucide/x';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import WidgetActionButton from '$lib/client/features/chat/widgets/widget-action-button.svelte';
    import { injectChatAppWebComponent } from '$lib/client/webcomponent-utils';
    import { Button } from 'pika-ux/shadcn/button';
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import { getContext } from 'svelte';
    import type { ChatAppState } from '../chat-app.state.svelte';
    import type { CanvasCloseConfig } from 'pika-shared/types/chatbot/webcomp-types';

    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');

    let containerEl = $state<HTMLElement>();
    let initialized = $state(false);
    let injecting = $state(false); // Synchronous guard to prevent double-injection race condition
    let instanceId = $state<string | undefined>(undefined);
    let iconComponent = $state<any>(null);

    $effect(() => {
        const canvasWidget = chat.canvasWidget;

        // SYNCHRONOUS guard to prevent double-injection race condition
        if (injecting) {
            return;
        }

        if (containerEl && canvasWidget && (!initialized || canvasWidget?.instanceId !== instanceId)) {
            const tagDef = canvasWidget.tagDefinition;

            // Set synchronous guard BEFORE async operation
            injecting = true;

            // Inject component and get instance ID + element (async operation)
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
                .then((result) => {
                    // Store instance ID for metadata lookup
                    instanceId = result.instanceId;

                    // Register widget instance with ChatAppState
                    const tagId = `${tagDef.scope}.${tagDef.tag}`;
                    const customElementName = tagDef.widget.webComponent.customElementName || tagId;

                    chat.registerWidgetInstance({
                        instanceId: result.instanceId,
                        element: result.element,
                        tagId,
                        customElementName,
                        renderingContext: 'canvas',
                        tagDefinition: tagDef,
                        createdAt: Date.now(),
                    });

                    // Update canvas widget state with instanceId and element
                    if (chat.canvasWidget) {
                        chat.canvasWidget.instanceId = result.instanceId;
                        chat.canvasWidget.element = result.element;

                        // Copy initial metadata to widgetMetadata map (single source of truth)
                        if (chat.canvasWidget.metadata) {
                            const metadataAPI = chat.getWidgetMetadataAPI(
                                tagDef.scope,
                                tagDef.tag,
                                result.instanceId,
                                'canvas'
                            );
                            metadataAPI.setMetadata(chat.canvasWidget.metadata);
                        }
                    }
                    initialized = true;
                    injecting = false;
                })
                .catch((error) => {
                    console.error('Error injecting canvas widget:', error);
                    injecting = false;
                });
        }
    });

    // Derived values for metadata - single source of truth: widgetMetadata map
    const metadata = $derived(instanceId ? chat.widgetMetadata.get(instanceId) : undefined);
    const title = $derived(metadata?.title ?? chat.canvasWidget?.tagDefinition.tagTitle ?? 'Widget');
    const actions = $derived(metadata?.actions ?? []);

    // Check for canvas options in the metadata
    const canvasOptions = $derived(
        chat.canvasWidget?.metadata as
            | {
                  fullControl?: boolean;
                  closeConfig?: CanvasCloseConfig;
              }
            | undefined
    );
    const fullControl = $derived(canvasOptions?.fullControl ?? false);
    const closeConfig = $derived(canvasOptions?.closeConfig);

    // Close confirmation state - triggered by close button OR by requestCanvasClose()
    let showCloseConfirm = $state(false);

    // Watch for pending close confirmation from requestCanvasClose()
    $effect(() => {
        if (chat.hasPendingCanvasCloseConfirmation && !showCloseConfirm) {
            showCloseConfirm = true;
        }
    });

    function handleCloseClick() {
        if (closeConfig?.confirmOnClose) {
            showCloseConfirm = true;
        } else {
            chat.closeCanvas();
        }
    }

    function confirmClose() {
        showCloseConfirm = false;
        // If this was triggered by requestCanvasClose(), resolve the promise
        if (chat.hasPendingCanvasCloseConfirmation) {
            chat.resolvePendingCanvasClose(true);
        } else {
            chat.closeCanvas();
        }
    }

    function cancelClose() {
        showCloseConfirm = false;
        // If this was triggered by requestCanvasClose(), resolve the promise
        if (chat.hasPendingCanvasCloseConfirmation) {
            chat.resolvePendingCanvasClose(false);
        }
    }
</script>

<div class="flex flex-col h-full">
    <!-- Title bar with metadata (hidden in fullControl mode) -->
    {#if !fullControl}
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
                    <WidgetActionButton {action} instanceId={instanceId!} />
                {/each}
                <Button variant="ghost" size="icon" onclick={handleCloseClick} aria-label="Close">
                    <X class="h-4 w-4" />
                </Button>
            </div>
        </div>
    {/if}

    <div bind:this={containerEl} class="flex-1 overflow-auto" class:p-4={!fullControl}>
        {#if !chat.canvasWidget}
            <p class="text-center text-muted-foreground">No canvas widget loaded</p>
        {/if}
    </div>
</div>

<!-- Close confirmation dialog -->
<Dialog.Root bind:open={showCloseConfirm}>
    <Dialog.Content class="max-w-md">
        <Dialog.Header>
            <Dialog.Title>{closeConfig?.confirmTitle ?? 'Close Widget?'}</Dialog.Title>
            <Dialog.Description>
                {closeConfig?.confirmMessage ?? 'Are you sure you want to close? Any unsaved changes will be lost.'}
            </Dialog.Description>
        </Dialog.Header>
        <Dialog.Footer>
            <Button variant="outline" onclick={cancelClose}>Cancel</Button>
            <Button variant="destructive" onclick={confirmClose}>Close</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
