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

    // Use the slideout context
    const slideout = useSlideout();

    // h-full => h-screen
</script>

<div
    bind:this={ref}
    data-slideout="root"
    data-side={slideout.side}
    data-state={slideout.state}
    class={cn(
        'flex h-screen w-full relative overflow-hidden',
        slideout.side === 'right' ? 'flex-row' : 'flex-row-reverse',
        className
    )}
    {...restProps}
>
    {@render children?.()}
</div>
