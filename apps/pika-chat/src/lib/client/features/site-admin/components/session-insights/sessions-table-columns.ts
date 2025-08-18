import { PikaTableCheckbox, PikaTableColumnHeader, PikaTableRowActions } from '$ui/pika/pika-table';
import type { RowActionsProps } from '$ui/pika/pika-table/types';
import { renderComponent } from '$ui/shadcn/data-table';
import { Archive, Eye, MessageSquare, Trash2 } from '$icons/lucide';
import type { ChatSession, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import type { ColumnDef } from '@tanstack/table-core';
import { formatDistanceToNow } from 'date-fns';
import SessionIdCell from './cells/session-id-cell.svelte';
import UserIdCell from './cells/user-id-cell.svelte';

const TableColumnHeader = PikaTableColumnHeader<ChatSession<RecordOrUndef>, unknown>;
const TableRowActions = PikaTableRowActions<ChatSession<RecordOrUndef>>;

// Column definitions using PikaTable approach
export const columns: ColumnDef<ChatSession<RecordOrUndef>>[] = [
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

    // User ID
    {
        accessorKey: 'userId',
        header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'User' }),
        cell: ({ getValue }) => {
            const userId = getValue() as string | undefined;
            if (!userId) return '-';
            return renderComponent(UserIdCell, { userId });
        },
        enableGlobalFilter: true,
        size: 120
    },

    //Agent 
    {
        accessorKey: 'agentId',
        header: ({column}) => renderComponent(TableColumnHeader, {column, title: 'Agent'}),
        cell: ({getValue}) => {
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

// Row action menu configuration
const actionProps: RowActionsProps<ChatSession<RecordOrUndef>> = {
    menuWidth: '180px',
    menuItems: [
        {
            label: 'View Session',
            icon: Eye,
            onclick: (row, appState) => {
                console.log('View session:', row.original.sessionId);
            }
        },
        {
            label: 'View Messages',
            icon: MessageSquare,
            onclick: (row, appState) => {
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
                    onclick: (row, appState) => {
                        console.log('Archive session:', row.original.sessionId);
                    }
                },
                {
                    label: 'Delete Session',
                    icon: Trash2,
                    onclick: (row, appState) => {
                        if (confirm('Are you sure you want to delete this session?')) {
                            console.log('Delete session:', row.original.sessionId);
                        }
                    }
                }
            ]
        }
    ]
};
