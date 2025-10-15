<script lang="ts">
    import { AppState } from '$client/app/app.state.svelte';
    import type { HotKey } from '$client/app/types';
    import { getHotKeyHtmlDisplay } from '$lib/utils';
    import * as Tooltip from '../../shadcn/tooltip';
    import { getContext, type Snippet } from 'svelte';

    interface Props {
        tooltip: undefined | string | Snippet<[]>;
        hotKey?: HotKey;
        children?: Snippet<[]>;
        delayDuration?: number;
        allowHoverOverTooltip?: boolean;
    }

    const { tooltip, hotKey, children, delayDuration, allowHoverOverTooltip = false }: Props = $props();

    const appState = getContext<AppState>('appState');
    let hideTooltip = $derived(appState.settings.data.hideTooltips || !tooltip);
</script>

{#if !hideTooltip}
    <Tooltip.Provider disableHoverableContent={!allowHoverOverTooltip}>
        <Tooltip.Root delayDuration={delayDuration ?? 0}>
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
    </Tooltip.Provider>
{:else}
    {@render children?.()}
{/if}
