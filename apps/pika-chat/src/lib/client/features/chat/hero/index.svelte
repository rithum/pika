<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { ChatAppState } from '$lib/client/features/chat/chat-app.state.svelte';
    import WidgetActionButton from '$lib/client/features/chat/widgets/widget-action-button.svelte';
    import WidgetActionMenu from '$lib/client/features/chat/widgets/widget-action-menu.svelte';
    import { injectChatAppWebComponent } from '$lib/client/webcomponent-utils.js';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import Spinner from 'pika-ux/shadcn/spinner/spinner.svelte';
    import { Button } from 'pika-ux/shadcn/button/index';
    import ChevronDown from '$icons/lucide/chevron-down';
    import ChevronUp from '$icons/lucide/chevron-up';
    import { getContext, onMount, onDestroy } from 'svelte';

    // DEBUG: Track component lifecycle
    const componentId = Math.random().toString(36).substring(2, 8);
    onMount(() => {
        console.log(`[Hero Svelte:${componentId}] 🟢 MOUNTED`);
    });
    onDestroy(() => {
        console.log(`[Hero Svelte:${componentId}] 🔴 DESTROYED`);
    });

    interface Props {
        /** When true, removes outer padding (for side-by-side layout) */
        compact?: boolean;
    }

    let { compact = false }: Props = $props();

    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');

    let containerEl = $state<HTMLElement>();
    let initialized = $state(false);
    let injecting = $state(false); // Synchronous guard to prevent double-injection race condition
    let instanceId = $state<string | undefined>(undefined);

    // Track the current hero widget to detect changes
    let currentHeroTagId = $state<string | undefined>(undefined);

    // DEBUG: Watch for container children changes
    $effect(() => {
        if (!containerEl) return;

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    console.log('[Hero Svelte] 🔍 MutationObserver: childList changed', {
                        addedNodes: mutation.addedNodes.length,
                        removedNodes: mutation.removedNodes.length,
                        containerChildCount: containerEl?.children?.length ?? 'N/A',
                    });
                    if (mutation.removedNodes.length > 0) {
                        console.log(
                            '[Hero Svelte] 🔍 REMOVED NODES:',
                            [...mutation.removedNodes].map((n) => n.nodeName)
                        );
                        console.log('[Hero Svelte] 🔍 Stack trace for removal:', new Error().stack);
                    }
                }
            }
        });

        observer.observe(containerEl, { childList: true, subtree: false });
        console.log('[Hero Svelte] 🔍 MutationObserver attached to containerEl');

        return () => {
            observer.disconnect();
            console.log('[Hero Svelte] 🔍 MutationObserver disconnected');
        };
    });

    const heroWidget = $derived(chat.heroWidget);
    const heroVisible = $derived(chat.heroVisible);
    const heroCollapsed = $derived(chat.heroCollapsed);

    // Initialize hero widget (auto-create if configured) - runs once on mount
    let heroInitialized = false;
    $effect(() => {
        if (!heroInitialized) {
            heroInitialized = true;
            chat.initializeHero();
        }
    });

    // Derived values for metadata - single source of truth: widgetMetadata map
    // Note: Access map.size to ensure Svelte tracks changes to the map
    const metadata = $derived.by(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        chat.widgetMetadata.size; // Force reactivity tracking on map changes
        return instanceId ? chat.widgetMetadata.get(instanceId) : undefined;
    });
    const title = $derived(metadata?.title ?? heroWidget?.tagDefinition.tagTitle ?? 'Hero');
    const actions = $derived(metadata?.actions ?? []);
    const iconSvg = $derived(metadata?.iconSvg);
    const iconColor = $derived(metadata?.iconColor);
    const loadingStatus = $derived(metadata?.loadingStatus);

    // Extract sizing config from tag definition's hero context
    const sizingConfig = $derived(heroWidget?.tagDefinition.renderingContexts?.hero?.sizing);

    // Compute dynamic styles for the hero container (width controls)
    const containerStyle = $derived.by(() => {
        const styles: string[] = [];
        styles.push(`min-width: ${sizingConfig?.minWidth ?? '200px'}`);
        styles.push(`max-width: ${sizingConfig?.maxWidth ?? '90%'}`);
        if (sizingConfig?.width) styles.push(`width: ${sizingConfig.width}`);
        return styles.join('; ');
    });

    // Compute dynamic styles for the content area (height controls)
    const contentStyle = $derived.by(() => {
        const minH = sizingConfig?.minHeight ?? 100;
        const maxH = sizingConfig?.maxHeight ?? 600;
        const styles = [`min-height: ${minH}px`, `max-height: ${maxH}px`, 'overflow-y: auto'];
        if (sizingConfig?.height) styles.push(`height: ${sizingConfig.height}`);
        return styles.join('; ');
    });

    // Inject web component when hero widget changes or visibility changes
    // We need to track heroVisible to re-inject when hero becomes visible again
    // after being hidden (which destroys the web component)
    $effect(() => {
        // Track heroVisible to trigger re-injection when hero becomes visible
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        heroVisible;

        console.log('[Hero Svelte] Effect triggered', {
            heroVisible,
            hasContainerEl: !!containerEl,
            hasHeroWidget: !!heroWidget,
            initialized,
            injecting,
            currentHeroTagId,
            instanceId,
            containerChildCount: containerEl?.children?.length ?? 'N/A',
        });

        if (!containerEl || !heroWidget) {
            console.log('[Hero Svelte] Early return - no containerEl or heroWidget');
            return;
        }

        const tagDef = heroWidget.tagDefinition;
        const tagId = `${tagDef.scope}.${tagDef.tag}`;

        // SYNCHRONOUS guards to prevent double-injection race condition
        // The `injecting` flag prevents a second injection while the first is in progress
        if (injecting) {
            console.log('[Hero Svelte] Early return - already injecting');
            return;
        }

        // Check if the web component element was destroyed (e.g., when hero was hidden)
        // If container is empty but we think we're initialized, we need to re-inject
        if (initialized && containerEl.children.length === 0) {
            console.log('[Hero Svelte] ⚠️ Container empty but initialized=true!', {
                initialized,
                instanceId,
                heroVisible,
                containerChildCount: containerEl.children.length,
                containerInnerHTML: containerEl.innerHTML.substring(0, 100),
            });
            console.log('[Hero Svelte] ⚠️ WHO CLEARED THE CONTAINER? Stack trace:', new Error().stack);
            initialized = false;
            instanceId = undefined;
        }

        // Only inject if this is a new/different hero widget
        if (initialized && currentHeroTagId === tagId && heroWidget.instanceId === instanceId) {
            console.log('[Hero Svelte] Early return - already initialized with same widget');
            return;
        }

        // Clear container if switching to different widget
        if (currentHeroTagId !== tagId && containerEl.children.length > 0) {
            console.log('[Hero Svelte] Clearing container - switching to different widget');
            containerEl.innerHTML = '';
            initialized = false;
        }

        // Set synchronous guard BEFORE async operation
        console.log('[Hero Svelte] INJECTING new hero widget:', tagId);
        injecting = true;
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
                console.log('[Hero Svelte] Injection SUCCESS, instanceId:', result.instanceId);
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
                injecting = false;
                console.log('[Hero Svelte] Injection COMPLETE, initialized:', initialized);
            })
            .catch((error) => {
                console.error('[Hero] Failed to inject widget:', error);
                injecting = false;
            });
    });
