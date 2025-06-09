<script lang="ts">
    import { cn } from '$lib/utils.js';
    import type { WithElementRef } from 'bits-ui';
    import type { HTMLAttributes } from 'svelte/elements';
    import { useSlideout } from './context.svelte.js';

    let {
        ref = $bindable(null),
        class: className,
        children,
        ...restProps
    }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

    // Get the slideout context
    const slideout = useSlideout();

    // State for drag operations
    let startX = $state(0);
    let startWidth = $state(slideout.panelWidth);

    // Reference to the rail element
    let railRef = $state<HTMLButtonElement | null>(null);

    // Handle drag start
    function handleDragStart(e: MouseEvent) {
        slideout.setIsDragging(true);
        startX = e.clientX;
        startWidth = slideout.panelWidth;

        // Add event listeners for dragging
        window.addEventListener('mousemove', handleDragMove);
        window.addEventListener('mouseup', handleDragEnd);

        // Prevent text selection while dragging
        document.body.style.userSelect = 'none';
    }

    // Handle drag move
    function handleDragMove(e: MouseEvent) {
        if (!slideout.isDragging) return;

        const dx = e.clientX - startX;
        const newWidth = slideout.side === 'right' ? startWidth - dx : startWidth + dx;

        // Limit width between reasonable values
        // currentWidth = Math.max(200, Math.min(600, newWidth));
        slideout.setPanelWidth(newWidth);
    }

    // Handle drag end
    function handleDragEnd() {
        slideout.setIsDragging(false);

        // Remove event listeners
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);

        // Restore text selection
        document.body.style.userSelect = '';
    }

    // Cleanup on component destruction
    function cleanup() {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
    }

    const effectiveWidth = $derived.by(() => {
        const isOpen = slideout.open || (slideout.isMobile && slideout.openMobile);
        if (!isOpen) {
            return '0px'; // Use 0 width when closed
        }
        if (slideout.isMobile || slideout.isMaximized) {
            return '100%'; // Full width on mobile when open or when maximized
        }

        return `${slideout.panelWidth}px`; // Use context width on desktop when open
    });

    // add h-screen
</script>

<svelte:window on:beforeunload={cleanup} />
<div
    bind:this={ref}
    data-slideout="panel"
    data-side={slideout.side}
    data-state={slideout.state}
    style="width: {effectiveWidth}"
    ontransitionstart={() => (slideout.isAnimating = true)}
    ontransitionend={() => (slideout.isAnimating = false)}
    ontransitioncancel={() => (slideout.isAnimating = false)}
    class={cn(
        'h-screen flex-shrink-0 overflow-auto relative flex flex-col',
        'transition-all duration-300 ease-in-out',
        // Hide rail when collapsed or on mobile or when maximied unless specified otherwise
        (slideout.state === 'collapsed' || slideout.isMobile || slideout.isMaximized) &&
            '[&>[data-slideout=rail]]:hidden',
        className
    )}
    {...restProps}
>
    <!-- Panel content -->
    <div class="flex-1 overflow-auto min-w-0 h-full">
        {@render children?.()}
    </div>

    <!-- Rail/handle for resizing - integrated directly into panel -->
    <button
        bind:this={railRef}
        data-slideout="rail"
        aria-label="Resize Slideout"
        tabIndex={-1}
        onmousedown={handleDragStart}
        title="Resize Slideout"
        class={cn(
            'after:bg-sidebar-accent hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex',
            '[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize',
            '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
            'group-data-[collapsible=offcanvas]:hover:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full',
            '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2 [[data-side=right][data-collapsible=offcanvas]_&]:-left-2'
        )}
    >
        <!-- Optional: Add visual indicator for the rail for drag drop resize -->
    </button>
</div>
