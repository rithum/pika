<script lang="ts" module>
    type TData = unknown;
</script>

<script lang="ts" generics="TData">
    import { Ellipsis } from '$icons/lucide';
    import type { AppState } from '$client/app/app.state.svelte';
    import Button from '$lib/components/ui/button/button.svelte';
    import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
    import type { Row } from '@tanstack/table-core';
    import { getContext } from 'svelte';
    import type { RowActionMenuItem, RowActionMenuItemSubMenu, RowActionsProps } from './types';

    let { row, actionProps }: { row: Row<TData>; actionProps: RowActionsProps<TData> } = $props();
    const appState = getContext<AppState>('appState');
</script>

<DropdownMenu.Root>
    <DropdownMenu.Trigger>
        {#snippet child({ props })}
            <Button {...props} variant="ghost" class="data-[state=open]:bg-muted flex h-8 w-8 p-0">
                <Ellipsis />
                <span class="sr-only">Open Menu</span>
            </Button>
        {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content class="w-[{actionProps.menuWidth ? actionProps.menuWidth : '160px'}]" align="end">
        {@render menuItems(actionProps.menuItems)}
    </DropdownMenu.Content>
</DropdownMenu.Root>

{#snippet subMenu(props: RowActionMenuItemSubMenu<TData>)}
    <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger>{props.label}</DropdownMenu.SubTrigger>
        <DropdownMenu.SubContent>
            {@render menuItems(props.menuItems)}
        </DropdownMenu.SubContent>
    </DropdownMenu.Sub>
{/snippet}

{#snippet menuItems(items: RowActionMenuItem<TData>[])}
    {#each items as item}
        {#if item === 'Separator'}
            <DropdownMenu.Separator />
        {:else if 'menuItems' in item}
            {@render subMenu(item)}
        {:else}
            <DropdownMenu.Item onclick={() => item.onclick?.(row, appState)}>
                <div class="flex items-center gap-2">
                    {#if item.icon}
                        <item.icon />
                    {/if}
                    {item.label}
                </div>
            </DropdownMenu.Item>
        {/if}
    {/each}
{/snippet}
