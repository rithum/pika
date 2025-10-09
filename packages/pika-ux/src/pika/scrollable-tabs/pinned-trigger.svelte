<script lang="ts">
    import type { Snippet } from 'svelte';
    import { getScrollableTabsContext } from './context.svelte.js';
    import { cn } from '../../shadcn/utils.js';
    import X from '$icons/lucide/x';
    import PinOff from '$icons/lucide/pin-off';
    import { Button } from '../../shadcn/button/index.js';

    interface Props {
        value: string;
        class?: string;
        disabled?: boolean;
        children: Snippet;
    }

    let { value, class: className, disabled = false, children }: Props = $props();

    const context = getScrollableTabsContext();

    const isActive = $derived(context.getValue() === value);
    let isHovered = $state(false);

    function handleClick() {
        if (!disabled) {
            context.onValueChange(value);
        }
    }

    function handleClose(e: MouseEvent) {
        e.stopPropagation();
        context.onClose?.(value);
    }

    function handleUnpin(e: MouseEvent) {
        e.stopPropagation();
        context.onUnpin?.(value);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
        }
    }
</script>

<div
    role="tab"
    tabindex={disabled ? -1 : 0}
    aria-selected={isActive}
    onclick={handleClick}
    onkeydown={handleKeydown}
    onmouseenter={() => (isHovered = true)}
    onmouseleave={() => (isHovered = false)}
    class={cn(
        'group relative px-2 py-1 rounded-md text-xs font-medium rounded-t-md whitespace-nowrap transition-all cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'flex items-center gap-2',
        isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
        disabled && 'opacity-50 pointer-events-none',
        className
    )}
>
    <span class="flex-1">{@render children()}</span>
    <span class="flex items-center">
        {#if context.onUnpin}
            {#if isHovered && !disabled}
                <Button {disabled} variant="ghost" size="icon" onclick={handleUnpin} class="h-4 w-4 p-0">
                    <PinOff style="width: 0.75rem; height: 0.75rem;" />
                </Button>
            {:else}
                <div class="h-4 w-4"></div>
            {/if}
        {/if}
        {#if context.onClose}
            <Button {disabled} variant="ghost" size="icon" onclick={handleClose} class="h-4 w-4 p-0">
                <X style="width: 0.75rem; height: 0.75rem;" />
            </Button>
        {/if}
    </span>
</div>
