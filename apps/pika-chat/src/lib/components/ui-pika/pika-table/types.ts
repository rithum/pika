import type { AppState } from '$client/app/app.state.svelte';
import type { Column, Row } from '@tanstack/table-core';
import type { Component } from 'svelte';

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
    onclick?: (row: Row<TData>, appState: AppState) => void;
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
