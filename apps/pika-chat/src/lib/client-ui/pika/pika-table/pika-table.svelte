<script lang="ts" module>
    type TData = unknown;
    type TValue = unknown;
</script>

<script lang="ts" generics="TData, TValue">
    import type { AppState } from '$client/app/app.state.svelte';
    import { createSvelteTable } from '$ui/shadcn/data-table/data-table.svelte';
    import FlexRender from '$ui/shadcn/data-table/flex-render.svelte';
    import * as Table from '$ui/shadcn/table';
    import {
        type ColumnDef,
        type ColumnFiltersState,
        type RowSelectionState,
        type SortingState,
        getCoreRowModel,
        getFacetedRowModel,
        getFacetedUniqueValues,
        getFilteredRowModel,
        getPaginationRowModel,
        getSortedRowModel,
    } from '@tanstack/table-core';
    import { getContext } from 'svelte';
    import TablePagination from './pika-table-pagination.svelte';
    import TableToolbar from './pika-table-toolbar.svelte';
    import type { FacetedFilters, GlobalFilterProps, ServerSideState, ServerSideTableState } from './types';

    let {
        columns,
        data,
        classes,
        globalFilterProps = $bindable<GlobalFilterProps>(),
        facetedFilters,
        tableKey,
        serverSide,
        serverSideTableState,
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

        // Server-side configuration
        serverSide?: ServerSideState;
        serverSideTableState?: ServerSideTableState;
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

    // === SERVER-SIDE LOGIC ===
    let debouncedRequestData: ((tableState: ServerSideTableState) => Promise<void>) | undefined;

    // Create debounced function when serverSide config changes
    $effect(() => {
        if (serverSide) {
            const debounceMs = serverSide.debounceMs ?? 300;
            debouncedRequestData = debounce(async (tableState: ServerSideTableState) => {
                try {
                    await serverSide.requestData(tableState);
                } catch (error) {
                    serverSide.onError?.(error instanceof Error ? error.message : 'Unknown error');
                }
            }, debounceMs);
        } else {
            debouncedRequestData = undefined;
        }
    });

    // Trigger server request when table state changes
    function triggerServerRequest() {
        if (!serverSide || !debouncedRequestData) return;

        const tableState: ServerSideTableState = {
            pageIndex,
            pageSize,
            sorting,
            columnFilters,
            globalFilter: globalFilterProps?.globalFilterValue ?? '',
            requestId: crypto.randomUUID(),
        };

        debouncedRequestData(tableState);
    }

    // Utility function for debouncing
    function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
        let timeout: ReturnType<typeof setTimeout>;
        return ((...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        }) as T;
    }

    const table = createSvelteTable({
        columns,
        enableRowSelection: true,
        ...(globalFilterProps?.showGlobalFilter ? { globalFilterFn: 'includesString' } : {}),
        get data() {
            // When server-side, ignore the data prop - data comes from reactive state
            return serverSide ? [] : data;
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

        // === MANUAL MODES FOR SERVER-SIDE ===
        ...(serverSide
            ? {
                  manualSorting: true,
                  manualFiltering: true,
                  manualPagination: true,
                  pageCount: (() => {
                      // Calculate pageCount if totalRecords is available, regardless of pagination mode
                      if (serverSideTableState?.totalRecords !== undefined && pageSize > 0) {
                          return Math.ceil(serverSideTableState.totalRecords / pageSize);
                      }
                      // For cursor-based pagination without totalRecords, we don't know the total
                      if (serverSide.paginationMode === 'cursor') {
                          return -1; // Unknown page count for cursor pagination without totalRecords
                      }
                      return undefined; // Unknown page count
                  })(),
              }
            : {}),

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

            // Trigger server request for server-side tables
            if (serverSide) {
                triggerServerRequest();
            }
        },
        onColumnFiltersChange: (updater) => {
            if (typeof updater === 'function') {
                columnFilters = updater(columnFilters);
            } else {
                columnFilters = updater;
            }

            // Trigger server request for server-side tables
            if (serverSide) {
                triggerServerRequest();
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

                // Trigger server request for server-side tables
                if (serverSide) {
                    triggerServerRequest();
                }
            } else {
                throw new Error('onPaginationChange updater must be a function');
            }
        },
        onGlobalFilterChange: (value) => {
            if (globalFilterProps?.showGlobalFilter) {
                globalFilterProps.globalFilterValue = value;

                // Trigger server request for server-side tables
                if (serverSide) {
                    triggerServerRequest();
                }
            }
        },

        // === ROW MODELS ===
        getCoreRowModel: getCoreRowModel(),
        ...(serverSide
            ? {}
            : {
                  getFilteredRowModel: getFilteredRowModel(),
                  getPaginationRowModel: getPaginationRowModel(),
                  getSortedRowModel: getSortedRowModel(),
              }),
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
    <TablePagination {table} {serverSideTableState} {serverSide} />
</div>
