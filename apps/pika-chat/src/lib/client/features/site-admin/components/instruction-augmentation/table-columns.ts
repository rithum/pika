import type { ColumnDef } from '@tanstack/table-core';
import { formatDistanceToNow } from 'date-fns';
import type { SemanticDirective } from 'pika-shared/types/chatbot/chatbot-types';
import { PikaTableCheckbox, PikaTableColumnHeader } from 'pika-ux/pika/pika-table';
import { renderComponent } from 'pika-ux/shadcn/data-table';
import ScopeCell from './cells/scope-cell.svelte';

const TableColumnHeader = PikaTableColumnHeader<SemanticDirective, unknown>;
// const TableRowActions = PikaTableRowActions<SemanticDirective>;

function truncateText(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Column definitions using PikaTable approach
export const columns: ColumnDef<SemanticDirective>[] = [
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

    {
        accessorKey: 'scope',
        header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Scope' }),
        cell: ({ row }) => {
            return renderComponent(ScopeCell, { directive: row.original });
        },
        enableGlobalFilter: true,
        size: 120
    },

    {
        accessorKey: 'id',
        header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'ID' }),
        cell: ({ getValue }) => {
            const id = getValue() as string | undefined;
            return id || '-';
        },
        enableGlobalFilter: true,
        size: 120
    },

    {
        accessorKey: 'description',
        header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Description' }),
        cell: ({ getValue }) => {
            const description = getValue() as string;
            return truncateText(description, 40) || '-';
        },
        size: 120
    },

    {
        accessorKey: 'disabled',
        header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Disabled' }),
        cell: ({ getValue }) => {
            const disabled = getValue() as boolean | undefined;
            return disabled === true || (disabled as any) === 'true' ? 'Yes' : 'No';
        },
        enableGlobalFilter: true,
        size: 200
    },

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
    }
];
