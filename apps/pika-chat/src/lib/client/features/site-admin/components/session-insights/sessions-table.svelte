<script lang="ts">
    import Archive from '$icons/lucide/archive';
    import Download from '$icons/lucide/download';
    import Filter from '$icons/lucide/filter';
    import MessageSquare from '$icons/lucide/message-square';
    import Search from '$icons/lucide/search';
    import X from '$icons/lucide/x';

    import type { AppState } from '$lib/client/app/app.state.svelte';
    import PikaTable from 'pika-ux/pika/pika-table/pika-table.svelte';
    import type {
        GlobalFilterProps,
        ServerSideConfig,
        ServerSideTableState,
        TableSettingsFacade,
    } from 'pika-ux/pika/pika-table/types';
    import { Badge } from 'pika-ux/shadcn/badge';
    import { Button } from 'pika-ux/shadcn/button';
    import { Card } from 'pika-ux/shadcn/card';
    import { Input } from 'pika-ux/shadcn/input';
    import { Separator } from 'pika-ux/shadcn/separator';
    import { getContext } from 'svelte';
    import FiltersAppliedPanel from './filters-applied-panel.svelte';
    import FiltersPopup from './filters-popup.svelte';
    import { buildColumns } from './sessions-table-columns';

    const appState = getContext<AppState>('appState');
    const siteAdminState = appState.siteAdmin;
    const sessionInsights = siteAdminState.sessionInsights;

    // Build columns dynamically based on site features
    // Make columns reactive so they rebuild when userNamesMap changes
    // Access userNamesMap to create reactive dependency
    const columns = $derived.by(() => {
        // Track userNamesMap so columns rebuild when it changes
        sessionInsights.userNamesMap;
        sessionInsights.entityNamesMap;
        return buildColumns(appState.siteAdmin.siteFeatures, sessionInsights);
    });

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
    let currentPageSize = $state(sessionInsights.pageSize);
    let currentPageStartIndex = $state(0);

    // Computed: Only show the current page of sessions for traditional pagination
    let currentPageSessions = $derived(
        sessionInsights.sessions.slice(currentPageStartIndex, currentPageStartIndex + currentPageSize)
    );

    // Client-side global filter props
    let globalFilterProps = $state<GlobalFilterProps>({
        showGlobalFilter: true,
        globalFilterValue: '',
        globalFilterPlaceholder: 'Search loaded results...',
    });

    // Server-side table state
    let serverSideTableState = $state<ServerSideTableState>({
        pageIndex: 0,
        pageSize: sessionInsights.pageSize,
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
        clientSideGlobalFilter: true, // Enable client-side global filter for quick filtering of loaded results
        get tableState() {
            return serverSideTableState;
        },

        requestData: async (tableState: ServerSideTableState) => {
            // Update our local table state
            serverSideTableState = { ...serverSideTableState, ...tableState, isLoading: true };

            try {
                const isFirstPage = tableState.pageIndex === 0;

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
                }

                // Update table state with response data
                serverSideTableState = {
                    ...serverSideTableState,
                    isLoading: false,
                    totalRecords: undefined, // We don't have total count with cursor pagination
                    hasNextPage: sessionInsights.hasMore,
                    scrollId: sessionInsights.searchQuery.scrollId,
                    error: undefined,
                    pageSize: currentPageSize, // Update pageSize to match actual data shown
                };
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

    // Trigger initial data load on mount via the table's requestData mechanism
    let initialLoadTriggered = $state(false);
    $effect(() => {
        if (!initialLoadTriggered && sessionInsights.sessions.length === 0 && !sessionInsights.isSearching) {
            initialLoadTriggered = true;
            serverSideConfig.requestData(serverSideTableState);
        }
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

    <!-- PikaTable Component -->
    <PikaTable
        {columns}
        data={currentPageSessions}
        tableKey="session-insights"
        bind:serverSideConfig
        bind:globalFilterProps
        {tableSettings}
        showRowsPerPage={false}
        paginationPlacement="both"
        classes="h-full flex flex-col"
        {toolbarContent}
        {beneathToolbarContent}
    />
</div>

{#snippet toolbarContent()}
    <!-- SERVER-SIDE SEARCH BAR -->
    <div class="flex gap-3 items-start mb-3">
        <div class="flex items-center gap-1">
            {#if sessionInsights.searchQuery.query}
                <Button
                    variant="ghost"
                    class="h-6 w-6 p-0 hover:bg-gray-100"
                    onclick={() => (sessionInsights.searchQuery.query = '')}
                >
                    <X class="w-4 h-4 text-muted-foreground hover:text-gray-700" />
                </Button>
            {:else}
                <Search class="w-4 h-4 text-muted-foreground mr-2" />
            {/if}
            <Input
                placeholder="Search all records (title/session id/user/name)..."
                value={sessionInsights.searchQuery.query}
                oninput={(e) => {
                    sessionInsights.searchQuery.query = (e.currentTarget.value ?? '').trim();
                }}
                class="h-8 w-[320px]"
            />
            <FiltersPopup />
        </div>
        <FiltersAppliedPanel />
    </div>
{/snippet}

{#snippet beneathToolbarContent()}
    <!-- CLIENT-SIDE FILTER BAR -->
    <div class="border-t border-b bg-gradient-to-r from-blue-50 to-indigo-50/30 px-4 py-2.5 flex items-center gap-3">
        <div class="flex items-center gap-2">
            <div class="p-1.5 bg-blue-100 rounded-md">
                <Filter class="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div class="flex flex-col">
                <span class="text-xs font-semibold text-blue-900 leading-none">Quick Filter</span>
                <span class="text-[10px] text-blue-600/70 leading-none mt-0.5">
                    Refine {sessionInsights.sessions.length} loaded
                </span>
            </div>
        </div>
        <div class="flex items-center gap-2">
            <Input
                placeholder="Filter by title, session ID, user, etc..."
                bind:value={globalFilterProps.globalFilterValue}
                class="h-8 w-[280px] text-sm border-blue-200 focus-visible:ring-blue-500"
            />
            {#if globalFilterProps.globalFilterValue}
                <Button
                    variant="ghost"
                    size="sm"
                    class="h-8 text-xs px-2 hover:bg-blue-100"
                    onclick={() => (globalFilterProps.globalFilterValue = '')}
                >
                    <X class="w-3 h-3 mr-1" />
                    Clear
                </Button>
            {/if}
        </div>
    </div>
{/snippet}
