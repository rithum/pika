<script lang="ts">
    import { Archive, Download, MessageSquare, X } from '$icons/lucide';

    import PikaTable from '$ui/pika/pika-table/pika-table.svelte';
    import type { ServerSideConfig, ServerSideTableState } from '$ui/pika/pika-table/types';
    import { Button } from '$ui/shadcn/button';
    import { Card } from '$ui/shadcn/card';
    import { Separator } from '$ui/shadcn/separator';
    import FiltersPopup from './filters-popup.svelte';
    // Import additional PikaTable components
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { getContext } from 'svelte';
    import FiltersAppliedPanel from './filters-applied-panel.svelte';
    import { columns } from './table-columns';

    const appState = getContext<AppState>('appState');
    const siteAdminState = appState.siteAdmin;
    const iaState = siteAdminState.instructionAugmentation;

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
            console.log('requestData', tableState);

            // Update our local table state
            serverSideTableState = { ...serverSideTableState, ...tableState, isLoading: true };

            // try {
            //     // Convert TanStack state to SessionSearchRequest format
            //     const searchRequest: SessionSearchRequest = {
            //         size: 50,
            //         scrollId: sessionInsights.searchQuery.scrollId,

            //         // Map sorting
            //         sortBy: tableState.sorting.map((s) => ({
            //             field: s.id as any,
            //             order: s.desc ? 'desc' : 'asc',
            //         })),

            //         // Map global filter
            //         titlePartial: tableState.globalFilter,

            //         // Extract specific filters from columnFilters
            //         insights: extractInsightsFilter(tableState.columnFilters),
            //         feedbackSeverity: extractFeedbackFilter(tableState.columnFilters),

            //         // Use session insights date range
            //         // createDate: sessionInsights.simpleSearch.dateRange.start.toISOString(),
            //         // endCreateDate: sessionInsights.simpleSearch.dateRange.end?.toISOString(),
            //     };

            //     // Call session insights search with the constructed request
            //     // await sessionInsights.performSearchWithRequest(searchRequest);

            //     // Update table state with response data
            //     serverSideTableState = {
            //         ...serverSideTableState,
            //         isLoading: false,
            //         totalRecords: undefined, //TODO: sessionInsights.totalRecords,
            //         hasNextPage: sessionInsights.hasMore,
            //         scrollId: sessionInsights.searchQuery.scrollId,
            //         error: undefined,
            //     };
            // } catch (error) {
            //     serverSideTableState = {
            //         ...serverSideTableState,
            //         isLoading: false,
            //         error: error instanceof Error ? error.message : 'Unknown error',
            //     };
            //     throw error;
            // }
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
        console.log('Export selected semantic directives:', iaState.selectedSemanticDirectives);
    }

    function bulkAddFeedback() {
        console.log('Add feedback to selected semantic directives:', iaState.selectedSemanticDirectives);
    }

    function bulkArchive() {
        console.log('Archive selected semantic directives:', iaState.selectedSemanticDirectives);
    }

    function clearSelection() {
        iaState.clearSelection();
    }
</script>

<div class="flex flex-col h-full pb-4">
    <!-- Bulk Actions Toolbar -->
    {#if iaState.selectedSemanticDirectives.length > 0}
        <Card class="p-3 bg-blue-50 border-blue-200">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <span class="font-medium"
                        >{iaState.selectedSemanticDirectives.length} semantic directives selected</span
                    >
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
        data={iaState.semanticDirectives}
        tableKey="instruction-augmentation"
        bind:serverSideConfig
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
                <!-- <Input
                    placeholder="Search by session title..."
                    value={sessionInsights.searchQuery.titlePartial}
                    oninput={(e) => {
                        sessionInsights.searchQuery.titlePartial = (e.currentTarget.value ?? '').trim();

                        // if (
                        //     sessionInsights.searchQuery.titlePartial &&
                        //     sessionInsights.searchQuery.titlePartial.length > 3
                        // ) {
                        //     sessionInsights.performSearch(false);
                        // }
                    }}
                    class="h-8 w-[150px] lg:w-[250px]"
                /> -->
                <FiltersPopup />
            </div>
            <FiltersAppliedPanel />
        </div>
    </div>
{/snippet}
