<!--TODO Make this a generic component inside of pika-table-->
<script lang="ts" module>
    type TData = unknown;
</script>

<script lang="ts" generics="TData">
    import { X } from '$icons/lucide';
    import { PikaTableFacetedFilter, PikaTableViewOptions } from '$ui/pika/pika-table';
    import Button from '$ui/shadcn/button/button.svelte';
    import { Input } from '$ui/shadcn/input/index.js';
    import type { Table } from '@tanstack/table-core';
    import type { Snippet } from 'svelte';
    import type {
        FacetedFilterPropsWithColumn,
        FacetedFilters,
        FacetedFiltersWithColumn,
        GlobalFilterProps,
    } from './types';

    interface Props {
        table: Table<TData>;
        globalFilterProps?: GlobalFilterProps;
        facetedFilters?: FacetedFilters;
        // If you pass in toolbar content then global filter and faceted filters will be ignored
        toolbarContent?: Snippet;

        // Appears beneath the toolbar and above the table
        beneathToolbarContent?: Snippet;
    }

    let { table, globalFilterProps, facetedFilters = [], toolbarContent, beneathToolbarContent }: Props = $props();

    const isFiltered = $derived(table.getState().columnFilters.length > 0 || table.getState().globalFilter);

    const facetedFilterCols = $derived(
        facetedFilters.reduce((acc, filter) => {
            const col = table.getColumn(filter.columnId);
            if (col) {
                const propsWithColumn: FacetedFilterPropsWithColumn<TData> = {
                    ...filter,
                    column: col,
                };
                acc.push(propsWithColumn);
            }
            return acc;
        }, [] as FacetedFiltersWithColumn<TData>)
    );
</script>

<div class="flex items-start justify-between">
    {#if toolbarContent}
        {@render toolbarContent()}
    {:else}
        <div class="flex flex-1 items-center space-x-2">
            {#if globalFilterProps?.showGlobalFilter}
                <Input
                    placeholder={globalFilterProps?.globalFilterPlaceholder ?? 'Filter table...'}
                    value={globalFilterProps?.globalFilterValue}
                    oninput={(e) => {
                        globalFilterProps.globalFilterValue = e.currentTarget.value;
                    }}
                    onchange={(e) => {
                        table.setGlobalFilter(e.currentTarget.value);
                    }}
                    class="h-8 w-[150px] lg:w-[250px]"
                />
            {/if}

            {#each facetedFilterCols as col}
                <PikaTableFacetedFilter column={col.column} title={col.title} options={col.options} />
            {/each}

            {#if isFiltered}
                <Button
                    variant="ghost"
                    onclick={() => {
                        table.resetColumnFilters(true);
                        table.resetGlobalFilter(true);
                    }}
                    class="h-8 px-2 lg:px-3"
                >
                    Reset
                    <X />
                </Button>
            {/if}
        </div>
    {/if}

    <PikaTableViewOptions {table} />
</div>
{#if beneathToolbarContent}
    {@render beneathToolbarContent()}
{/if}