</script>

<!-- 
    Hero widget display states:
    1. Hidden (heroVisible=false): No UI shown - widget runs in background (programmatic only)
    2. Collapsed (heroVisible=true, heroCollapsed=true): Just header bar with title and expand caret
    3. Expanded (heroVisible=true, heroCollapsed=false): Full widget with header and content
    
    User can only toggle between collapsed and expanded.
    Widgets can programmatically show/hide/collapse/expand.
-->
{#if heroWidget}
    <!-- Hero container - uses CSS-based show/hide to preserve widget state -->
    <div class="hero-container {compact ? '' : 'mx-auto px-4 mt-1'}" class:hidden={!heroVisible} style={containerStyle}>
        <!-- Collapsed: Simple header bar -->
        <div class="flex items-center justify-between min-h-9" class:hidden={!heroCollapsed}>
            <div class="flex items-center gap-1.5">
                {#if iconSvg}
                    <div
                        class="icon-wrapper h-5 w-5 flex-shrink-0"
                        class:text-muted-foreground={!iconColor}
                        style={iconColor ? `color: ${iconColor}` : ''}
                    >
                        {@html iconSvg}
                    </div>
                {/if}
                <span class="text-md font-semibold">{title}</span>
                <Button
                    variant="ghost"
                    size="icon"
                    class="w-6 h-6"
                    onclick={() => chat.expandHero()}
                    aria-label="Expand hero widget"
                >
                    <ChevronDown class="w-4 h-4" />
                </Button>
            </div>
        </div>

        <!-- Expanded: Full widget with card styling -->
        <div class="rounded-lg border bg-card shadow-sm overflow-hidden" class:hidden={heroCollapsed}>
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

                    <!-- Collapse button -->
                    <Button
                        variant="ghost"
                        size="icon"
                        class="w-6 h-6"
                        onclick={() => chat.collapseHero()}
                        aria-label="Collapse hero widget"
                    >
                        <ChevronUp class="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <!-- Content Section -->
            <div class="relative" style={contentStyle}>
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
