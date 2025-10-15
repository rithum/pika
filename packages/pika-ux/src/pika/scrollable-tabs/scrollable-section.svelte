<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '../../shadcn/utils.js';
    import ChevronLeft from '$icons/lucide/chevron-left';
    import ChevronRight from '$icons/lucide/chevron-right';
    import { Button } from '../../shadcn/button/index.js';

    interface Props {
        class?: string;
        children: Snippet;
        onInsufficientSpace?: (insufficient: boolean) => void;
        minUsefulWidth?: number;
    }

    let { class: className, children, onInsufficientSpace, minUsefulWidth = 150 }: Props = $props();

    let containerWrapper: HTMLDivElement;
    let scrollContainer: HTMLDivElement;
    let hasOverflow = $state(false);
    let canScrollLeft = $state(false);
    let canScrollRight = $state(false);
    let hasInsufficientSpace = $state(false);
    let isUpdating = false;

    function updateScrollButtons() {
        if (!scrollContainer || !containerWrapper || isUpdating) return;

        isUpdating = true;

        try {
            const isOverflowing = scrollContainer.scrollWidth > scrollContainer.clientWidth;
            hasOverflow = isOverflowing;
            canScrollLeft = scrollContainer.scrollLeft > 0;
            canScrollRight = scrollContainer.scrollLeft < scrollContainer.scrollWidth - scrollContainer.clientWidth - 1;

            // Check if we have enough space to be useful
            const currentWidth = containerWrapper.clientWidth;
            const insufficient = currentWidth < minUsefulWidth;
            if (hasInsufficientSpace !== insufficient) {
                hasInsufficientSpace = insufficient;
                onInsufficientSpace?.(insufficient);
            }
        } finally {
            isUpdating = false;
        }
    }

    function scrollLeft() {
        if (scrollContainer) {
            scrollContainer.scrollBy({ left: -200, behavior: 'smooth' });
        }
    }

    function scrollRight() {
        if (scrollContainer) {
            scrollContainer.scrollBy({ left: 200, behavior: 'smooth' });
        }
    }

    $effect(() => {
        if (scrollContainer && containerWrapper) {
            let timeoutId: ReturnType<typeof setTimeout>;

            // Initial check with slight delay to ensure content is rendered
            timeoutId = setTimeout(() => updateScrollButtons(), 10);

            // Watch for resize with debouncing
            const resizeObserver = new ResizeObserver(() => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => updateScrollButtons(), 50);
            });
            resizeObserver.observe(containerWrapper);
            resizeObserver.observe(scrollContainer);

            // Also observe the inner content
            const innerContent = scrollContainer.querySelector('div');
            if (innerContent) {
                resizeObserver.observe(innerContent);
            }

            return () => {
                clearTimeout(timeoutId);
                resizeObserver.disconnect();
            };
        }
    });
</script>

<div bind:this={containerWrapper} class={cn('flex-1 flex items-center gap-0 min-w-0 bg-white', className)}>
    <!-- Left scroll button -->
    {#if hasOverflow}
        <div class="flex-shrink-0">
            <Button variant="ghost" size="icon" onclick={scrollLeft} disabled={!canScrollLeft} class="w-7">
                <ChevronLeft style="width: 1rem; height: 1rem;" />
            </Button>
        </div>
    {/if}

    <!-- Scrollable tabs area -->
    <div bind:this={scrollContainer} onscroll={updateScrollButtons} class="flex-1 min-w-0 overflow-x-auto scroll-smooth" style="scrollbar-width: none; -ms-overflow-style: none;">
        <div class="flex items-center gap-1 px-2">
            {@render children()}
        </div>
    </div>

    <!-- Right scroll button -->
    {#if hasOverflow}
        <div class="flex-shrink-0">
            <Button variant="ghost" size="icon" onclick={scrollRight} disabled={!canScrollRight} class="w-7">
                <ChevronRight style="width: 1rem; height: 1rem;" />
            </Button>
        </div>
    {/if}
</div>

<style>
    div::-webkit-scrollbar {
        display: none;
    }
</style>
