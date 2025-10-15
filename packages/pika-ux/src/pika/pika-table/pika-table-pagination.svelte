<script lang="ts" module>
    type TData = unknown;
</script>

<script lang="ts" generics="TData">
    import ChevronLeft from '$icons/lucide/chevron-left';
    import ChevronRight from '$icons/lucide/chevron-right';
    import ChevronsLeft from '$icons/lucide/chevrons-left';
    import ChevronsRight from '$icons/lucide/chevrons-right';
    import { Button } from '../../shadcn/button';
    import * as Select from '../../shadcn/select';
    import type { Table } from '@tanstack/table-core';
    import type { ServerSideConfig } from './types';

    interface Props {
        table: Table<TData>;
        serverSide: ServerSideConfig;
    }

    let { table, serverSide }: Props = $props();

    // For cursor-based pagination, we can't jump to arbitrary pages
    const isCursorBased = $derived(serverSide?.paginationMode === 'cursor');
</script>

<div class="flex items-center justify-between px-2">
    <div class="text-muted-foreground flex-1 text-sm">
        {#if serverSide?.tableState?.totalRecords !== undefined}
            {table.getFilteredSelectedRowModel().rows.length} of
            {serverSide.tableState.totalRecords} total row(s) selected.
        {:else}
            {table.getFilteredSelectedRowModel().rows.length} of
            {table.getFilteredRowModel().rows.length} row(s) selected.
        {/if}
    </div>
    <div class="flex items-center space-x-6 lg:space-x-8">
        <div class="flex items-center space-x-2">
            <p class="text-sm font-medium">Rows per page</p>
            <Select.Root
                allowDeselect={false}
                type="single"
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                    table.setPageSize(Number(value));
                }}
            >
                <Select.Trigger class="h-8 w-[70px]">
                    {String(table.getState().pagination.pageSize)}
                </Select.Trigger>
                <Select.Content side="top">
                    {#each [10, 20, 50, 100, 500, 1000] as pageSize (pageSize)}
                        <Select.Item value={`${pageSize}`}>
                            {pageSize}
                        </Select.Item>
                    {/each}
                </Select.Content>
            </Select.Root>
        </div>
        <div class="flex w-[100px] items-center justify-center text-sm font-medium">
            {#if table.getPageCount() > 0}
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            {:else}
                Page {table.getState().pagination.pageIndex + 1}
            {/if}
        </div>
        <div class="flex items-center space-x-2">
            <Button variant="outline" class="hidden size-8 p-0 lg:flex" onclick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage() || isCursorBased}>
                <span class="sr-only">Go to first page</span>
                <ChevronsLeft />
            </Button>
            <Button variant="outline" class="size-8 p-0" onclick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                <span class="sr-only">Go to previous page</span>
                <ChevronLeft />
            </Button>
            <Button variant="outline" class="size-8 p-0" onclick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                <span class="sr-only">Go to next page</span>
                <ChevronRight />
            </Button>
            <Button
                variant="outline"
                class="hidden size-8 p-0 lg:flex"
                onclick={() => {
                    const pageCount = table.getPageCount();
                    if (pageCount > 0) {
                        table.setPageIndex(pageCount - 1);
                    }
                }}
                disabled={!table.getCanNextPage() || table.getPageCount() <= 0 || isCursorBased}
            >
                <span class="sr-only">Go to last page</span>
                <ChevronsRight />
            </Button>
        </div>
    </div>
</div>
