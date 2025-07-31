<script lang="ts">
    import { cn } from '$ui/shadcn/utils.js';
    import type { WithElementRef } from 'bits-ui';
    import type { HTMLAttributes } from 'svelte/elements';
    import { SLIDEOUT_DEFAULT_WIDTH, SLIDEOUT_WIDTH, SLIDEOUT_WIDTH_ICON } from './constants.js';
    import { setSlideout } from './context.svelte.js';

    interface Props extends WithElementRef<HTMLAttributes<HTMLDivElement>> {
        open?: boolean;
        onOpenChange?: (open: boolean) => void;
        side?: 'left' | 'right';
        initialWidth?: number;
    }

    let {
        ref = $bindable(null),
        open = $bindable(false),
        onOpenChange = () => {},
        side = 'right',
        initialWidth = SLIDEOUT_DEFAULT_WIDTH,
        class: className,
        style,
        children,
        ...restProps
    }: Props = $props();

    const slideout = setSlideout({
        open: () => open,
        setOpen: (value: boolean) => {
            open = value;
            onOpenChange(value);
        },
        side,
        initialWidth,
    });
</script>

<svelte:window onkeydown={slideout.handleShortcutKeydown} />

<div
    style="--slideout-width: {SLIDEOUT_WIDTH}; --slideout-width-icon: {SLIDEOUT_WIDTH_ICON}; {style}"
    class={cn('group/slideout-wrapper flex h-full w-full overflow-hidden', className)}
    data-side={side}
    data-state={slideout.state}
    bind:this={ref}
    {...restProps}
>
    {@render children?.()}
</div>
