<script lang="ts">
    import Archive from '$icons/lucide/archive';
    import Download from '$icons/lucide/download';
    import MessageSquare from '$icons/lucide/message-square';
    import X from '$icons/lucide/x';

    import type { AppState } from '$lib/client/app/app.state.svelte';
    import PikaTable from 'pika-ux/pika/pika-table/pika-table.svelte';
    import type { ServerSideConfig, ServerSideTableState, TableSettingsFacade } from 'pika-ux/pika/pika-table/types';
    import { Button } from 'pika-ux/shadcn/button';
    import { Card } from 'pika-ux/shadcn/card';
    import { Input } from 'pika-ux/shadcn/input';
    import { Separator } from 'pika-ux/shadcn/separator';
    import { getContext } from 'svelte';
    import FiltersAppliedPanel from './filters-applied-panel.svelte';
    import FiltersPopup from './filters-popup.svelte';
    import { columns } from './sessions-table-columns';

    const appState = getContext<AppState>('appState');
    const siteAdminState = appState.siteAdmin;
    const sessionInsights = siteAdminState.sessionInsights;

    // Create table settings facade
    const tableSettings: TableSettingsFacade = {
        getTableColumnVisibilityObject: (tableKey: string) =>
            appState.settings.getTableColumnVisibilityObject(tableKey),
        getTableNumRows: (tableKey: string, defaultValue: number) =>
            appState.settings.getTableNumRows(tableKey, defaultValue),
        setTableNumRows: (tableKey: string, value: number) => appState.settings.setTableNumRows(tableKey, value),
        setTableColumnVisibilityFromObject: (tableKey: string, visibility: any) =>
            appState.settings.setTableColumnVisibilityFromObject(tableKey, visibility),
    };

    // Track the page size for slicing data (matches server page size)
    let currentPageSize = $state(500);
    let currentPageStartIndex = $state(0);

    // Computed: Only show the current page of sessions for traditional pagination
    let currentPageSessions = $derived(
        sessionInsights.sessions.slice(currentPageStartIndex, currentPageStartIndex + currentPageSize)
    );

    // Create properly typed versions of Pika components for ChatSession data

    // Helper functions to extract specific filters
    // function extractInsightsFilter(columnFilters: ColumnFiltersState) {
    //     const insightsFilter = columnFilters.find((f) => f.id === 'insightsStatus');
    //     if (!insightsFilter) return undefined;

    //     const values = insightsFilter.value as string[];
    //     return {
    //         hasInsights: values.includes('available'),
    //     };
    // }

    // function extractFeedbackFilter(columnFilters: ColumnFiltersState) {
    //     const feedbackFilter = columnFilters.find((f) => f.id === 'feedbackStatus');
    //     if (!feedbackFilter) return undefined;

    //     const values = feedbackFilter.value as string[];
    //     const severities: ('low' | 'medium' | 'high' | 'critical')[] = [];

    //     if (values.includes('negative')) {
    //         severities.push('high', 'medium');
    //     }
    //     if (values.includes('positive')) {
    //         severities.push('low');
    //     }

    //     return severities.length > 0 ? severities : undefined;
    // }

    // Server-side table state
    let serverSideTableState = $state<ServerSideTableState>({
        pageIndex: 0,
        pageSize: 50,
        totalRecords: undefined,
        scrollId: undefined,
        hasNextPage: false,
        sorting: [],
        columnFilters: [],
        isLoading: false,
        error: undefined,
        requestId: '',
    });

    // Server-side configuration
    let serverSideConfig = $state<ServerSideConfig>({
        paginationMode: 'cursor',
        debounceMs: 300,
        get tableState() {
            return serverSideTableState;
        },

        requestData: async (tableState: ServerSideTableState) => {
            console.log('[SessionsTable] requestData called', {
                pageIndex: tableState.pageIndex,
                pageSize: tableState.pageSize,
                scrollId: tableState.scrollId,
            });

            // Update our local table state
            serverSideTableState = { ...serverSideTableState, ...tableState, isLoading: true };

            try {
                const isFirstPage = tableState.pageIndex === 0;

                console.log('[SessionsTable] Performing search:', {
                    pageIndex: tableState.pageIndex,
                    isFirstPage,
                    currentScrollId: sessionInsights.searchQuery.scrollId,
                });

                if (isFirstPage) {
                    // New search - clear everything and start fresh
                    currentPageStartIndex = 0;
                    await sessionInsights.performSearch(false);
                    currentPageSize = sessionInsights.sessions.length;
                } else {
                    // Pagination - append new data to preserve scrollId
                    currentPageStartIndex = sessionInsights.sessions.length;
                    await sessionInsights.performSearch(true);
                    currentPageSize = sessionInsights.sessions.length - currentPageStartIndex;

                    console.log('[SessionsTable] Page boundaries:', {
                        startIndex: currentPageStartIndex,
                        endIndex: sessionInsights.sessions.length,
                        pageSize: currentPageSize,
                    });
                }

                // Update table state with response data
                serverSideTableState = {
                    ...serverSideTableState,
                    isLoading: false,
                    totalRecords: undefined, // We don't have total count with cursor pagination
                    hasNextPage: sessionInsights.hasMore,
                    scrollId: sessionInsights.searchQuery.scrollId,
                    error: undefined,
                };

                console.log('[SessionsTable] Search complete:', {
                    totalSessionsCount: sessionInsights.sessions.length,
                    currentPageStart: currentPageStartIndex,
                    currentPageSize: currentPageSize,
                    hasMore: sessionInsights.hasMore,
                });
            } catch (error) {
                console.error('[SessionsTable] Search error:', error);
                serverSideTableState = {
                    ...serverSideTableState,
                    isLoading: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
                throw error;
            }
        },

        onError: (error: string) => {
            console.error('Server-side table error:', error);
            serverSideTableState = {
                ...serverSideTableState,
                isLoading: false,
                error,
            };
        },
    });

    // Bulk actions
    function exportSelected() {
        console.log('Export selected sessions:', sessionInsights.selectedSessions);
    }

    function bulkAddFeedback() {
        console.log('Add feedback to selected sessions:', sessionInsights.selectedSessions);
    }

    function bulkArchive() {
        console.log('Archive selected sessions:', sessionInsights.selectedSessions);
    }

    function clearSelection() {
        sessionInsights.clearSelection();
    }
</script>

<div class="flex flex-col h-full pb-4">
    <!-- Bulk Actions Toolbar -->
    {#if sessionInsights.selectedSessions.length > 0}
        <Card class="p-3 bg-blue-50 border-blue-200">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <span class="font-medium">{sessionInsights.selectedSessions.length} sessions selected</span>
                    <Separator orientation="vertical" class="h-4" />
                    <div class="flex gap-2">
                        <Button variant="outline" size="sm" onclick={exportSelected}>
                            <Download class="w-4 h-4 mr-2" />
                            Export
                        </Button>
                        <Button variant="outline" size="sm" onclick={bulkAddFeedback}>
                            <MessageSquare class="w-4 h-4 mr-2" />
                            Add Feedback
                        </Button>
                        <Button variant="outline" size="sm" onclick={bulkArchive}>
                            <Archive class="w-4 h-4 mr-2" />
                            Archive
                        </Button>
                    </div>
                </div>
                <Button variant="ghost" size="sm" onclick={clearSelection}>
                    <X class="w-4 h-4" />
                </Button>
            </div>
        </Card>
    {/if}

    <!-- bind:globalFilterProps -->
    <!-- PikaTable Component -->
    <PikaTable
        {columns}
        data={currentPageSessions}
        tableKey="session-insights"
        bind:serverSideConfig
        {tableSettings}
        showRowsPerPage={false}
        paginationPlacement="both"
        classes="h-full flex flex-col"
        {toolbarContent}
    />
</div>

{#snippet toolbarContent()}
    <div>
        <!-- onchange={(e) => {
                table.setGlobalFilter(e.currentTarget.value);
            }} -->
        <div class="flex gap-3 items-start">
            <div class="flex items-center gap-1">
                <Input
                    placeholder="title/session id/user id/user name..."
                    value={sessionInsights.searchQuery.query}
                    oninput={(e) => {
                        sessionInsights.searchQuery.query = (e.currentTarget.value ?? '').trim();

                        // if (
                        //     sessionInsights.searchQuery.query &&
                        //     sessionInsights.searchQuery.query.length > 3
                        // ) {
                        //     sessionInsights.performSearch(false);
                        // }
                    }}
                    class="h-8 w-[150px] lg:w-[250px]"
                />
                <FiltersPopup />
            </div>
            <FiltersAppliedPanel />
        </div>
    </div>
{/snippet}
