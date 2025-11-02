<script lang="ts" module>
    type TData = unknown;
</script>

<!-- @component
PikaTablePagination - Pagination controls for PikaTable
-->
<script lang="ts" generics="TData">
    // @ts-ignore - Props interface is private but this is a Svelte framework limitation
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
        showRowsPerPage?: boolean;
        globalFilterActive?: boolean;
    }

    let { table, serverSide, showRowsPerPage = true, globalFilterActive = false }: Props = $props();

    // For cursor-based pagination, we can't jump to arbitrary pages
    const isCursorBased = $derived(serverSide?.paginationMode === 'cursor');

    // Calculate counts for display
    const totalLoadedRows = $derived(table.getCoreRowModel().rows.length);
    const visibleRows = $derived(table.getRowModel().rows.length);
    const selectedRows = $derived(table.getFilteredSelectedRowModel().rows.length);
</script>

<div class="flex items-center justify-between px-2">
    <div class="flex-1 text-sm">
        {#if globalFilterActive && visibleRows < totalLoadedRows}
            <!-- Client-side filtering active -->
            <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-blue-700">
                    Showing {visibleRows} of {totalLoadedRows} loaded results
                </span>
                {#if selectedRows > 0}
                    <span class="text-muted-foreground text-xs">
                        ({selectedRows} selected)
                    </span>
                {/if}
            </div>
        {:else if selectedRows > 0}
            <!-- No filtering, just show selection -->
            <span class="text-muted-foreground">
                {#if serverSide?.tableState?.totalRecords !== undefined}
                    {selectedRows} of {serverSide.tableState.totalRecords} total row(s) selected.
                {:else}
                    {selectedRows} of {visibleRows} row(s) selected.
                {/if}
            </span>
        {:else}
            <!-- No filtering, no selection -->
            <span class="text-muted-foreground">
                {totalLoadedRows} row(s) loaded
            </span>
        {/if}
    </div>
    <div class="flex items-center space-x-8">
        {#if showRowsPerPage}
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
        {/if}
        <div class="flex w-[100px] items-center justify-center text-sm font-medium mr-2">
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
