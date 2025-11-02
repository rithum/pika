<script lang="ts" module>
    type TData = unknown;
    type TValue = unknown;
</script>

<!-- @component
PikaTable - A reusable table component with server-side pagination, sorting, and filtering support
-->
<script lang="ts" generics="TData, TValue">
    // @ts-ignore - Props interface is private but this is a Svelte framework limitation
    import { createSvelteTable } from '../../shadcn/data-table/data-table.svelte';
    import FlexRender from '../../shadcn/data-table/flex-render.svelte';
    import * as Table from '../../shadcn/table';
    import {
        getCoreRowModel,
        getFacetedRowModel,
        getFacetedUniqueValues,
        getFilteredRowModel,
        getPaginationRowModel,
        getSortedRowModel,
        type ColumnDef,
        type ColumnFiltersState,
        type RowSelectionState,
        type SortingState
    } from '@tanstack/table-core';
    import { type Snippet } from 'svelte';
    import TablePagination from './pika-table-pagination.svelte';
    import TableToolbar from './pika-table-toolbar.svelte';
    import type { FacetedFilters, GlobalFilterProps, ServerSideConfig, ServerSideTableState, TableSettingsFacade } from './types';

    interface Props {
        columns: ColumnDef<TData, TValue>[];
        data: TData[];
        classes?: string;

        // If you pass in toolbar content then global filter and faceted filters will be ignored
        globalFilterProps?: GlobalFilterProps;
        facetedFilters?: FacetedFilters;

        // Appears above the table
        toolbarContent?: Snippet;

        // Appears beneath the toolbar and above the table
        beneathToolbarContent?: Snippet;

        // This should be a human readable name for the table that is used to save/load column visibility
        // and to show in the settings UI.  Here's an example: "AWS SSO Profiles"
        tableKey: string;
        alwaysPinLeftColumns?: string[];
        alwaysPinRightColumns?: string[];

        // Server-side configuration
        serverSideConfig?: ServerSideConfig;

        // Facade for table settings (required)
        tableSettings: TableSettingsFacade;

        // Show rows per page selector in pagination
        showRowsPerPage?: boolean;

        // Where to show pagination controls
        paginationPlacement?: 'top' | 'bottom' | 'both';
    }

    let {
        columns,
        data,
        classes,
        globalFilterProps = $bindable<GlobalFilterProps>(),
        facetedFilters,
        toolbarContent,
        beneathToolbarContent,
        tableKey,
        serverSideConfig = $bindable<ServerSideConfig>(),
        tableSettings,
        showRowsPerPage = true,
        paginationPlacement = 'bottom'
    }: Props = $props();

    let rowSelection = $state<RowSelectionState>({});
    let columnVisibility = $derived(tableSettings.getTableColumnVisibilityObject(tableKey));
    let columnFilters = $state<ColumnFiltersState>([]);
    let sorting = $state<SortingState>([]);
    let pageIndex = $state(0);
    let pageSize = $derived(tableSettings.getTableNumRows(tableKey, 10));

    // === SERVER-SIDE LOGIC ===

    let debouncedRequestData: ((tableState: ServerSideTableState) => Promise<void>) | undefined;

    // Create debounced function when serverSide config changes
    $effect(() => {
        const serverState = serverSideConfig;
        if (serverState) {
            const debounceMs = serverState.debounceMs ?? 300;
            debouncedRequestData = debounce(async (tableState: ServerSideTableState) => {
                try {
                    await serverState.requestData(tableState);

                    // If using new API, update the tableState
                    if (serverSideConfig) {
                        serverSideConfig.tableState = { ...serverSideConfig.tableState, ...tableState };
                    }
                } catch (error) {
                    serverState.onError?.(error instanceof Error ? error.message : 'Unknown error');
                }
            }, debounceMs);
        } else {
            debouncedRequestData = undefined;
        }
    });

    // Trigger server request when table state changes
    function triggerServerRequest() {
        const serverState = serverSideConfig;
        if (!serverState || !debouncedRequestData) return;

        const tableState: ServerSideTableState = {
            pageIndex,
            pageSize,
            sorting,
            columnFilters,
            totalRecords: serverState.tableState?.totalRecords,
            scrollId: serverState.tableState?.scrollId,
            hasNextPage: serverState.tableState?.hasNextPage,
            isLoading: true,
            requestId: crypto.randomUUID()
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
            }
        },

        // === MANUAL MODES FOR SERVER-SIDE ===
        get manualSorting() {
            return !!serverSideConfig;
        },
        get manualFiltering() {
            // CRITICAL: If using client-side global filter, we must disable manualFiltering
            // Otherwise TanStack skips ALL filtering logic before checking manualGlobalFilter
            return serverSideConfig ? !serverSideConfig.clientSideGlobalFilter : false;
        },
        get manualPagination() {
            return !!serverSideConfig;
        },
        get pageCount() {
            const serverState = serverSideConfig;
            if (!serverState) return undefined;

            const tableState = serverSideConfig?.tableState;

            // For server-side pagination, use the pageSize from tableState if available
            const effectivePageSize = tableState?.pageSize ?? pageSize;

            // Calculate pageCount if totalRecords is available, regardless of pagination mode
            if (tableState?.totalRecords !== undefined && effectivePageSize > 0) {
                return Math.ceil(tableState.totalRecords / effectivePageSize);
            }
            // For cursor-based pagination without totalRecords, we don't know the total
            if (serverState.paginationMode === 'cursor') {
                // For cursor pagination, determine page count based on hasNextPage
                // If we're on page 0 and hasNextPage is false, we have 1 page
                // If hasNextPage is true, we have at least 2 pages
                return tableState?.hasNextPage ? pageIndex + 2 : pageIndex + 1;
            }
            return undefined; // Unknown page count
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

            // Trigger server request for server-side tables
            if (serverSideConfig) {
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
            if (serverSideConfig) {
                triggerServerRequest();
            }
        },
        onColumnVisibilityChange: (updater) => {
            if (typeof updater === 'function') {
                tableSettings.setTableColumnVisibilityFromObject(tableKey, updater(columnVisibility));
            } else {
                throw new Error('onColumnVisibilityChange updater must be a function');
                //columnVisibility = updater;
            }
        },
        onPaginationChange: (updater) => {
            if (typeof updater === 'function') {
                const val = updater({ pageIndex, pageSize });
                pageIndex = val.pageIndex;
                tableSettings.setTableNumRows(tableKey, val.pageSize);

                // Trigger server request for server-side tables
                if (serverSideConfig) {
                    triggerServerRequest();
                }
            } else {
                throw new Error('onPaginationChange updater must be a function');
            }
        },
        onGlobalFilterChange: (value) => {
            if (globalFilterProps?.showGlobalFilter) {
                globalFilterProps.globalFilterValue = value;

                // Only trigger server request if global filter is server-side (not client-side)
                if (serverSideConfig && !serverSideConfig.clientSideGlobalFilter) {
                    triggerServerRequest();
                }
                // Otherwise, global filter will work client-side automatically via getFilteredRowModel
            }
        },

        // === ROW MODELS ===
        getCoreRowModel: getCoreRowModel(),
        ...(serverSideConfig
            ? {
                  // Include filtered row model ONLY if using client-side global filter
                  ...(serverSideConfig.clientSideGlobalFilter ? { getFilteredRowModel: getFilteredRowModel() } : {})
              }
            : {
                  getFilteredRowModel: getFilteredRowModel(),
                  getPaginationRowModel: getPaginationRowModel(),
                  getSortedRowModel: getSortedRowModel()
              }),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues()
    });
