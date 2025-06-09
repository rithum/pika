<script lang="ts">
    import { Check, ChevronsUpDown } from '$icons/lucide';
    import { tick } from 'svelte';
    import * as Command from '$lib/components/ui/command';
    import * as Popover from '$lib/components/ui/popover';
    import { Button } from '$lib/components/ui/button';
    import { cn } from '$lib/utils';
    import indefinite from 'indefinite';
    import plur from 'plur';
    import type { ComboboxOption } from './combobox-types';

    let {
        value = $bindable(),
        options,
        optionTypeName = 'option',
        // We will figure out the plural form of the data type name using the plur library if not provided
        optionTypeNamePlural,
        onValueChanged,
        widthClasses = 'w-[200px]',
    }: {
        value: string;
        options: (ComboboxOption | string)[];
        inputPlaceholder?: string;
        searchPlaceholder?: string;
        onValueChanged?: (value: string) => void;
        widthClasses?: string;
        // This is the name of the type of data in the combobox that a user will understand
        optionTypeName?: string;
        optionTypeNamePlural?: string;
    } = $props();

    $effect(() => {
        // Throw an exception if there is an options array and if all values are not unique
        if (
            options &&
            options.length > 0 &&
            new Set(options.map((opt) => (typeof opt === 'string' ? opt : opt.value))).size !== options.length
        ) {
            throw new Error(`All values in the options array must be unique: ${JSON.stringify(options)}`);
        }
    });

    const plurarFormOfOptionTypeName = $derived(optionTypeNamePlural ?? plur(optionTypeName));
    const optionTypeNamePrecededByArticle = $derived(indefinite(optionTypeName));
    const selectAnOptionText = $derived(`Select ${optionTypeNamePrecededByArticle}...`);
    let open = $state(false);
    let triggerRef = $state<HTMLButtonElement>(null!);

    // Normalize options to always have .value and .label
    const normalizedOptions = $derived(
        options.map((opt) =>
            typeof opt === 'string' ? { value: opt, label: opt } : { value: opt.value, label: opt.label }
        )
    );

    const selectedValue = $derived(normalizedOptions.find((f) => f.value === value)?.label ?? selectAnOptionText);

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

<Popover.Root bind:open>
    <Popover.Trigger bind:ref={triggerRef}>
        {#snippet child({ props })}
            <Button variant="outline" class={widthClasses} {...props} role="combobox" aria-expanded={open}>
                {selectedValue || selectAnOptionText}
                <ChevronsUpDown class="opacity-50" />
            </Button>
        {/snippet}
    </Popover.Trigger>
    <Popover.Content class="{widthClasses} p-0">
        <Command.Root>
            <Command.Input placeholder="Search {plurarFormOfOptionTypeName}..." class="h-9" />
            <Command.List>
                <Command.Empty>No {optionTypeName} found.</Command.Empty>
                <Command.Group value={plurarFormOfOptionTypeName}>
                    {#each normalizedOptions as option (option.value)}
                        <Command.Item
                            value={option.value}
                            onSelect={() => {
                                if (value !== option.value) {
                                    value = option.value;
                                    if (onValueChanged) onValueChanged(option.value);
                                }
                                closeAndFocusTrigger();
                            }}
                        >
                            <Check class={cn(value !== option.value && 'text-transparent')} />
                            {option.label}
                        </Command.Item>
                    {/each}
                </Command.Group>
            </Command.List>
        </Command.Root>
    </Popover.Content>
</Popover.Root>
