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
    import type { ChatAppState } from '$lib/client/features/chat/chat-app.state.svelte';
    import { injectChatAppWebComponent } from '$lib/client/webcomponent-utils.js';
    import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';
    import { Button } from 'pika-ux/shadcn/button/index';
    import { type CarouselAPI } from 'pika-ux/shadcn/carousel/context';
    import * as Carousel from 'pika-ux/shadcn/carousel/index';
    import * as DropdownMenu from 'pika-ux/shadcn/dropdown-menu/index';
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

    const activeMode = $derived(userOverriddenMode ?? mode);
    const spotlightWidgets = $derived(chat.spotlightWidgets);
    const unpinnedWidgets = $derived(chat.getUnpinnedSpotlightWidgets());
    const hasUnpinnedWidgets = $derived(unpinnedWidgets.length > 0);

    // Initialize spotlight on mount
    $effect(() => {
        chat.initializeSpotlight();
    });

    // Inject web components when widgets change
    $effect(() => {
        if (activeMode === 'card') {
            injectWebComponents();
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

    async function injectWebComponents() {
        for (const widget of spotlightWidgets) {
            const tagId = `${widget.tagDefinition.scope}.${widget.tagDefinition.tag}`;
            const container = widgetContainers.get(tagId);

            if (container && widget.tagDefinition.widget.type === 'web-component') {
                await injectChatAppWebComponent(
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
            }
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
        widgetContainers.set(tagId, node);
        return {
            destroy() {
                widgetContainers.delete(tagId);
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

        {#if isVisible && spotlightWidgets.length > 0}
            <div class="spotlight-content" class:visible={isVisible}>
                <Carousel.Root setApi={(emblaApi: any) => (api = emblaApi)} opts={{ align: 'start' }}>
                    <Carousel.Content>
                        {#each spotlightWidgets as widget (widget.tagDefinition.scope + '.' + widget.tagDefinition.tag)}
                            {@const tagId = `${widget.tagDefinition.scope}.${widget.tagDefinition.tag}`}
                            <Carousel.Item class="basis-auto">
                                {#if activeMode === 'card'}
                                    <div class="p-2">
                                        <div
                                            role="button"
                                            tabindex="0"
                                            class="rounded-lg border-2 w-[250px] h-[175px] bg-white hover:shadow-lg transition-all cursor-pointer relative group"
                                            onmouseenter={() => (hoveredCardId = tagId)}
                                            onmouseleave={() => (hoveredCardId = undefined)}
                                        >
                                            {#if hoveredCardId === tagId}
                                                <div class="absolute top-2 right-2 flex gap-1 z-10">
                                                    <TooltipPlus tooltip="Unpin">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            class="h-8 w-8 bg-white/90 hover:bg-white shadow-sm"
                                                            onclick={(e) => {
                                                                e.stopPropagation();
                                                                handleUnpin(tagId);
                                                            }}
                                                        >
                                                            <PinOff class="h-4 w-4" />
                                                        </Button>
                                                    </TooltipPlus>
                                                    <TooltipPlus tooltip="Add to Chat as Context">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            class="h-8 w-8 bg-white/90 hover:bg-white shadow-sm"
                                                            onclick={(e) => {
                                                                e.stopPropagation();
                                                                handleAddToContext(tagId);
                                                            }}
                                                        >
                                                            <MessageCirclePlus class="h-4 w-4" />
                                                        </Button>
                                                    </TooltipPlus>
                                                </div>
                                            {/if}
                                            <div
                                                class="w-full h-full overflow-hidden flex"
                                                use:registerContainer={tagId}
                                            ></div>
                                        </div>
                                    </div>
                                {:else}
                                    <div class="p-1">
                                        <div
                                            role="button"
                                            tabindex="0"
                                            class="rounded-lg border-2 w-[200px] h-[60px] flex flex-row items-center gap-2 px-3 bg-white hover:shadow-lg transition-all cursor-pointer relative group"
                                            onmouseenter={() => (hoveredCardId = tagId)}
                                            onmouseleave={() => (hoveredCardId = undefined)}
                                        >
                                            {#if hoveredCardId === tagId}
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
                                            <h2 class="text-sm font-semibold">{widget.tagDefinition.tagTitle}</h2>
                                        </div>
                                    </div>
                                {/if}
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
</style>
