import Archive from '$icons/lucide/archive';
import Eye from '$icons/lucide/eye';
import MessageSquare from '$icons/lucide/message-square';
import Trash2 from '$icons/lucide/trash-2';
import type { ColumnDef } from '@tanstack/table-core';
import { formatDistanceToNow } from 'date-fns';
import type { ChatSession, RecordOrUndef, SiteFeatures } from 'pika-shared/types/chatbot/chatbot-types';
import { PikaTableCheckbox, PikaTableColumnHeader, PikaTableRowActions } from 'pika-ux/pika/pika-table';
import type { RowActionsProps } from 'pika-ux/pika/pika-table/types';
import { renderComponent } from 'pika-ux/shadcn/data-table';
import EntityIdCell from './cells/entity-id-cell.svelte';
import SessionIdCell from './cells/session-id-cell.svelte';
import UserIdCell from './cells/user-id-cell.svelte';
import type { SessionInsightsState } from './session-insights.state.svelte';

const TableColumnHeader = PikaTableColumnHeader<ChatSession<RecordOrUndef>, unknown>;
const TableRowActions = PikaTableRowActions<ChatSession<RecordOrUndef>>;

/**
 * Build columns array dynamically based on site features
 */
export function buildColumns(
    siteFeatures: SiteFeatures | undefined,
    sessionInsights: SessionInsightsState
): ColumnDef<ChatSession<RecordOrUndef>>[] {
    const cols: ColumnDef<ChatSession<RecordOrUndef>>[] = [
    // Selection checkbox column
    {
        id: 'select',
        header: ({ table }) =>
            renderComponent(PikaTableCheckbox, {
                checked: table.getIsAllPageRowsSelected(),
                indeterminate: table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected(),
                onCheckedChange: (value: boolean) => table.toggleAllPageRowsSelected(!!value),
                ariaLabel: 'Select all'
            }),
        cell: ({ row }) =>
            renderComponent(PikaTableCheckbox, {
                checked: row.getIsSelected(),
                onCheckedChange: (value: boolean) => row.toggleSelected(!!value),
                ariaLabel: `Select row`
            }),
        enableSorting: false,
        enableHiding: false,
        size: 50
    },

    // Session ID with truncation for long IDs
    {
        accessorKey: 'sessionId',
        header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Session ID' }),
        cell: ({ getValue }) => {
            const sessionId = getValue() as string;
            return renderComponent(SessionIdCell, { sessionId });
        },
        enableGlobalFilter: true,
        size: 120
    },

    // User ID with enriched display name
    {
        id: 'userId',
        accessorFn: (row) => {
            const userId = row.userId;
            if (!userId) return '';
            
            // Get enriched user info for filtering
            const userInfo = sessionInsights.getUserDisplayInfo(userId);
            
            // Return searchable string containing userId, firstName, and lastName
            const searchParts = [
                userId,
                userInfo?.firstName,
                userInfo?.lastName
            ].filter(Boolean);
            
            return searchParts.join(' ');
        },
        header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'User' }),
        cell: ({ row }) => {
            const userId = row.original.userId;
            if (!userId) return '-';
            
            // Get enriched user info for display
            const userInfo = sessionInsights.getUserDisplayInfo(userId);
            
            return renderComponent(UserIdCell, { 
                userId,
                firstName: userInfo?.firstName,
                lastName: userInfo?.lastName
            });
        },
        enableGlobalFilter: true,
        size: 120
    },

    //Agent
    {
        accessorKey: 'agentId',
        header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Agent' }),
        cell: ({ getValue }) => {
            const agentId = getValue() as string;
            return agentId || '-';
        },
        enableGlobalFilter: true,
        size: 120
    },

    // Session Title
    {
        accessorKey: 'title',
        header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Title' }),
        cell: ({ getValue }) => {
            const title = getValue() as string | undefined;
            return title || 'Untitled Session';
        },
        enableGlobalFilter: true,
        size: 200
    },

    // Created Date with relative time
    {
        accessorKey: 'createDate',
        header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Created' }),
        cell: ({ getValue }) => {
            const date = new Date(getValue() as string);
            return formatDistanceToNow(date, { addSuffix: true });
        },
        sortingFn: (rowA, rowB) => {
            const dateA = new Date(rowA.getValue('createDate') as string);
            const dateB = new Date(rowB.getValue('createDate') as string);
            return dateA.getTime() - dateB.getTime();
        },
        size: 120
    },

    // Enhanced Insights Column with Progress Bars
    // {
    //     id: 'insightsScores',
    //     header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Insights Scores' }),
    //     cell: ({ row }) => {
    //         return renderComponent(InsightsScoreCell, {
    //             insights: row.original.insights,
    //             compact: true,
    //         });
    //     },
    //     size: 200,
    // },

    // // Enhanced Feedback Column with Severity Indicators
    // {
    //     id: 'feedbackDetails',
    //     header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Feedback Details' }),
    //     cell: ({ row }) => {
    //         return renderComponent(FeedbackDetailsCell, {
    //             feedback: row.original.feedback || [],
    //             maxDisplay: 2,
    //         });
    //     },
    //     size: 150,
    // },

    // Row Actions
    {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => renderComponent(TableRowActions, { row, actionProps }),
        size: 50
    }
];

    // Add entity column if entity feature is enabled
    if (siteFeatures?.entity?.enabled) {
        const entityDisplayName = siteFeatures.entity.displayNameSingular || 'Entity';
        
        // Insert entity column after Agent (index 3) and before Title
        cols.splice(4, 0, {
            id: 'entityColumn',
            accessorFn: (row) => {
                const entityId = (row as any).entityId as string | undefined;
                if (!entityId) return '';
                
                // Get enriched entity name for filtering (includes chat-app-global -> '-')
                const entityName = sessionInsights.getEntityName(entityId);
                return entityName || entityId;
            },
            header: ({ column }) => renderComponent(TableColumnHeader, { 
                column, 
                title: entityDisplayName.charAt(0).toUpperCase() + entityDisplayName.slice(1)
            }),
            cell: ({ row }) => {
                const entityId = (row.original as any).entityId as string | undefined;
                if (!entityId) return '';
                
                // Special case: chat-app-global just shows '-' without copy functionality
                if (entityId === 'chat-app-global') {
                    return '-';
                }
                
                // Get the enriched entity name for display
                const entityName = sessionInsights.getEntityName(entityId);
                
                return renderComponent(EntityIdCell, {
                    entityId,
                    entityName
                });
            },
            enableGlobalFilter: true,
            size: 150
        });
    }

    return cols;
}

// Row action menu configuration
const actionProps: RowActionsProps<ChatSession<RecordOrUndef>> = {
    menuWidth: '180px',
    menuItems: [
        {
            label: 'View Session',
            icon: Eye,
            onclick: (row) => {
                console.log('View session:', row.original.sessionId);
            }
        },
        {
            label: 'View Messages',
            icon: MessageSquare,
            onclick: (row) => {
                console.log('View messages:', row.original.sessionId);
            }
        },
        'Separator',
        {
            label: 'Session Actions',
            icon: Archive,
            menuItems: [
                {
                    label: 'Archive Session',
                    onclick: (row) => {
                        console.log('Archive session:', row.original.sessionId);
                    }
                },
                {
                    label: 'Delete Session',
                    icon: Trash2,
                    onclick: (row) => {
                        if (confirm('Are you sure you want to delete this session?')) {
                            console.log('Delete session:', row.original.sessionId);
                        }
                    }
                }
            ]
        }
    ]
};
