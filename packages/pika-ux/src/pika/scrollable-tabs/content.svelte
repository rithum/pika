<script lang="ts">
    import type { Snippet } from 'svelte';
    import { getScrollableTabsContext } from './context.svelte.js';
    import { cn } from '../../shadcn/utils.js';

    interface Props {
        value: string;
        class?: string;
        children: Snippet;
    }

    let { value, class: className, children }: Props = $props();

    const context = getScrollableTabsContext();

    const isActive = $derived(context.getValue() === value);
</script>

{#if isActive}
    <div class={cn('mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)}>
        {@render children()}
    </div>
{/if}
