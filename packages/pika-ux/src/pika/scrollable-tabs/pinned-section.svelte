<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '../../shadcn/utils.js';

    interface Props {
        class?: string;
        children: Snippet;
        onVisibleCountChange?: (visibleCount: number) => void;
        totalTabs?: number;
    }

    let { class: className, children, onVisibleCountChange, totalTabs = 0 }: Props = $props();

    let container: HTMLDivElement;
    let visibleCount = $state(totalTabs);
    let isCalculating = false;
    let lastContainerWidth = 0;
    let isExpanding = false;

    function calculateVisibleTabs() {
        if (!container || totalTabs === 0 || isCalculating) return;

        isCalculating = true;

        try {
            const containerWidth = container.clientWidth;

            // Track if we're expanding or contracting
            isExpanding = containerWidth > lastContainerWidth;
            console.log(`[PinnedSection] Calculate: width=${containerWidth}, last=${lastContainerWidth}, expanding=${isExpanding}, visible=${visibleCount}/${totalTabs}`);
            lastContainerWidth = containerWidth;

            const tabs = Array.from(container.querySelectorAll('[role="tab"]')) as HTMLElement[];

            if (tabs.length === 0) {
                // Initial render, show all
                if (visibleCount !== totalTabs) {
                    visibleCount = totalTabs;
                    onVisibleCountChange?.(totalTabs);
                }
                return;
            }

            const gap = 4; // gap-1 = 0.25rem = 4px
            const padding = 16; // px-2 = 0.5rem * 2 = 16px
            const menuButtonWidth = 32; // Space for overflow menu button

            // Measure current visible tabs
            let totalWidth = 0;
            for (let i = 0; i < tabs.length; i++) {
                totalWidth += tabs[i].offsetWidth + (i > 0 ? gap : 0);
            }

            const availableNoMenu = containerWidth - padding;
            const availableWithMenu = availableNoMenu - menuButtonWidth;

            console.log(`[PinnedSection] totalWidth=${totalWidth}, availableNoMenu=${availableNoMenu}, availableWithMenu=${availableWithMenu}`);

            let newCount = visibleCount;

            // Check if current tabs are overflowing
            if (totalWidth > availableNoMenu) {
                console.log(`[PinnedSection] OVERFLOWING - hiding tabs`);
                // We're overflowing, need to hide tabs
                // Calculate with menu button space
                let accumulatedWidth = 0;
                newCount = 0;
                for (let i = 0; i < tabs.length; i++) {
                    const tabWidth = tabs[i].offsetWidth;
                    if (accumulatedWidth + tabWidth + (i > 0 ? gap : 0) <= availableWithMenu) {
                        accumulatedWidth += tabWidth + (i > 0 ? gap : 0);
                        newCount++;
                    } else {
                        break;
                    }
                }
            } else if (visibleCount < totalTabs && isExpanding) {
                console.log(`[PinnedSection] EXPANDING - trying to show more`);
                // We have space and expanding - keep showing more tabs as long as they fit
                // We need to estimate the width of hidden tabs to know if they'll fit
                // Assume average width of current visible tabs
                const avgTabWidth = tabs.length > 0 ? totalWidth / tabs.length : 80;

                // Calculate how many more tabs we can fit
                let remainingSpace = availableNoMenu - totalWidth;
                let canFitMore = Math.floor(remainingSpace / (avgTabWidth + gap));

                console.log(`[PinnedSection] avgTabWidth=${avgTabWidth}, remainingSpace=${remainingSpace}, canFitMore=${canFitMore}`);

                newCount = Math.min(visibleCount + Math.max(1, canFitMore), totalTabs);
            } else {
                console.log(`[PinnedSection] NO CHANGE - visibleCount=${visibleCount}, totalTabs=${totalTabs}, isExpanding=${isExpanding}`);
            }

            if (visibleCount !== newCount) {
                const oldCount = visibleCount;
                visibleCount = newCount;
                onVisibleCountChange?.(newCount);

                console.log(`[PinnedSection] Changed from ${oldCount} to ${newCount}`);

                // If we showed more tabs and haven't reached the total,
                // schedule another check to see if even more will fit
                if (newCount > oldCount && newCount < totalTabs && isExpanding) {
                    console.log(`[PinnedSection] Scheduling re-check...`);
                    setTimeout(() => calculateVisibleTabs(), 20);
                }
            }
        } finally {
            isCalculating = false;
        }
    }

    $effect(() => {
        if (container) {
            let timeoutId: ReturnType<typeof setTimeout>;

            // Initial check with slight delay to ensure content is rendered
            timeoutId = setTimeout(() => calculateVisibleTabs(), 10);

            // Watch for resize with debouncing
            const resizeObserver = new ResizeObserver(() => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => calculateVisibleTabs(), 50);
            });
            resizeObserver.observe(container);

            return () => {
                clearTimeout(timeoutId);
                resizeObserver.disconnect();
            };
        }
    });
</script>

<div bind:this={container} class={cn('flex-shrink flex items-center gap-1 px-2 overflow-hidden min-w-0', className)}>
    {@render children()}
</div>
