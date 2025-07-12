<script lang="ts">
    import { ChevronDown } from '$icons/lucide';
    import { slide } from 'svelte/transition';
    import type { Snippet } from 'svelte';

    interface Props {
        title: string;
        expanded: boolean;
        onToggle: () => void;
        children?: Snippet<[]>;
    }

    let { title, expanded, onToggle, children }: Props = $props();
</script>

<section>
    <button
        class="flex items-center gap-2 w-full text-left mb-4 hover:text-primary transition-colors"
        onclick={onToggle}
    >
        <ChevronDown class="w-5 h-5 transition-transform {expanded ? '' : '-rotate-90'}" />
        <h2 class="text-lg font-semibold">{title}</h2>
    </button>
    {#if expanded}
        <div transition:slide={{ duration: 200 }}>
            {@render children?.()}
        </div>
    {/if}
</section>
