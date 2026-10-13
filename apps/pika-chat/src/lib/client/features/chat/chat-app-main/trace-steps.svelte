<script lang="ts">
    import CircleCheck from '$icons/lucide/circle-check';
    import TextWaveShimmer from 'pika-ux/pika/text-wave-shimmer/text-wave-shimmer.svelte';
    import type { StepItem } from './trace-steps';

    interface Props {
        items: StepItem[];
    }

    let { items }: Props = $props();
</script>

<ol class="flex flex-col gap-2 text-md text-gray-600" data-testid="trace-steps">
    {#each items as item, i (i)}
        <li class="flex items-center gap-2">
            {#if item.done}
                <CircleCheck class="w-4 h-4 text-gray-700" />
                <span>{item.text}</span>
            {:else}
                <span class="w-4 h-4 flex items-center justify-center">
                    <span class="bg-gray-700 rounded-full" style="width: 0.4rem; height: 0.4rem;"></span>
                </span>
                <TextWaveShimmer>{item.text}</TextWaveShimmer>
            {/if}
        </li>
    {/each}
</ol>
