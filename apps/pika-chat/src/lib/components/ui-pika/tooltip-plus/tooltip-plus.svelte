<script lang="ts">
    import * as Tooltip from '$lib/components/ui/tooltip';
    import { getContext, type Snippet } from 'svelte';
    import { AppState } from '$client/app/app.state.svelte';
    import type { HotKey } from '$client/app/types';
    import { getHotKeyHtmlDisplay } from '$lib/utils';

    interface Props {
        tooltip: string | Snippet<[]>;
        hotKey?: HotKey;
        children?: Snippet<[]>;
    }

    const { tooltip, hotKey, children }: Props = $props();

    const appState = getContext<AppState>('appState');
    let hideTooltip = $derived(appState.settings.data.hideTooltips);
</script>

{#if !hideTooltip}
    <Tooltip.Root>
        <Tooltip.Trigger>
            {@render children?.()}
        </Tooltip.Trigger>
        <Tooltip.Content>
            {#if typeof tooltip === 'string'}
                {tooltip}
            {:else}
                {@render tooltip?.()}
            {/if}
            {#if hotKey}
                {@html getHotKeyHtmlDisplay(hotKey)}
            {/if}
        </Tooltip.Content>
    </Tooltip.Root>
{:else}
    {@render children?.()}
{/if}
