<script lang="ts">
    import { ChevronDown, TriangleAlert } from '$icons/lucide';
    import { slide } from 'svelte/transition';
    import type { Snippet } from 'svelte';

    interface Props {
        title: string;
        expanded: boolean;
        onToggle: () => void;
        children?: Snippet<[]>;
        hasErrors?: boolean;
    }

    let { title, expanded, onToggle, children, hasErrors = false }: Props = $props();
</script>

<section>
    <button
        class="flex items-center justify-between w-full text-left mb-4 hover:text-primary transition-colors"
        onclick={onToggle}
    >
        <div class="flex items-center gap-2">
            <ChevronDown class="w-5 h-5 transition-transform {expanded ? '' : '-rotate-90'}" />
            <h2 class="text-lg font-semibold">{title}</h2>
        </div>
        {#if hasErrors}
            <div class="flex items-center gap-1 text-red-600">
                <TriangleAlert class="w-4 h-4" />
                <span class="text-sm font-medium">Errors</span>
            </div>
        {/if}
    </button>
    {#if expanded}
        <div transition:slide={{ duration: 200 }}>
            {@render children?.()}
        </div>
    {/if}
</section>
