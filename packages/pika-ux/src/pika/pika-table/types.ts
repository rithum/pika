import type { Column, ColumnFiltersState, Row, SortingState, VisibilityState } from '@tanstack/table-core';
import type { Component } from 'svelte';

/**
 * Facade for table settings (column visibility, page size, etc.)
 * This allows the pika-table component to be used without depending on AppState
 */
export interface TableSettingsFacade {
    getTableColumnVisibilityObject(tableKey: string): VisibilityState;
    getTableNumRows(tableKey: string, defaultValue: number): number;
    setTableNumRows(tableKey: string, value: number): void;
    setTableColumnVisibilityFromObject(tableKey: string, visibility: VisibilityState): void;
}

export interface FacetedFilterData {
    label: string;
    value: string;
    icon?: Component;
    iconClasses?: string;
}

export interface FacetedFilterProps {
    columnId: string;
    title: string;
    options: FacetedFilterData[];
}

export interface FacetedFilterPropsWithColumn<TData> extends FacetedFilterProps {
    column: Column<TData, unknown>;
}

/**
 * Each of these is a column that has a filter that will be displayed in the toolbar as a dropdown
 * that allows the user to filter by the column and the options provided.
 */
export type FacetedFilters = FacetedFilterProps[];

export type FacetedFiltersWithColumn<TData> = FacetedFilterPropsWithColumn<TData>[];

/**
 * You control which columns are filtered by the global input filter by setting enableGlobalFilter to true on the column def
 * and false on the others.
 *
 * TODO: add a way to let them pass in the globalFilterFn and override the default if needed
 *
 * The globalFilterValue should just be `$state<string>('')`
 */
export interface GlobalFilterProps {
    showGlobalFilter: boolean;
    globalFilterValue?: string;
    globalFilterPlaceholder?: string;
}

export interface RowActionMenuItemNode<TData> {
    label: string;
    icon?: Component;
    onclick?: (row: Row<TData>) => void;
}

export interface RowActionMenuItemSubMenu<TData> {
    label: string;
    icon?: Component;
    menuItems: RowActionMenuItem<TData>[];
}

export interface RowActionsProps<TData> {
    menuWidth?: string; // must be a valid css unit like 160px, will pair concat with w- to form the width using tailwind
    menuItems: RowActionMenuItem<TData>[];
}

export type RowActionMenuItem<TData> = 'Separator' | RowActionMenuItemNode<TData> | RowActionMenuItemSubMenu<TData>;

// === SERVER-SIDE TYPES ===

export interface ServerSideTableState {
    // === PAGINATION ===
    pageIndex: number;
    pageSize: number;
    totalRecords?: number; // Total number of records available
    scrollId?: string; // For cursor-based pagination
    hasNextPage?: boolean; // Indicates if there are more pages available

    // === SORTING ===
    sorting: SortingState;

    // === FILTERING ===
    columnFilters: ColumnFiltersState;

    // === LOADING STATE ===
    isLoading?: boolean;
    error?: string;

    // === METADATA ===
    requestId: string;
}

/**
 * Unified server-side configuration that combines both configuration and state.
 * This is the recommended interface for new implementations.
 */
export interface ServerSideConfig {
    // === REQUEST INITIATOR ===
    requestData: (tableState: ServerSideTableState) => Promise<void>;

    // === PAGINATION STYLE ===
    paginationMode: 'offset' | 'cursor';

    // === DEBOUNCING ===
    debounceMs?: number; // Default 300ms

    // === ERROR HANDLING ===
    onError?: (error: string) => void;

    // === CLIENT-SIDE FILTERING ===
    /**
     * When true, enables client-side global filter even in server-side mode.
     * This allows users to quickly filter already-loaded results without triggering server requests.
     * Column filters still work server-side, but the global filter searches loaded data only.
     */
    clientSideGlobalFilter?: boolean;

    // === DYNAMIC TABLE STATE ===
    tableState: ServerSideTableState;
}
