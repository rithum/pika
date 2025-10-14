<script lang="ts">
    import ChevronDown from '$icons/lucide/chevron-down';
    import ChevronUp from '$icons/lucide/chevron-up';
    import Maximize2 from '$icons/lucide/maximize-2';
    import MessageCirclePlus from '$icons/lucide/message-circle-plus';
    import Minimize2 from '$icons/lucide/minimize-2';
    import PinOff from '$icons/lucide/pin-off';
    import Plus from '$icons/lucide/plus';
    import Settings from '$icons/lucide/settings';
    import SpotlightIcon from '$icons/lucide/spotlight';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { ChatAppState, SpotlightWidget } from '$lib/client/features/chat/chat-app.state.svelte';
    import WidgetActionButton from '$lib/client/features/chat/widgets/widget-action-button.svelte';
    import WidgetActionMenu from '$lib/client/features/chat/widgets/widget-action-menu.svelte';
    import { injectChatAppWebComponent } from '$lib/client/webcomponent-utils.js';
    import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';
    import { Button } from 'pika-ux/shadcn/button/index';
    import { type CarouselAPI } from 'pika-ux/shadcn/carousel/context';
    import * as Carousel from 'pika-ux/shadcn/carousel/index';
    import * as DropdownMenu from 'pika-ux/shadcn/dropdown-menu/index';
    import Spinner from 'pika-ux/shadcn/spinner/spinner.svelte';
    import type { Snippet } from 'svelte';
    import { getContext } from 'svelte';

    interface Props {
        children?: Snippet<[]>;
        mode: 'thumbnail' | 'card';
    }

    const { children, mode }: Props = $props();
    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');

    let api = $state<CarouselAPI>();
    let current = $state(0);
    let count = $state(0);
    let userOverriddenMode = $state<'thumbnail' | 'card' | undefined>(undefined);
    let isVisible = $state(true);
    let hoveredCardId = $state<string | undefined>(undefined);
    let widgetContainers = $state<Map<string, HTMLElement>>(new Map());
    let widgetInstanceIds = $state<Map<string, string>>(new Map()); // tagId -> instanceId mapping

    // Track injection state to prevent duplicate injections
    let injectingWidgets = $state<Set<string>>(new Set()); // Currently being injected
    let injectedWidgets = $state<Set<string>>(new Set()); // Successfully injected

    const activeMode = $derived(userOverriddenMode ?? mode);
    const spotlightWidgets = $derived(chat.spotlightWidgets);
    const unpinnedWidgets = $derived(chat.getUnpinnedSpotlightWidgets());
    const hasUnpinnedWidgets = $derived(unpinnedWidgets.length > 0);

    // Track which widgets should be injected based on current widget list
    const currentWidgetIds = $derived(
        new Set(spotlightWidgets.map((w) => `${w.tagDefinition.scope}.${w.tagDefinition.tag}`))
    );

    // Initialize spotlight on mount ONCE
    let initialized = false;
    $effect(() => {
        if (!initialized) {
            // console.log('[Spotlight] Initializing spotlight (once)');
            chat.initializeSpotlight();
            initialized = true;
        }
    });

    // Inject web components when needed
    $effect(() => {
        // console.log('[Spotlight] Effect triggered', {
        //     activeMode,
        //     widgetsCount: spotlightWidgets.length,
        //     widgetIds: Array.from(currentWidgetIds),
        //     containerCount: widgetContainers.size,
        //     injectedCount: injectedWidgets.size,
        //     injectingCount: injectingWidgets.size,
        // });

        // Only inject when in card mode (lazy injection)
        // Containers are always rendered but hidden in thumbnail mode
        if (activeMode === 'card' && spotlightWidgets.length > 0) {
            // Inject any widgets that need injection
            for (const widget of spotlightWidgets) {
                const tagId = `${widget.tagDefinition.scope}.${widget.tagDefinition.tag}`;

                // Skip if already injected or currently injecting
                if (injectedWidgets.has(tagId) || injectingWidgets.has(tagId)) {
                    continue;
                }

                const container = widgetContainers.get(tagId);
                if (container && widget.tagDefinition.widget.type === 'web-component') {
                    // console.log('[Spotlight] Queueing injection for', tagId);
                    injectWidget(widget, container, tagId);
                }
            }
        }

        // Clean up widgets that are no longer in the list
        for (const tagId of injectedWidgets) {
            if (!currentWidgetIds.has(tagId)) {
                // console.log('[Spotlight] Cleaning up removed widget', tagId);
                injectedWidgets.delete(tagId);
                widgetInstanceIds.delete(tagId);
                injectingWidgets.delete(tagId);
            }
        }
    });

    $effect(() => {
        if (api) {
            // Initialize count and current position
            count = api.scrollSnapList().length;
            current = api.selectedScrollSnap() + 1;

            // Listen for selection changes
            api.on('select', () => {
                current = api!.selectedScrollSnap() + 1;
            });

            // Listen for reInit events to update count
            api.on('reInit', () => {
                count = api!.scrollSnapList().length;
                current = api!.selectedScrollSnap() + 1;
            });
        }
    });

    // Reinitialize carousel when mode changes to recalculate snap points
    $effect(() => {
        if (api && activeMode) {
            // Use setTimeout to ensure DOM has updated with new sizes
            setTimeout(() => {
                if (api) {
                    api.reInit();
                }
            }, 0);
        }
    });

    // Separate async injection function
    async function injectWidget(widget: SpotlightWidget, container: HTMLElement, tagId: string) {
        // Mark as injecting IMMEDIATELY (synchronous)
        injectingWidgets.add(tagId);
        injectingWidgets = new Set(injectingWidgets); // Trigger reactivity

        // console.log('[Spotlight] Starting injection for', tagId);

        try {
            // Only inject if container is empty (not re-injecting existing component)
            if (container.children.length > 0) {
                // console.log('[Spotlight] Container already has children, skipping injection', {
                //     tagId,
                //     childCount: container.children.length,
                // });
                // Mark as injected since it already exists
                injectedWidgets.add(tagId);
                injectedWidgets = new Set(injectedWidgets);
                return;
            }

            const instanceId = await injectChatAppWebComponent(
                widget.tagDefinition,
                container,
                {
                    renderingContext: 'spotlight',
                    appState: appState,
                    chatAppState: chat,
                    chatAppId: chat.chatApp.chatAppId,
                },
                true
            );

            // Store instance ID
            widgetInstanceIds.set(tagId, instanceId);
            widgetInstanceIds = new Map(widgetInstanceIds); // Trigger reactivity

            // Mark as successfully injected
            injectedWidgets.add(tagId);
            injectedWidgets = new Set(injectedWidgets); // Trigger reactivity

            // console.log('[Spotlight] Successfully injected', { tagId, instanceId });
        } catch (error) {
            console.error('[Spotlight] Failed to inject widget', { tagId, error });
        } finally {
            // Remove from injecting state
            injectingWidgets.delete(tagId);
            injectingWidgets = new Set(injectingWidgets); // Trigger reactivity
        }
    }

    async function handleUnpin(tagId: string) {
        await chat.removeFromSpotlight(tagId);
    }

    async function handleRepin(tagId: string) {
        await chat.addToSpotlight(tagId);
    }

    function handleAddToContext(tagId: string) {
        console.log('Add to context:', tagId);
    }

    function registerContainer(node: HTMLElement, tagId: string) {
        // console.log('[Spotlight] Registering container', {
        //     tagId,
        //     hasExistingChildren: node.children.length > 0,
        // });

        widgetContainers.set(tagId, node);
        widgetContainers = new Map(widgetContainers); // Trigger reactivity

        return {
            destroy() {
                // console.log('[Spotlight] Unregistering container', tagId);
                widgetContainers.delete(tagId);

                // Don't clear injectedWidgets - the component is hidden, not destroyed
                // It will be shown again when switching back to card mode
            },
        };
    }
