<script lang="ts">
    import { type Snippet } from 'svelte';

    interface Props {
        children?: Snippet<[]>;
        disabled?: boolean;
    }

    const { children, disabled }: Props = $props();

</script>

{#if children}
    {#if disabled}
        {@render children()}
    {:else}
        <span  class="wave-char">
            {@render children()}
        </span>
    {/if}
{/if}


<style lang="postcss">
    :root {
        --shimmer-duration: 1s;
    }

    .wave-char {
        animation: shimmer-wave var(--shimmer-duration) ease-in-out infinite;
    }

    @keyframes shimmer-wave {
        0%,
        100% {
            opacity: 0.6;
        }
        25% {
            opacity: 0.75;
        }
        50% {
            opacity: 1;
        }
    }
</style>