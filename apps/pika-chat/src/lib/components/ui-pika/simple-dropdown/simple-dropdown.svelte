<script lang="ts" generics="T">
    import { Check, ChevronsUpDown, X } from '$icons/lucide';
    import { Button } from '$lib/components/ui/button';
    import * as Command from '$lib/components/ui/command';
    import * as Popover from '$lib/components/ui/popover';
    import { cn } from '$lib/utils';
    import indefinite from 'indefinite';
    import plur from 'plur';
    import { tick } from 'svelte';
    import type { SimpleDropdownMapping } from './simple-dropdown-types';

    let {
        value = $bindable(),
        mapping,
        options,
        inputPlaceholder,
        searchPlaceholder,
        optionTypeName = 'option',
        // We will figure out the plural form of the data type name using the plur library if not provided
        optionTypeNamePlural,
        onValueChanged,
        widthClasses = 'w-[200px]',
        popupWidthClasses = '',
        loading = false,
        showValueInListEntries = false,
        disabled = false,
        allowArbitraryValues,
        dontShowSearchInput = false,
        allowClear = false,
    }: {
        value: T | undefined;
        mapping: SimpleDropdownMapping<T>;
        options: T[] | undefined;
        inputPlaceholder?: string;
        searchPlaceholder?: string;
        onValueChanged?: (value: T) => void;
        widthClasses?: string;
        // This is the name of the type of data in the dropdown that a user will understand
        optionTypeName?: string;
        optionTypeNamePlural?: string;
        loading?: boolean;
        showValueInListEntries?: boolean;
        disabled?: boolean;
        dontShowSearchInput?: boolean;
        popupWidthClasses?: string;
        allowClear?: boolean;
        allowArbitraryValues?: {
            convertValueToType: (arbitraryValue: string) => T;
        };
    } = $props();

    $effect(() => {
        // Throw an exception if there is an options array and if all values are not unique
        if (options && options.length > 0 && new Set(options.map((opt) => getValue(opt))).size !== options.length) {
            throw new Error(
                `All values in the options (returned from your mappings.getValue fn) array must be unique: ${JSON.stringify(options)}`
            );
        }
    });

    const getValue = (item: T) => mapping.value(item);
    const getLabel = (item: T) => mapping.label(item);
    const getSecondaryLabel = (item: T) => mapping.secondaryLabel?.(item);

    const plurarFormOfOptionTypeName = $derived(optionTypeNamePlural ?? plur(optionTypeName));
    const optionTypeNamePrecededByArticle = $derived(indefinite(optionTypeName));
    const selectAnOptionText = $derived(`Select ${optionTypeNamePrecededByArticle}...`);
    let open = $state(false);
    let triggerRef = $state<HTMLButtonElement>(null!);
    let searchValue = $state('');

    const labelToDisplayInButton = $derived.by(() => {
        if (!value) return inputPlaceholder ?? selectAnOptionText;

        // Value is always type T now, so use the mapping
        return getLabel(value);
    });

    // Add the current value to the options if it's not already in the options
    const normalizedOptions = $derived(options ? [...options] : []);

    // Show all options when dropdown opens, optionally filter by search text
    const visibleOptions = $derived.by(() => {
        if (loading) {
            return []; // Don't show any options if we are loading
        }

        if (!searchValue.trim()) {
            return normalizedOptions; // Show all when no search text
        }

        // Filter options by search text for better UX
        return normalizedOptions.filter((option) => getLabel(option).toLowerCase().includes(searchValue.toLowerCase()));
    });

    // We want to refocus the trigger button when the user selects
    // an item from the list so users can continue navigating the
    // rest of the form with the keyboard.
    function closeAndFocusTrigger() {
        open = false;
        tick().then(() => {
            triggerRef.focus();
        });
    }

    // Handle input changes for arbitrary values
    function handleInputChange(e: Event) {
        const inputValue = (e.target as HTMLInputElement).value;

        if (allowArbitraryValues) {
            // Convert the string to type T using the user's conversion function
            const convertedValue = allowArbitraryValues.convertValueToType(inputValue);
            value = convertedValue;
            if (onValueChanged) onValueChanged(value);
        }
        // If arbitrary values not allowed, searchValue is just for filtering
    }

    // Handle Enter key for arbitrary values
    function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Enter' && allowArbitraryValues && searchValue.trim()) {
            e.preventDefault();
            // Convert the arbitrary value and set it
            const convertedValue = allowArbitraryValues.convertValueToType(searchValue.trim());
            value = convertedValue;
            if (onValueChanged) onValueChanged(value);
            searchValue = ''; // Clear the search input
            closeAndFocusTrigger();
        }
    }

    // Handle clear button click
    function handleClear(e: Event) {
        e.stopPropagation();
        value = undefined;
        if (onValueChanged) onValueChanged(undefined as T);
    }
