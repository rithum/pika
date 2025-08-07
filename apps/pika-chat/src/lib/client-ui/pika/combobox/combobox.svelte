<script lang="ts" generics="T">
    import { Check, ChevronsUpDown, X } from '$icons/lucide';
    import { Button } from '$ui/shadcn/button';
    import * as Command from '$ui/shadcn/command';
    import * as Popover from '$ui/shadcn/popover';
    import { cn } from '$ui/shadcn/utils';
    import indefinite from 'indefinite';
    import plur from 'plur';
    import { tick } from 'svelte';
    import type { ComboboxMapping } from './combobox-types';

    let {
        value = $bindable(),
        mapping,
        options,
        optionTypeName = 'option',
        // We will figure out the plural form of the data type name using the plur library if not provided
        optionTypeNamePlural,
        onValueChanged,
        onSearchValueChanged,
        debounceSearchMs = 300,
        popupWidthClasses = '',
        wrapperClasses = 'w-[200px]',
        buttonClasses = '',
        minCharactersForSearch = 3,
        loading = false,
        showValueInListEntries = false,
        disabled = false,
        allowClear = false,
        inputPlaceholder,
    }: {
        value: T | undefined;
        mapping: ComboboxMapping<T>;
        options: T[] | undefined;
        inputPlaceholder?: string;
        searchPlaceholder?: string;
        onValueChanged?: (value: T) => void;
        onSearchValueChanged?: (value: string) => void;
        debounceSearchMs?: number;
        popupWidthClasses?: string;
        wrapperClasses?: string;
        buttonClasses?: string;
        // This is the name of the type of data in the combobox that a user will understand
        optionTypeName?: string;
        optionTypeNamePlural?: string;
        minCharactersForSearch?: number;
        loading?: boolean;
        showValueInListEntries?: boolean;
        disabled?: boolean;
        allowClear?: boolean;
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
    const selectAnOptionText = $derived(inputPlaceholder ?? `Select ${optionTypeNamePrecededByArticle}...`);
    let open = $state(false);
    let triggerRef = $state<HTMLButtonElement>(null!);
    let searchDebounceTimeout = $state<ReturnType<typeof setTimeout> | undefined>();
    let searchValue = $state('');
    let labelIsEmpty = $derived(!value);
    let labelToDisplayInButton = $derived(value ? getLabel(value) : selectAnOptionText);

    // Add the current value to the options if it's not already in the options
    const normalizedOptions = $derived(options ? [...options] : []);

    // Only show options if we meet the minimum search criteria
    const visibleOptions = $derived.by(() => {
        if (loading) {
            return []; // Don't show any options if we are loading
        }

        // Only show options if we have enough characters to search
        if (searchValue.length < minCharactersForSearch) {
            return [];
        }
        return normalizedOptions;
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
</script>

<div class="flex items-center ${wrapperClasses} gap-2">
    <Popover.Root bind:open>
        <Popover.Trigger bind:ref={triggerRef} class="flex-1">
            {#snippet child({ props })}
                <Button
                    variant="outline"
                    class={`flex items-center justify-between w-full ${buttonClasses}`}
                    {...props}
                    role="combobox"
                    aria-expanded={open}
                    {disabled}
                >
                    <span class={cn('flex-1 text-left truncate', labelIsEmpty && 'text-muted-foreground')}>
                        {labelToDisplayInButton}
                    </span>
                    <ChevronsUpDown class="ml-2 shrink-0 opacity-50" />
                </Button>
            {/snippet}
        </Popover.Trigger>
        <Popover.Content class={`p-0 ${popupWidthClasses}`}>
            <Command.Root shouldFilter={false}>
                <Command.Input
                    bind:value={searchValue}
                    oninput={(e: Event) => {
                        if (onSearchValueChanged) {
                            const val = (e.target as HTMLInputElement).value;

                            // Always clear existing timeout
                            if (searchDebounceTimeout) {
                                clearTimeout(searchDebounceTimeout);
                            }

                            // Only make server call if we meet minimum characters
                            if (val.length >= minCharactersForSearch) {
                                // Set new timeout
                                searchDebounceTimeout = setTimeout(() => {
                                    onSearchValueChanged((e.target as HTMLInputElement).value);
                                }, debounceSearchMs);
                            }
                        }
                    }}
                    placeholder="Search {plurarFormOfOptionTypeName}..."
                    class="h-9"
                />
                <Command.List>
                    {#if loading}
                        <Command.Loading>
                            <div class="flex items-center justify-center py-6 text-sm text-muted-foreground">
                                <div class="flex items-center gap-2">
                                    <div
                                        class="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
                                    ></div>
                                    Searching {plurarFormOfOptionTypeName}...
                                </div>
                            </div>
                        </Command.Loading>
                    {:else}
                        <Command.Empty>
                            {#if searchValue.length > 0 && searchValue.length < minCharactersForSearch}
                                Enter at least {minCharactersForSearch} characters to search.
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
                                        if (!value || getValue(value) !== getValue(option)) {
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
                                        </div>

                                        <!-- Secondary and tertiary info in a row -->
                                        {#if getSecondaryLabel(option) || showValueInListEntries}
                                            <div class="flex items-center gap-2 mt-0.5">
                                                {#if getSecondaryLabel(option)}
                                                    <span class="text-xs text-muted-foreground truncate flex-shrink-0">
                                                        {getSecondaryLabel(option)}
                                                    </span>
                                                {/if}
                                                {#if showValueInListEntries}
                                                    <!-- Separator dot if we have both secondary label and value -->
                                                    {#if getSecondaryLabel(option)}
                                                        <span class="text-xs text-muted-foreground/50">•</span>
                                                    {/if}
                                                    <span class="text-xs text-muted-foreground/70 font-mono truncate">
                                                        {getValue(option)}
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
    {#if allowClear && !disabled}
        <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-muted-foreground "
            onclick={() => {
                value = undefined;
                if (onValueChanged) onValueChanged(undefined as T);
            }}
        >
            <X />
        </Button>
    {/if}
</div>
