import { PikaTableCheckbox, PikaTableColumnHeader, PikaTableRowActions } from '$lib/components/ui-pika/pika-table';
import type { RowActionsProps } from '$lib/components/ui-pika/pika-table/types';
import { Button } from '$lib/components/ui/button';
import { renderComponent } from '$lib/components/ui/data-table/render-helpers';
import { formatDistanceToNow } from 'date-fns';
import type { ChatSession } from '@pika/shared/types/chatbot/chatbot-types';
import type { ColumnDef } from '@tanstack/table-core';

// Create properly typed versions of Pika components for ChatSession data
const TableColumnHeader = PikaTableColumnHeader<ChatSession, unknown>;
const TableRowActions = PikaTableRowActions<ChatSession>;

// Helper function to create styled text for table cells
function createStatusText(text: string, type: 'success' | 'warning' | 'error' | 'neutral' = 'neutral') {
    // Return simple text for now - can be enhanced with styling later
    return text;
}

export function getColumns(actionProps: RowActionsProps<ChatSession>): ColumnDef<ChatSession>[] {
    return [
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
                return `${sessionId.slice(0, 8)}...${sessionId.slice(-4)}`;
            },
            enableGlobalFilter: true,
            size: 120
        },

        // User ID
        {
            accessorKey: 'userId',
            header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'User' }),
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

        // Last Update
        {
            accessorKey: 'lastUpdate',
            header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Last Update' }),
            cell: ({ getValue }) => {
                const date = new Date(getValue() as string);
                return formatDistanceToNow(date, { addSuffix: true });
            },
            size: 120
        },

        // Message Count (derived from lastMessageId presence)
        {
            id: 'messageCount',
            header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Messages' }),
            cell: ({ row }) => {
                // This would need to be enhanced with actual message count
                return row.original.lastMessageId ? '1+' : '0';
            },
            enableSorting: false,
            size: 80
        },

        // Token Usage
        {
            accessorKey: 'inputTokens',
            header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Input Tokens' }),
            cell: ({ getValue }) => {
                const tokens = getValue() as number | undefined;
                return tokens ? tokens.toLocaleString() : '-';
            },
            size: 100
        },

        {
            accessorKey: 'outputTokens',
            header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Output Tokens' }),
            cell: ({ getValue }) => {
                const tokens = getValue() as number | undefined;
                return tokens ? tokens.toLocaleString() : '-';
            },
            size: 100
        },

        // Total Cost with currency formatting
        {
            accessorKey: 'totalCost',
            header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Cost' }),
            cell: ({ getValue }) => {
                const cost = getValue() as number | undefined;
                return cost ? `$${cost.toFixed(4)}` : '-';
            },
            size: 80
        },

        // Insights Status
        {
            id: 'insightsStatus',
            header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Insights' }),
            cell: ({ row }) => {
                const session = row.original;
                if (session.insights) {
                    return createStatusText('Available', 'success');
                } else if (session.insightStatus) {
                    return createStatusText('Processing', 'warning');
                } else {
                    return createStatusText('Pending', 'neutral');
                }
            },
            enableSorting: false,
            filterFn: (row, id, value) => {
                const session = row.original;
                if (value.includes('available') && session.insights) return true;
                if (value.includes('processing') && session.insightStatus) return true;
                if (value.includes('pending') && !session.insights && !session.insightStatus) return true;
                return false;
            },
            size: 100
        },

        // Goal Achievement Score (from insights)
        {
            id: 'goalScore',
            header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Goal Score' }),
            cell: ({ row }) => {
                const score = row.original.insights?.scoring?.scores?.goalAchievement?.score;
                if (score === undefined) return '-';

                const type = score >= 8 ? 'success' : score >= 6 ? 'warning' : 'error';
                return createStatusText(`${score}/10`, type);
            },
            sortingFn: (rowA, rowB) => {
                const scoreA = rowA.original.insights?.scoring?.scores?.goalAchievement?.score ?? -1;
                const scoreB = rowB.original.insights?.scoring?.scores?.goalAchievement?.score ?? -1;
                return scoreA - scoreB;
            },
            size: 100
        },

        // Feedback Status
        {
            id: 'feedbackStatus',
            header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Feedback' }),
            cell: ({ row }) => {
                const feedback = row.original.feedback;
                if (!feedback || feedback.length === 0) {
                    return createStatusText('None', 'neutral');
                }

                const hasNegative = feedback.some((f) => f.severity === 'high' || f.severity === 'medium');
                return createStatusText(`${feedback.length} item${feedback.length > 1 ? 's' : ''}`, hasNegative ? 'error' : 'success');
            },
            enableSorting: false,
            filterFn: (row, id, value) => {
                const feedback = row.original.feedback;
                if (value.includes('none') && (!feedback || feedback.length === 0)) return true;
                if (value.includes('positive') && feedback?.some((f) => f.severity === 'low')) return true;
                if (value.includes('negative') && feedback?.some((f) => f.severity === 'high' || f.severity === 'medium')) return true;
                return false;
            },
            size: 100
        },

        // Row Actions
        {
            id: 'actions',
            enableHiding: false,
            cell: ({ row }) => renderComponent(TableRowActions, { row, actionProps }),
            size: 50
        }
    ];
}
