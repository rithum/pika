<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '../../shadcn/utils.js';

    interface Props {
        class?: string;
        children: Snippet;
    }

    let { class: className, children }: Props = $props();
</script>

<div class={cn('flex items-center rounded-md bg-muted/30', className)}>
    {@render children()}
</div>
