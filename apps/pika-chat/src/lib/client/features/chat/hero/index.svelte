<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { ChatAppState } from '$lib/client/features/chat/chat-app.state.svelte';
    import WidgetActionButton from '$lib/client/features/chat/widgets/widget-action-button.svelte';
    import WidgetActionMenu from '$lib/client/features/chat/widgets/widget-action-menu.svelte';
    import { injectChatAppWebComponent } from '$lib/client/webcomponent-utils.js';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import Spinner from 'pika-ux/shadcn/spinner/spinner.svelte';
    import { getContext } from 'svelte';

    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');

    let containerEl = $state<HTMLElement>();
    let initialized = $state(false);
    let instanceId = $state<string | undefined>(undefined);

    // Track the current hero widget to detect changes
    let currentHeroTagId = $state<string | undefined>(undefined);

    const heroWidget = $derived(chat.heroWidget);
    const heroVisible = $derived(chat.heroVisible);

    // Derived values for metadata - single source of truth: widgetMetadata map
    const metadata = $derived(instanceId ? chat.widgetMetadata.get(instanceId) : undefined);
    const title = $derived(metadata?.title ?? heroWidget?.tagDefinition.tagTitle ?? 'Hero');
    const actions = $derived(metadata?.actions ?? []);
    const iconSvg = $derived(metadata?.iconSvg);
    const iconColor = $derived(metadata?.iconColor);
    const loadingStatus = $derived(metadata?.loadingStatus);

    // Inject web component when hero widget changes
    // Note: We inject regardless of heroVisible since we use CSS to hide (not {#if})
    $effect(() => {
        if (!containerEl || !heroWidget) {
            return;
        }

        const tagDef = heroWidget.tagDefinition;
        const tagId = `${tagDef.scope}.${tagDef.tag}`;

        // Only inject if this is a new/different hero widget
        if (initialized && currentHeroTagId === tagId && heroWidget.instanceId === instanceId) {
            return;
        }

        // Clear container if switching to different widget
        if (currentHeroTagId !== tagId && containerEl.children.length > 0) {
            containerEl.innerHTML = '';
            initialized = false;
        }

        currentHeroTagId = tagId;

        injectChatAppWebComponent(
            tagDef,
            containerEl,
            {
                renderingContext: 'hero',
                appState: appState,
                chatAppState: chat,
                chatAppId: chat.chatApp.chatAppId,
                dataForWidget: heroWidget.data || {},
            },
            true
        )
            .then(async (result) => {
                instanceId = result.instanceId;

                // Register widget instance with ChatAppState
                const customElementName = tagDef.widget.webComponent.customElementName || tagId;
                chat.registerWidgetInstance({
                    instanceId: result.instanceId,
                    element: result.element,
                    tagId,
                    customElementName,
                    renderingContext: 'hero',
                    tagDefinition: tagDef,
                    createdAt: Date.now(),
                });

                // Update hero widget state with instanceId and element
                if (chat.heroWidget) {
                    chat.heroWidget.instanceId = result.instanceId;
                    chat.heroWidget.element = result.element;
                }

                // Apply metadata if provided
                if (heroWidget.metadata) {
                    const metadataAPI = chat.getWidgetMetadataAPI(tagDef.scope, tagDef.tag, result.instanceId, 'hero');

                    // If lucideIconName is provided, fetch the icon SVG
                    const metadataCopy = { ...heroWidget.metadata };
                    if (metadataCopy.lucideIconName && !metadataCopy.iconSvg) {
                        try {
                            metadataCopy.iconSvg = await getIconSvg(metadataCopy.lucideIconName, 'lucide');
                        } catch (error) {
                            console.error('[Hero] Failed to fetch lucide icon', {
                                iconName: metadataCopy.lucideIconName,
                                error,
                            });
                        }
                    }

                    metadataAPI.setMetadata(metadataCopy);
                }

                initialized = true;
            })
            .catch((error) => {
                console.error('[Hero] Failed to inject widget:', error);
            });
    });
</script>

<!-- 
    Use CSS visibility instead of {#if} to avoid destroying/recreating the widget on hide/show.
    This prevents orphaned widget instances in the registry and avoids re-injection overhead.
-->
{#if heroWidget}
    <div class="hero-container w-full mx-auto px-4 py-2" class:hidden={!heroVisible}>
        <div class="rounded-lg border bg-card shadow-sm overflow-hidden">
            <!-- Header Section -->
            <div class="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                    {#if iconSvg}
                        <div
                            class="icon-wrapper h-5 w-5 flex-shrink-0"
                            class:text-muted-foreground={!iconColor}
                            style={iconColor ? `color: ${iconColor}` : ''}
                        >
                            {@html iconSvg}
                        </div>
                    {/if}
                    <span class="text-sm font-semibold truncate" {title}>
                        {title}
                    </span>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                    {#if actions.length === 1 && instanceId}
                        <WidgetActionButton action={actions[0]} {instanceId} />
                    {:else if actions.length > 1 && instanceId}
                        <WidgetActionMenu {actions} {instanceId} />
                    {/if}
                </div>
            </div>

            <!-- Content Section -->
            <div class="relative" style="min-height: 150px; max-height: 400px; overflow-y: auto;">
                <div bind:this={containerEl} class="w-full h-full"></div>

                <!-- Loading overlay -->
                {#if loadingStatus?.loading || !instanceId}
                    <div class="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                        <div class="flex items-center gap-2">
                            <Spinner class="w-5 h-5" />
                            <span class="text-sm text-muted-foreground">
                                {loadingStatus?.loadingMsg || 'Loading...'}
                            </span>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .icon-wrapper :global(svg) {
        width: 100% !important;
        height: 100% !important;
        display: block;
    }

    .hero-container {
        animation: fadeIn 200ms ease-out;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-5px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
