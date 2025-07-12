<script lang="ts">
    import { HelpCircleOutline } from '$icons/ci';
    import * as Popover from '$lib/components/ui/popover';
    import { cn } from '$lib/utils';
    import type { Snippet } from 'svelte';

    interface Props {
        popoverClasses?: string;
        children?: Snippet;
    }

    let { popoverClasses, children }: Props = $props();

    let open = $state(false);
</script>

<Popover.Root bind:open>
    <Popover.Trigger
        class="inline-flex items-center justify-center"
        onmouseenter={() => {
            open = true;
        }}
        onmouseleave={() => {
            open = false;
        }}
    >
        <HelpCircleOutline class="w-4 h-4 hover:text-blue-500 transition-colors" />
    </Popover.Trigger>

    <Popover.Content class={cn('w-120', popoverClasses)}>
        {@render children?.()}
    </Popover.Content>
</Popover.Root>