</script>

{#if spotlightWidgets.length > 0}
    <div class="w-full max-w-5xl mx-auto mt-2">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 min-h-9">
                <SpotlightIcon class="w-5 h-5" />
                <span class="text-md font-semibold">Spotlight</span>
                <Button
                    variant="ghost"
                    size="icon"
                    class="w-6 h-6"
                    onclick={() => {
                        isVisible = !isVisible;
                    }}
                    aria-label={isVisible ? 'Hide spotlight' : 'Show spotlight'}
                >
                    {#if isVisible}
                        <ChevronUp class="w-4 h-4" />
                    {:else}
                        <ChevronDown class="w-4 h-4" />
                    {/if}
                </Button>
            </div>
            <div class="flex items-center gap-1">
                {#if isVisible}
                    <Button
                        variant="ghost"
                        size="icon"
                        onclick={() => {
                            if (userOverriddenMode === undefined) {
                                userOverriddenMode = activeMode === 'card' ? 'thumbnail' : 'card';
                            } else {
                                userOverriddenMode = userOverriddenMode === 'card' ? 'thumbnail' : 'card';
                            }
                        }}
                        aria-label={activeMode === 'card' ? 'Switch to thumbnail view' : 'Switch to card view'}
                    >
                        {#if activeMode === 'card'}
                            <Minimize2 class="w-4 h-4" />
                        {:else}
                            <Maximize2 class="w-4 h-4" />
                        {/if}
                    </Button>
                    {#if hasUnpinnedWidgets}
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger>
                                <Button variant="ghost" size="icon">
                                    <Settings class="w-4 h-4" />
                                </Button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content>
                                <DropdownMenu.Label>Unpinned Widgets</DropdownMenu.Label>
                                <DropdownMenu.Separator />
                                <DropdownMenu.Group>
                                    {#each unpinnedWidgets as widget}
                                        {@const tagId = `${widget.scope}.${widget.tag}`}
                                        <DropdownMenu.Item onclick={() => handleRepin(tagId)}>
                                            <Plus class="w-4 h-4 mr-2" />
                                            {widget.tagTitle}
                                        </DropdownMenu.Item>
                                    {/each}
                                </DropdownMenu.Group>
                            </DropdownMenu.Content>
                        </DropdownMenu.Root>
                    {/if}
                {/if}
            </div>
        </div>

        {#if spotlightWidgets.length > 0}
            <div class="spotlight-content {isVisible ? 'visible' : 'hidden'}">
                <Carousel.Root setApi={(emblaApi: any) => (api = emblaApi)} opts={{ align: 'start' }}>
                    <Carousel.Content>
                        {#each spotlightWidgets as widget (widget.tagDefinition.scope + '.' + widget.tagDefinition.tag)}
                            {@const tagId = `${widget.tagDefinition.scope}.${widget.tagDefinition.tag}`}
                            {@const instanceId = widgetInstanceIds.get(tagId)}
                            {@const metadata = instanceId ? chat.widgetMetadata.get(instanceId) : undefined}
                            {@const title = metadata?.title ?? widget.tagDefinition.tagTitle}
                            {@const actions = metadata?.actions ?? []}
                            {@const iconSvg = metadata?.iconSvg}
                            {@const iconColor = metadata?.iconColor}
                            {@const loadingStatus = metadata?.loadingStatus}
                            <!-- {console.log(
                                `[Spotlight] Widget ${tagId}: instanceId=${instanceId}, metadata=`,
                                metadata,
                                'loadingStatus=',
                                loadingStatus
                            )} -->

                            <Carousel.Item class="basis-auto">
                                <!-- Card View - always rendered but hidden when not active -->
                                <div class="p-2" class:hidden={activeMode !== 'card'}>
                                    <div
                                        role="button"
                                        tabindex="0"
                                        class="rounded-lg border-2 w-[250px] h-[200px] bg-white transition-all group flex flex-col overflow-hidden"
                                        onmouseenter={() => (hoveredCardId = tagId)}
                                        onmouseleave={() => (hoveredCardId = undefined)}
                                    >
                                        <!-- Header Section (fixed height, always present) -->
                                        <div
                                            class="w-full flex-shrink-0 bg-gray-50/75 pt-0.5 backdrop-blur-sm border-b border-gray-100 px-1.5 flex items-center justify-between rounded-t-lg min-h-[22px]"
                                        >
                                            <div class="flex items-center gap-1 min-w-0 flex-1">
                                                {#if iconSvg}
                                                    <div
                                                        class="icon-wrapper h-4 w-4 flex-shrink-0"
                                                        class:text-muted-foreground={!iconColor}
                                                        style={iconColor ? `color: ${iconColor}` : ''}
                                                    >
                                                        {@html iconSvg}
                                                    </div>
                                                {/if}
                                                <span class="text-[0.70rem] font-medium truncate leading-none" {title}>
                                                    {title}
                                                </span>
                                            </div>
                                            <div class="flex items-center gap-0.5 flex-shrink-0 -mr-0.5">
                                                {#if actions.length === 1}
                                                    <WidgetActionButton action={actions[0]} />
                                                {:else if actions.length > 1}
                                                    <WidgetActionMenu {actions} />
                                                {/if}
                                            </div>
                                        </div>

                                        <!-- Content Section (takes remaining height) -->
                                        <div class="w-full flex-1 overflow-y-auto relative">
                                            <!-- Widget Container -->
                                            <div class="w-full min-h-full" use:registerContainer={tagId}></div>

                                            <!-- Footer Section (overlays on content, animates up) -->

                                            <!-- Footer Section (optional, overlays on content, animates up) -->
                                            <!-- {console.log(
                                                `[Spotlight Loading Check] ${tagId}: loadingStatus?.loading=${loadingStatus?.loading}, !instanceId=${!instanceId}, shouldShow=${loadingStatus?.loading || !instanceId}`
                                            )} -->
                                            {#if loadingStatus?.loading || !instanceId}
                                                <div
                                                    class="absolute bottom-0 left-0 right-0 border-t px-2 py-2 flex items-center justify-center bg-gray-50/95 backdrop-blur-sm rounded-b-md footer-overlay"
                                                >
                                                    <Spinner class="w-4 h-4 mr-2" />
                                                    <span class="text-xs"
                                                        >{loadingStatus?.loadingMsg || 'One sec.  AI is on it...'}</span
                                                    >
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                </div>

                                <!-- Thumbnail View - always rendered but hidden when not active -->
                                <div class="p-1" class:hidden={activeMode !== 'thumbnail'}>
                                    <div
                                        role="button"
                                        tabindex="0"
                                        class="rounded-lg border-2 w-[200px] h-[60px] flex flex-row items-center gap-2 px-3 bg-white hover:shadow-lg transition-all cursor-pointer relative group"
                                        onmouseenter={() => (hoveredCardId = tagId)}
                                        onmouseleave={() => (hoveredCardId = undefined)}
                                    >
                                        {#if hoveredCardId === tagId && activeMode === 'thumbnail'}
                                            <div class="absolute top-1 right-1 flex gap-1 z-10">
                                                <TooltipPlus tooltip="Unpin">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        class="h-6 w-6 bg-white/90 hover:bg-white shadow-sm"
                                                        onclick={(e) => {
                                                            e.stopPropagation();
                                                            handleUnpin(tagId);
                                                        }}
                                                    >
                                                        <PinOff class="h-3 w-3" />
                                                    </Button>
                                                </TooltipPlus>
                                                <TooltipPlus tooltip="Add to Chat as Context">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        class="h-6 w-6 bg-white/90 hover:bg-white shadow-sm"
                                                        onclick={(e) => {
                                                            e.stopPropagation();
                                                            handleAddToContext(tagId);
                                                        }}
                                                    >
                                                        <MessageCirclePlus class="h-3 w-3" />
                                                    </Button>
                                                </TooltipPlus>
                                            </div>
                                        {/if}
                                        <div class="flex items-center gap-2 min-w-0 flex-1">
                                            {#if iconSvg}
                                                <div
                                                    class="icon-wrapper h-4 w-4 flex-shrink-0"
                                                    class:text-muted-foreground={!iconColor}
                                                    style={iconColor ? `color: ${iconColor}` : ''}
                                                >
                                                    {@html iconSvg}
                                                </div>
                                            {/if}
                                            <h2 class="text-sm font-semibold truncate" {title}>{title}</h2>
                                        </div>
                                    </div>
                                </div>
                            </Carousel.Item>
                        {/each}
                    </Carousel.Content>
                    {#if count > 1}
                        <Carousel.Previous class="ml-12" />
                        <Carousel.Next class="mr-12" />
                    {/if}
                </Carousel.Root>

                {#if count > 1}
                    {#if activeMode === 'card'}
                        <div class="flex justify-center gap-2 mt-6">
                            {#each Array(count) as _, index}
                                <Button
                                    class={`w-3 h-3 p-0 rounded-full transition-colors ${
                                        current === index + 1 ? 'bg-primary' : 'bg-gray-300 hover:bg-gray-400'
                                    }`}
                                    onclick={() => api?.scrollTo(index)}
                                    aria-label={`Go to slide ${index + 1}`}
                                ></Button>
                            {/each}
                        </div>
                    {:else}
                        <div class="flex justify-center gap-2 mt-3">
                            {#each Array(count) as _, index}
                                <Button
                                    class={`w-2 h-2 p-0 rounded-full transition-colors ${
                                        current === index + 1 ? 'bg-primary' : 'bg-gray-300 hover:bg-gray-400'
                                    }`}
                                    onclick={() => api?.scrollTo(index)}
                                    aria-label={`Go to slide ${index + 1}`}
                                ></Button>
                            {/each}
                        </div>
                    {/if}
                {/if}
            </div>
        {/if}
    </div>
{/if}

<style>
    .icon-wrapper :global(svg) {
        width: 100% !important;
        height: 100% !important;
        display: block;
    }

    .spotlight-content {
        animation: slideDown 300ms ease-out;
        transform-origin: top;
    }

    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .footer-overlay {
        animation: slideUp 300ms ease-out;
    }

    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateY(100%);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
