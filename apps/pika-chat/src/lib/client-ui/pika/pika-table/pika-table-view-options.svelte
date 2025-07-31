<script lang="ts" module>
    type TData = unknown;
</script>

<script lang="ts" generics="TData">
    import { Settings2 } from '$icons/lucide';
    import { buttonVariants } from '$ui/shadcn/button';
    import * as DropdownMenu from '$ui/shadcn/dropdown-menu';
    import type { Table } from '@tanstack/table-core';

    let { table }: { table: Table<TData> } = $props();
</script>

<DropdownMenu.Root>
    <DropdownMenu.Trigger
        class={buttonVariants({
            variant: 'outline',
            size: 'sm',
            class: 'ml-auto hidden h-8 w-8 lg:flex ',
        })}
    >
        <Settings2 />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content>
        <DropdownMenu.Group>
            <DropdownMenu.GroupHeading>Toggle columns</DropdownMenu.GroupHeading>
            <DropdownMenu.Separator />
            {#each table
                .getAllColumns()
                .filter((col) => typeof col.accessorFn !== 'undefined' && col.getCanHide()) as column (column)}
                <DropdownMenu.CheckboxItem
                    bind:checked={() => column.getIsVisible(), (v) => column.toggleVisibility(!!v)}
                    class="capitalize"
                >
                    {column.id}
                </DropdownMenu.CheckboxItem>
            {/each}
        </DropdownMenu.Group>
    </DropdownMenu.Content>
</DropdownMenu.Root>