</script>

<div class="{classes ? classes : ''} ">
    <div class="mb-4">
        <TableToolbar {table} {globalFilterProps} {facetedFilters} {toolbarContent} {beneathToolbarContent} />
    </div>
    {#if paginationPlacement === 'top' || paginationPlacement === 'both'}
        <div class="mt-2 pb-1">
            <TablePagination
                {table}
                serverSide={serverSideConfig}
                {showRowsPerPage}
                globalFilterActive={!!(serverSideConfig?.clientSideGlobalFilter && globalFilterProps?.globalFilterValue)}
            />
        </div>
    {/if}
    <div class="rounded-md border h-full flex flex-col overflow-y-auto">
        <Table.Root class="h-full">
            <Table.Header>
                {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
                    <Table.Row class="sticky top-0 bg-gray-50 shadow-[inset_0_-1px_0_#ededed]">
                        {#each headerGroup.headers as header (header.id)}
                            <Table.Head colspan={header.colSpan}>
                                {#if !header.isPlaceholder}
                                    <FlexRender content={header.column.columnDef.header} context={header.getContext()} />
                                {/if}
                            </Table.Head>
                        {/each}
                    </Table.Row>
                {/each}
            </Table.Header>
            <Table.Body class="">
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
    {#if paginationPlacement === 'bottom' || paginationPlacement === 'both'}
        <div class="mt-2">
            <TablePagination
                {table}
                serverSide={serverSideConfig}
                {showRowsPerPage}
                globalFilterActive={!!(serverSideConfig?.clientSideGlobalFilter && globalFilterProps?.globalFilterValue)}
            />
        </div>
    {/if}
</div>
