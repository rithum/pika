<script lang="ts" module>
    type TData = unknown;
    type TValue = unknown;
</script>

<script lang="ts" generics="TData, TValue">
    import { EyeOff, ArrowDown, ArrowUp, ChevronsUpDown, ArrowDownUp, EllipsisVertical } from '$icons/lucide';
    import type { HTMLAttributes } from 'svelte/elements';
    import type { Column } from '@tanstack/table-core';
    import type { WithoutChildren } from 'bits-ui';
    import { cn } from '$lib/utils';
    import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
    import Button from '$lib/components/ui/button/button.svelte';

    type Props = HTMLAttributes<HTMLDivElement> & {
        column: Column<TData, TValue>;
        title: string;
    };

    let { column, class: className, title, ...restProps }: WithoutChildren<Props> = $props();
    let mouseInside = $state(false);
    let dropdownOpen = $state(false);
</script>

{#if !column?.getCanSort()}
    <div class={className} {...restProps}>
        {title}
    </div>
{:else}
    <!--TODO: why couldn't we add the restProps thing to the button below? {...restProps} -->
    <Button
        variant="ghost"
        onmouseenter={() => (mouseInside = true)}
        onmouseleave={() => (mouseInside = false)}
        class={cn('flex items-center min-w-0 gap-1 group pl-0 pr-0', className)}
        onclick={() => {
            if (column.getIsSorted() === false) {
                column.toggleSorting(false);
            } else if (column.getIsSorted() === 'asc') {
                column.toggleSorting(true);
            } else if (column.getIsSorted() === 'desc') {
                column.clearSorting();
            }
        }}
    >
        <span class="truncate flex-1">{title}</span>
        {#if column.getIsSorted() === 'desc'}
            <ArrowDown class="flex-shrink-0" />
        {:else if column.getIsSorted() === 'asc'}
            <ArrowUp class="flex-shrink-0" />
        {/if}

        <div
            class="flex-shrink-0 w-3 h-6 flex items-center justify-center {dropdownOpen
                ? 'visible'
                : 'invisible'} group-hover:visible"
        >
            <DropdownMenu.Root bind:open={dropdownOpen}>
                <DropdownMenu.Trigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="ghost"
                            size="sm"
                            class="data-[state=open]:bg-blue-200 h-8 w-8 p-0 hover:bg-blue-200 {dropdownOpen
                                ? 'bg-blue-200'
                                : ''} "
                        >
                            <EllipsisVertical class="text-muted-foreground/70 size-3.5" />
                        </Button>
                    {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="start">
                    <DropdownMenu.Item
                        disabled={column.getIsSorted() === 'asc'}
                        onclick={() => column.toggleSorting(false)}
                    >
                        <ArrowUp class="text-muted-foreground/70 mr-2 size-3.5" />
                        Asc
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                        disabled={column.getIsSorted() === 'desc'}
                        onclick={() => column.toggleSorting(true)}
                    >
                        <ArrowDown class="text-muted-foreground/70 mr-2 size-3.5" />
                        Desc
                    </DropdownMenu.Item>
                    <DropdownMenu.Item disabled={!column.getIsSorted()} onclick={() => column.clearSorting()}>
                        <ArrowDownUp class="text-muted-foreground/70 mr-2 size-3.5" />
                        UnSort
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item onclick={() => column.toggleVisibility(false)}>
                        <EyeOff class="text-muted-foreground/70 mr-2 size-3.5" />
                        Hide
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </div>
    </Button>
{/if}
