<script lang="ts" module>
    type TData = unknown;
    type TValue = unknown;
</script>

<script lang="ts" generics="TData, TValue">
    import {
        type ColumnDef,
        type ColumnFiltersState,
        type PaginationState,
        type RowSelectionState,
        type SortingState,
        type VisibilityState,
        getCoreRowModel,
        getFacetedRowModel,
        getFacetedUniqueValues,
        getFilteredRowModel,
        getPaginationRowModel,
        getSortedRowModel,
    } from '@tanstack/table-core';
    import TableToolbar from './pika-table-toolbar.svelte';
    import TablePagination from './pika-table-pagination.svelte';
    import { createSvelteTable } from '$lib/components/ui/data-table/data-table.svelte';
    import FlexRender from '$lib/components/ui/data-table/flex-render.svelte';
    import * as Table from '$lib/components/ui/table';
    import type { FacetedFilters, GlobalFilterProps } from './types';
    import { getContext, untrack } from 'svelte';
    import type { AppState } from '$client/app/app.state.svelte';

    let {
        columns,
        data,
        classes,
        globalFilterProps = $bindable<GlobalFilterProps>(),
        facetedFilters,
        tableKey,
    }: {
        columns: ColumnDef<TData, TValue>[];
        data: TData[];
        classes?: string;
        globalFilterProps?: GlobalFilterProps;
        facetedFilters?: FacetedFilters;

        // This should be a human readable name for the table that is used to save/load column visibility
        // and to show in the settings UI.  Here's an example: "AWS SSO Profiles"
        tableKey: string;
        alwaysPinLeftColumns?: string[];
        alwaysPinRightColumns?: string[];
    } = $props();

    const appState = getContext<AppState>('appState');
    const appSettings = appState.settings;

    let rowSelection = $state<RowSelectionState>({});
    let columnVisibility = $derived(appSettings.getTableColumnVisibilityObject(tableKey));
    //$state<VisibilityState>(appSettings.getTableColumnVisibilityObject(tableKey));
    let columnFilters = $state<ColumnFiltersState>([]);
    let sorting = $state<SortingState>([]);
    let pageIndex = $state(0);
    let pageSize = $derived(appSettings.getTableNumRows(tableKey, 10));

    const table = createSvelteTable({
        columns,
        enableRowSelection: true,
        ...(globalFilterProps?.showGlobalFilter ? { globalFilterFn: 'includesString' } : {}),
        get data() {
            return data;
        },
        state: {
            get sorting() {
                return sorting;
            },
            get columnVisibility() {
                return columnVisibility;
            },
            get rowSelection() {
                return rowSelection;
            },
            get columnFilters() {
                return columnFilters;
            },
            get pagination() {
                return { pageIndex, pageSize };
            },
            get globalFilter() {
                return globalFilterProps?.showGlobalFilter ? globalFilterProps.globalFilterValue : '';
            },
        },

        onRowSelectionChange: (updater) => {
            if (typeof updater === 'function') {
                rowSelection = updater(rowSelection);
            } else {
                rowSelection = updater;
            }
        },
        onSortingChange: (updater) => {
            if (typeof updater === 'function') {
                sorting = updater(sorting);
            } else {
                sorting = updater;
            }
        },
        onColumnFiltersChange: (updater) => {
            if (typeof updater === 'function') {
                columnFilters = updater(columnFilters);
            } else {
                columnFilters = updater;
            }
        },
        onColumnVisibilityChange: (updater) => {
            if (typeof updater === 'function') {
                appSettings.setTableColumnVisibilityFromObject(tableKey, updater(columnVisibility));
            } else {
                throw new Error('onColumnVisibilityChange updater must be a function');
                //columnVisibility = updater;
            }
        },
        onPaginationChange: (updater) => {
            if (typeof updater === 'function') {
                const val = updater({ pageIndex, pageSize });
                pageIndex = val.pageIndex;
                appSettings.setTableNumRows(tableKey, val.pageSize);
            } else {
                throw new Error('onPaginationChange updater must be a function');
            }
        },
        onGlobalFilterChange: (value) => {
            if (globalFilterProps?.showGlobalFilter) {
                globalFilterProps.globalFilterValue = value;
            }
        },
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
    });
</script>

<div class="space-y-4 {classes ? classes : ''}">
    <TableToolbar {table} {globalFilterProps} {facetedFilters} />
    <div class="rounded-md border">
        <Table.Root>
            <Table.Header>
                {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
                    <Table.Row>
                        {#each headerGroup.headers as header (header.id)}
                            <Table.Head colspan={header.colSpan}>
                                {#if !header.isPlaceholder}
                                    <FlexRender
                                        content={header.column.columnDef.header}
                                        context={header.getContext()}
                                    />
                                {/if}
                            </Table.Head>
                        {/each}
                    </Table.Row>
                {/each}
            </Table.Header>
            <Table.Body>
                {#each table.getRowModel().rows as row (row.id)}
                    <Table.Row data-state={row.getIsSelected() && 'selected'}>
                        {#each row.getVisibleCells() as cell (cell.id)}
                            <Table.Cell>
                                <FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
                            </Table.Cell>
                        {/each}
                    </Table.Row>
                {:else}
                    <Table.Row>
                        <Table.Cell colspan={columns.length} class="h-24 text-center">No results.</Table.Cell>
                    </Table.Row>
                {/each}
            </Table.Body>
        </Table.Root>
    </div>
    <TablePagination {table} />
</div>
