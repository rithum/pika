<script lang="ts" generics="T">
    import * as Command from '$comps/ui/command/index.js';
    import Button from '$lib/components/ui/button/button.svelte';
    import { Input } from '$lib/components/ui/input';
    import SimpleDropdown from '$lib/components/ui-pika/simple-dropdown/simple-dropdown.svelte';
    import { Minus, Plus } from '$lib/icons/lucide';
    import { SvelteSet } from 'svelte/reactivity';
    import type { ListMapping } from './list-types';
    import { cn } from '$lib/utils';

    interface Props {
        // Additional CSS classes. Can override default height of h-[250px]
        classes?: string;
        items?: T[];
        mapping: ListMapping<T>;
        emptyMessage?: string;
        showValueInListEntries?: boolean;
        disabled?: boolean;
        // If true, the user can select items from the list.
        allowSelection?: boolean;
        // If true, the user can select multiple items from the list.
        multiSelect?: boolean;

        // Allow the user to add and remove items from the list instead of just showing a list of items.
        // You the developer are responsible for ensuring that the items are unique and that the user cannot add the same item twice.
        // You implement the logic for adding and removing items from your underlying list.
        addRemove?: {
            addItem?: (item: T) => void;
            removeItem?: (item: T) => void;
            allowArbitraryValues?: {
                convertValueToType: (arbitraryValue: string) => T;
                // The placeholder text for the input field in the popup allowing a user to filter the list or add an arbitrary value.
                popupInputPlaceholder?: string;
            };
            // Allows for pre-defined items that a user may select from to add to the list if not already present,
            // changing from an input field to a dropdown list with an input field.
            predefinedOptions?: {
                items: T[];
                // This is the name of the type of data in the dropdown that a user will understand
                optionTypeName?: string;
                optionTypeNamePlural?: string;
                // This is the mapping of the predefined options.  If not provided, the mapping of the list will be used.
                mapping?: ListMapping<T>;
            };
            addValueInputPlaceholder?: string;
        };
    }

    let {
        classes = '',
        items = [],
        mapping,
        addRemove,
        emptyMessage,
        showValueInListEntries = false,
        disabled = false,
        allowSelection = false,
        multiSelect = false,
    }: Props = $props();

    const getValue = (item: T) => mapping?.value(item) ?? '';
    const getLabel = (item: T) => mapping?.label(item) ?? '';
    const getSecondaryLabel = (item: T) => mapping?.secondaryLabel?.(item);

    const predefinedItems = $derived(addRemove?.predefinedOptions?.items || []);
    const predefinedMapping = $derived.by(() => {
        const customMapping = addRemove?.predefinedOptions?.mapping;
        if (customMapping) {
            return customMapping;
        }
        return mapping;
    });
    const getPredefinedValue = (item: T) => predefinedMapping?.value(item) ?? '';

    let selectedValues = $state(new SvelteSet<string>());
    let addValueInput = $state('');
    let selectedDropdownItem = $state<T | undefined>(undefined);

    // Auto-enable selection when remove functionality is available
    const effectiveAllowSelection = $derived(allowSelection || addRemove?.removeItem !== undefined);

    function toggleSelection(value: string) {
        if (multiSelect) {
            // Multi-select: toggle the individual item
            if (selectedValues.has(value)) {
                selectedValues.delete(value);
            } else {
                selectedValues.add(value);
            }
        } else {
            // Single-select: clear all and select this one, or deselect if already selected
            if (selectedValues.has(value)) {
                selectedValues.delete(value);
            } else {
                selectedValues.clear();
                selectedValues.add(value);
            }
        }
    }

    // Get available predefined options that aren't already in the list
    const availablePredefinedOptions = $derived.by(() => {
        if (!predefinedItems.length) return [];

        const currentItemValues = new Set(items.map((item) => getValue(item)));
        return predefinedItems.filter((item) => !currentItemValues.has(getPredefinedValue(item)));
    });

    function handleAddFromDropdown() {
        if (selectedDropdownItem && addRemove?.addItem) {
            addRemove.addItem(selectedDropdownItem);
            selectedDropdownItem = undefined; // Reset selection after adding
        }
    }

    function handleRemoveSelectedItems() {
        if (addRemove?.removeItem && selectedValues.size > 0) {
            // Find and remove all selected items from the actual list
            const selectedItems = items.filter((item) => selectedValues.has(getValue(item)));
            selectedItems.forEach((item) => {
                addRemove.removeItem!(item);
            });
            selectedValues.clear(); // Clear selection after removing
        }
    }
</script>

