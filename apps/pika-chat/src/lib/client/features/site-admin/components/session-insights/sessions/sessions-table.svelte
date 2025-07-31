<script lang="ts">
    import { Archive, Eye, MessageSquare, Search, Trash2, UserCheck } from '$icons/lucide';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import PikaTable from '$ui/pika/pika-table/pika-table.svelte';
    import type {
        FacetedFilters,
        GlobalFilterProps,
        RowActionsProps,
        ServerSideState,
        ServerSideTableState,
    } from '$ui/pika/pika-table/types';
    import type {
        ChatSession,
        InsightsSearchParams,
        SessionFeedbackSeverity,
        SessionSearchRequest,
    } from '@pika/shared/types/chatbot/chatbot-types';
    import type { ColumnFiltersState } from '@tanstack/table-core';
    import { getContext } from 'svelte';
    import { getColumns } from './columns';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;

    const sessions = $derived(siteAdmin.chatSessions);
    const pagination = $derived(siteAdmin.sessionsPagination);

    // Helper functions to extract specific filters
    function extractInsightsFilter(columnFilters: ColumnFiltersState): InsightsSearchParams | undefined {
        const insightsFilter = columnFilters.find((f) => f.id === 'insightsStatus');
        if (!insightsFilter) return undefined;

        const values = insightsFilter.value as string[];
        return {
            hasInsights: values.includes('available'),
        };
    }

    function extractFeedbackFilter(columnFilters: ColumnFiltersState): SessionFeedbackSeverity[] | undefined {
        const feedbackFilter = columnFilters.find((f) => f.id === 'feedbackStatus');
        if (!feedbackFilter) return undefined;

        // Map UI values to API values
        const values = feedbackFilter.value as string[];
        const severities: SessionFeedbackSeverity[] = [];

        if (values.includes('negative')) {
            severities.push('high', 'medium');
        }
        if (values.includes('positive')) {
            severities.push('low');
        }

        return severities.length > 0 ? severities : undefined;
    }

    // Global filter configuration
    let globalFilterProps = $state<GlobalFilterProps>({
        showGlobalFilter: true,
        globalFilterValue: '',
        globalFilterPlaceholder: 'Search sessions, users, titles...',
    });

    // Faceted filter configurations
    const facetedFilters: FacetedFilters = [
        {
            columnId: 'insightsStatus',
            title: 'Insights',
            options: [
                { label: 'Available', value: 'available', icon: UserCheck },
                { label: 'Processing', value: 'processing', icon: Search },
                { label: 'Pending', value: 'pending', icon: Archive },
            ],
        },
        {
            columnId: 'feedbackStatus',
            title: 'Feedback',
            options: [
                { label: 'None', value: 'none' },
                { label: 'Positive', value: 'positive' },
                { label: 'Negative', value: 'negative' },
            ],
        },
    ];

    // Row action menu configuration
    const actionProps: RowActionsProps<ChatSession> = {
        menuWidth: '180px',
        menuItems: [
            {
                label: 'View Session',
                icon: Eye,
                onclick: (row, appState) => {
                    // Navigate to session detail view
                    console.log('View session:', row.original.sessionId);
                },
            },
            {
                label: 'View Messages',
                icon: MessageSquare,
                onclick: (row, appState) => {
                    // Navigate to messages view
                    console.log('View messages:', row.original.sessionId);
                },
            },
            'Separator',
            {
                label: 'Session Actions',
                icon: Archive,
                menuItems: [
                    {
                        label: 'Archive Session',
                        onclick: (row, appState) => {
                            console.log('Archive session:', row.original.sessionId);
                        },
                    },
                    {
                        label: 'Delete Session',
                        icon: Trash2,
                        onclick: (row, appState) => {
                            if (confirm('Are you sure you want to delete this session?')) {
                                console.log('Delete session:', row.original.sessionId);
                            }
                        },
                    },
                ],
            },
        ],
    };

    // Server-side configuration
    const serverSideConfig: ServerSideState = {
        paginationMode: 'cursor',
        debounceMs: 300,

        requestData: async (tableState: ServerSideTableState) => {
            // Convert TanStack state to SessionSearchRequest format
            const searchRequest: SessionSearchRequest = {
                size: tableState.pageSize,
                scrollId: pagination.scrollId, // Use current cursor

                // Map sorting
                sortBy: tableState.sorting.map((s) => ({
                    field: s.id as any,
                    order: s.desc ? 'desc' : 'asc',
                })),

                // Map filters to your specific search params
                titlePartial: tableState.globalFilter,

                // Extract specific filters from columnFilters
                insights: extractInsightsFilter(tableState.columnFilters),
                feedbackSeverity: extractFeedbackFilter(tableState.columnFilters),

                // Required date range (last 30 days as default)
                createDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            };

            const siteAdminRequest = {
                command: 'sessionSearch' as const,
                search: searchRequest,
            };

            // Update loading state - note: accessing the mutable state object
            const paginationState = siteAdmin.sessionsPagination;
            paginationState.isLoading = true;
            paginationState.error = undefined;

            // Initiate the request (doesn't return data)
            await siteAdmin.sendSiteAdminCommand(siteAdminRequest);
        },

        onError: (error: string) => {
            console.error('Server-side table error:', error);
            const paginationState = siteAdmin.sessionsPagination;
            paginationState.error = error;
            paginationState.isLoading = false;
        },
    };

    const columns = getColumns(actionProps);
</script>

<PikaTable
    {columns}
    data={sessions}
    tableKey="chat-sessions"
    bind:globalFilterProps
    {facetedFilters}
    serverSide={serverSideConfig}
    classes="min-h-[600px]"
/>
