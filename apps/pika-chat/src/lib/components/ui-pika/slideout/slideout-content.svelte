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

    const slideout = useSlideout();
    const isPanelOpen = $derived(slideout.open || (slideout.isMobile && slideout.openMobile));

    // add max-hieght: 100vh (max-h-screen)
</script>

<div
    bind:this={ref}
    data-slideout="content"
    class={cn(
        // 'flex flex-col h-full flex-1 overflow-auto transition-all duration-300 ease-in-out',
        'max-h-screen flex flex-col h-full flex-1 overflow-auto transition-all duration-300 ease-in-out min-w-0', // Added min-w-0
        // slideout.isMobile && 'data-[panel-open=true]:hidden',
        // You might hide it explicitly on mobile, or let flexbox handle it (panel width 100%)
        slideout.isMobile && isPanelOpen && 'hidden', // Keep explicit hide for mobile clarity
        className
    )}
    data-panel-open={isPanelOpen}
    {...restProps}
>
    {@render children?.()}
</div>
<!-- data-panel-open={slideout.open || (slideout.isMobile && slideout.openMobile)} -->