{#if mapping}
    <div class={cn('h-[250px] flex flex-col', classes)}>
        {#if addRemove}
            <div class="flex items-center gap-2 mb-2 min-w-0">
                {#if addRemove.predefinedOptions && predefinedItems.length > 0 && predefinedMapping}
                    <!-- Use SimpleDropdown when predefinedOptions is available -->
                    <div class="flex-1 min-w-0">
                        <SimpleDropdown
                            bind:value={selectedDropdownItem}
                            mapping={predefinedMapping}
                            options={availablePredefinedOptions}
                            optionTypeName={addRemove.predefinedOptions.optionTypeName || 'option'}
                            optionTypeNamePlural={addRemove.predefinedOptions.optionTypeNamePlural || 'options'}
                            widthClasses="w-full"
                            inputPlaceholder={addRemove.addValueInputPlaceholder}
                            searchPlaceholder={addRemove.allowArbitraryValues?.popupInputPlaceholder}
                            {disabled}
                            allowArbitraryValues={addRemove.allowArbitraryValues}
                        />
                    </div>
                    <div class="flex items-center flex-shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            class="w-6 h-7"
                            disabled={disabled || !selectedDropdownItem}
                            onclick={handleAddFromDropdown}
                        >
                            <Plus />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            class="w-6 h-7"
                            disabled={disabled || selectedValues.size === 0}
                            onclick={handleRemoveSelectedItems}
                        >
                            <Minus />
                        </Button>
                    </div>
                {:else}
                    <!-- Fallback to Input when no predefinedOptions or for arbitrary values only -->
                    <Input
                        bind:value={addValueInput}
                        type="text"
                        placeholder={addRemove.addValueInputPlaceholder}
                        {disabled}
                    />
                    <div class="flex items-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            class="w-6 h-7"
                            {disabled}
                            onclick={() => {
                                if (addRemove.allowArbitraryValues && addRemove.addItem) {
                                    addRemove.addItem(addRemove.allowArbitraryValues.convertValueToType(addValueInput));
                                    addValueInput = ''; // Clear input after adding
                                }
                            }}><Plus /></Button
                        >
                        <Button
                            variant="ghost"
                            size="icon"
                            class="w-6 h-7"
                            {disabled}
                            onclick={() => {
                                if (addRemove.allowArbitraryValues && addRemove.removeItem) {
                                    addRemove.removeItem(
                                        addRemove.allowArbitraryValues.convertValueToType(addValueInput)
                                    );
                                    addValueInput = ''; // Clear input after removing
                                }
                            }}><Minus /></Button
                        >
                    </div>
                {/if}
            </div>
        {/if}
        <Command.Root class="border rounded-md">
            <Command.Empty class="text-sm text-muted-foreground p-4">{emptyMessage}</Command.Empty>
            <Command.List class="max-h-48 overflow-auto">
                {#each items as item}
                    <Command.Item
                        value={getValue(item)}
                        class={cn(
                            'flex items-start gap-2 px-2 py-2',
                            disabled
                                ? 'cursor-not-allowed opacity-50'
                                : effectiveAllowSelection
                                  ? 'cursor-pointer'
                                  : 'cursor-default',
                            (getSecondaryLabel(item) || showValueInListEntries) && 'py-2.5 min-h-[3rem]',
                            effectiveAllowSelection && selectedValues.has(getValue(item))
                                ? 'bg-accent aria-selected:bg-accent'
                                : effectiveAllowSelection
                                  ? 'aria-selected:bg-transparent hover:bg-gray-50'
                                  : 'aria-selected:bg-transparent'
                        )}
                        onSelect={() => !disabled && effectiveAllowSelection && toggleSelection(getValue(item))}
                    >
                        <div class="flex-1 min-w-0">
                            <!-- Primary label -->
                            <div class="font-medium text-sm leading-tight truncate">
                                {getLabel(item)}
                            </div>

                            <!-- Secondary and tertiary info in a row -->
                            {#if getSecondaryLabel(item) || showValueInListEntries}
                                <div class="flex items-center gap-2 mt-0.5">
                                    {#if getSecondaryLabel(item)}
                                        <span class="text-xs text-muted-foreground truncate flex-shrink-0">
                                            {getSecondaryLabel(item)}
                                        </span>
                                    {/if}
                                    {#if showValueInListEntries}
                                        <!-- Separator dot if we have both secondary label and value -->
                                        {#if getSecondaryLabel(item)}
                                            <span class="text-xs text-muted-foreground/50">•</span>
                                        {/if}
                                        <span class="text-xs text-muted-foreground/70 font-mono truncate">
                                            {getValue(item)}
                                        </span>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    </Command.Item>
                {/each}
            </Command.List>
        </Command.Root>
    </div>
{:else}
    <div class="text-sm text-muted-foreground p-4">Error: List component requires a mapping configuration</div>
{/if}
