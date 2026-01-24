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
        /** Position of the tooltip relative to the trigger */
        side?: 'top' | 'right' | 'bottom' | 'left';
        /** Offset from the trigger element in pixels */
        sideOffset?: number;
        /** Additional CSS classes to apply to the tooltip content */
        contentClass?: string;
    }

    const {
        tooltip,
        hotKey,
        children,
        delayDuration,
        allowHoverOverTooltip = false,
        side = 'top',
        sideOffset,
        contentClass
    }: Props = $props();

    const appState = getContext<AppState>('appState');
    let hideTooltip = $derived(appState.settings.data.hideTooltips || !tooltip);
</script>

{#if !hideTooltip}
    <Tooltip.Provider disableHoverableContent={!allowHoverOverTooltip}>
        <Tooltip.Root delayDuration={delayDuration ?? 0}>
            <Tooltip.Trigger>
                {@render children?.()}
            </Tooltip.Trigger>
            <Tooltip.Content {side} {sideOffset} class={contentClass}>
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