</script>

<div class="flex items-center">
    <Popover.Root bind:open>
        <Popover.Trigger bind:ref={triggerRef}>
            {#snippet child({ props })}
                <Button
                    variant="outline"
                    class={`flex items-center justify-between ${widthClasses}`}
                    {...props}
                    role="combobox"
                    aria-expanded={open}
                    {disabled}
                >
                    <span class="flex-1 flex items-center">
                        <span class={cn('text-left truncate', !value && 'text-muted-foreground')}
                            >{labelToDisplayInButton}</span
                        >
                        {#if showValueInListEntries && value}
                            <span class="text-xs text-muted-foreground/70 font-mono truncate ml-1">
                                ({getValue(value)})
                            </span>
                        {/if}
                    </span>

                    <ChevronsUpDown class="ml-2 shrink-0 opacity-50" />
                </Button>
            {/snippet}
        </Popover.Trigger>
        <Popover.Content class={cn('p-0', popupWidthClasses)}>
            <Command.Root shouldFilter={false} class="">
                {#if !dontShowSearchInput}
                    <Command.Input
                        bind:value={searchValue}
                        oninput={handleInputChange}
                        onkeydown={handleKeyDown}
                        placeholder={searchPlaceholder ?? `Search ${plurarFormOfOptionTypeName}...`}
                        class="h-9"
                    />
                {/if}
                <Command.List>
                    {#if loading}
                        <Command.Loading>
                            <div class="flex items-center justify-center py-6 text-sm text-muted-foreground">
                                <div class="flex items-center gap-2">
                                    <div
                                        class="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
                                    ></div>
                                    Loading {plurarFormOfOptionTypeName}...
                                </div>
                            </div>
                        </Command.Loading>
                    {:else}
                        <Command.Empty>
                            {#if allowArbitraryValues && searchValue.trim()}
                                Press Enter to use "{searchValue}"
                            {:else}
                                No {optionTypeName} found.
                            {/if}
                        </Command.Empty>
                    {/if}
                    <Command.Group value={plurarFormOfOptionTypeName}>
                        {#key visibleOptions}
                            {#each visibleOptions as option (getValue(option))}
                                <Command.Item
                                    value={getValue(option)}
                                    onSelect={() => {
                                        const optionValue = getValue(option);
                                        // Check if this is a different selection
                                        if (!value || getValue(value) !== optionValue) {
                                            value = option;
                                            if (onValueChanged) onValueChanged(value);
                                        }
                                        closeAndFocusTrigger();
                                    }}
                                    class={cn(
                                        'flex items-start gap-2 px-2 py-2',
                                        (getSecondaryLabel(option) || showValueInListEntries) && 'py-2.5 min-h-[3rem]'
                                    )}
                                >
                                    <Check
                                        class={cn(
                                            'mt-1 flex-shrink-0',
                                            (!value || getValue(value) !== getValue(option)) && 'text-transparent'
                                        )}
                                    />
                                    <div class="flex-1 min-w-0">
                                        <!-- Primary label -->
                                        <div class="font-medium text-sm leading-tight truncate">
                                            {getLabel(option)}
                                            {#if showValueInListEntries}
                                                <span class="text-xs text-muted-foreground/70 font-mono truncate ml-1">
                                                    ({getValue(option)})
                                                </span>
                                            {/if}
                                        </div>

                                        <!-- Secondary and tertiary info in a row -->
                                        {#if getSecondaryLabel(option)}
                                            <div class="flex items-center gap-2 mt-0.5">
                                                {#if getSecondaryLabel(option)}
                                                    <span class="text-xs text-muted-foreground">
                                                        {getSecondaryLabel(option)}
                                                    </span>
                                                {/if}
                                            </div>
                                        {/if}
                                    </div>
                                </Command.Item>
                            {/each}
                        {/key}
                    </Command.Group>
                </Command.List>
            </Command.Root>
        </Popover.Content>
    </Popover.Root>
    {#if allowClear && value}
        <X class="ml-2 h-4 w-4 shrink-0 opacity-50 hover:opacity-100 cursor-pointer" onclick={handleClear} />
    {/if}
</div>
