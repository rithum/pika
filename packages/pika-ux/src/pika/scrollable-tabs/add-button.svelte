<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '../../shadcn/utils.js';

    interface Props {
        onclick?: () => void;
        class?: string;
        disabled?: boolean;
        children?: Snippet;
    }

    let { onclick, class: className, disabled = false, children }: Props = $props();
</script>

<div class={cn('flex-shrink-0 px-2', className)}>
    <button
        type="button"
        {onclick}
        {disabled}
        class={cn(
            'px-3 py-2 rounded-full transition-all',
            'bg-muted hover:bg-muted/80 text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:pointer-events-none disabled:opacity-50'
        )}
    >
        {#if children}
            {@render children()}
        {:else}
            ＋
        {/if}
    </button>
</div>
