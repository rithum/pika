<script lang="ts">
    import { getScrollableTabsContext } from './context.svelte.js';
    import { cn } from '../../shadcn/utils.js';
    import * as DropdownMenu from '../../shadcn/dropdown-menu/index.js';
    import { Button } from '../../shadcn/button/index.js';
    import MoreHorizontal from '$icons/lucide/ellipsis';
    import Pin from '$icons/lucide/pin';
    import PinOff from '$icons/lucide/pin-off';
    import X from '$icons/lucide/x';

    interface Tab {
        value: string;
        label: string;
        isPinned: boolean;
    }

    interface Props {
        tabs: Tab[];
        class?: string;
    }

    let { tabs, class: className }: Props = $props();

    const context = getScrollableTabsContext();

    const activeValue = $derived(context.getValue());

    // Separate pinned and unpinned tabs
    const pinnedTabs = $derived(tabs.filter((t) => t.isPinned));
    const unpinnedTabs = $derived(tabs.filter((t) => !t.isPinned));

    function handleTabClick(value: string) {
        context.onValueChange(value);
    }

    function handlePin(e: Event, value: string) {
        e.stopPropagation();
        context.onPin?.(value);
    }

    function handleUnpin(e: Event, value: string) {
        e.stopPropagation();
        context.onUnpin?.(value);
    }

    function handleClose(e: Event, value: string) {
        e.stopPropagation();
        context.onClose?.(value);
    }
</script>

<div class={cn('flex-shrink-0', className)}>
    <DropdownMenu.Root>
        <DropdownMenu.Trigger>
            <Button variant="ghost" size="icon" class="w-7">
                <MoreHorizontal style="width: 1.2rem; height: 1.2rem;" />
            </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-56">
            {#if pinnedTabs.length > 0}
                <DropdownMenu.Group>
                    <DropdownMenu.Label>Pinned</DropdownMenu.Label>
                    {#each pinnedTabs as tab}
                        <DropdownMenu.Item
                            onclick={() => handleTabClick(tab.value)}
                            class={cn('flex items-center justify-between gap-2', activeValue === tab.value && 'bg-accent')}
                        >
                            <span class="flex-1 truncate">{tab.label}</span>
                            <div class="flex items-center gap-1 flex-shrink-0">
                                {#if context.onUnpin}
                                    <button type="button" onclick={(e) => handleUnpin(e, tab.value)} class="p-0.5 rounded hover:bg-muted transition-colors" aria-label="Unpin tab">
                                        <PinOff style="width: 0.9rem; height: 0.9rem;" />
                                    </button>
                                {/if}
                                {#if context.onClose}
                                    <button type="button" onclick={(e) => handleClose(e, tab.value)} class="p-0.5 rounded hover:bg-muted transition-colors" aria-label="Close tab">
                                        <X style="width: 0.9rem; height: 0.9rem;" />
                                    </button>
                                {/if}
                            </div>
                        </DropdownMenu.Item>
                    {/each}
                </DropdownMenu.Group>
            {/if}

            {#if pinnedTabs.length > 0 && unpinnedTabs.length > 0}
                <DropdownMenu.Separator />
            {/if}

            {#if unpinnedTabs.length > 0}
                <DropdownMenu.Group>
                    {#if pinnedTabs.length > 0}
                        <DropdownMenu.Label>Unpinned</DropdownMenu.Label>
                    {/if}
                    {#each unpinnedTabs as tab}
                        <DropdownMenu.Item
                            onclick={() => handleTabClick(tab.value)}
                            class={cn('flex items-center justify-between gap-2', activeValue === tab.value && 'bg-accent')}
                        >
                            <span class="flex-1 truncate">{tab.label}</span>
                            <div class="flex items-center gap-1 flex-shrink-0">
                                {#if context.onPin}
                                    <button type="button" onclick={(e) => handlePin(e, tab.value)} class="p-0.5 rounded hover:bg-muted transition-colors" aria-label="Pin tab">
                                        <Pin style="width: 0.9rem; height: 0.9rem;" />
                                    </button>
                                {/if}
                                {#if context.onClose}
                                    <button type="button" onclick={(e) => handleClose(e, tab.value)} class="p-0.5 rounded hover:bg-muted transition-colors" aria-label="Close tab">
                                        <X style="width: 0.9rem; height: 0.9rem;" />
                                    </button>
                                {/if}
                            </div>
                        </DropdownMenu.Item>
                    {/each}
                </DropdownMenu.Group>
            {/if}
        </DropdownMenu.Content>
    </DropdownMenu.Root>
</div>
