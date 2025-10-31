<script lang="ts">
    import HelpCircleOutline from '$icons/ci/help-circle-outline';
    import InfoIcon from '$icons/lucide/info';
    import type { Snippet } from 'svelte';
    import * as Popover from '../../shadcn/popover';
    import { cn } from '../../shadcn/utils';

    interface Props {
        popoverClasses?: string;
        children?: Snippet;
        useInfoIcon?: boolean;
    }

    let { popoverClasses, children, useInfoIcon = false }: Props = $props();

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
        {#if useInfoIcon}
            <InfoIcon class="w-4 h-4 text-gray-400 hover:text-blue-500 transition-colors" />
        {:else}
            <HelpCircleOutline class="w-4 h-4 text-gray-400 hover:text-blue-500 transition-colors" />
        {/if}
    </Popover.Trigger>

    <Popover.Content class={cn('w-120', popoverClasses)}>
        {@render children?.()}
    </Popover.Content>
</Popover.Root>
