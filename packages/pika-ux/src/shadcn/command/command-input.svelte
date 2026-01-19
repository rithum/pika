<script lang="ts">
    import { Command as CommandPrimitive } from 'bits-ui';
    import SearchIcon from '$icons/lucide/search';
    import { cn } from '../utils.js';

    let { ref = $bindable(null), class: className, value = $bindable(''), ...restProps }: CommandPrimitive.InputProps = $props();
</script>

<div class="flex h-9 items-center gap-2 border-b px-3" data-slot="command-input-wrapper">
    <SearchIcon class="size-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
        data-slot="command-input"
        class={cn(
            // PIKA CUSTOMIZATION: Added px-2 for padding inside focus ring (not in upstream shadcn-svelte)
            'placeholder:text-muted-foreground outline-hidden flex h-10 w-full rounded-md bg-transparent px-2 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50',
            className
        )}
        bind:ref
        {...restProps}
        bind:value
    />
</div>
