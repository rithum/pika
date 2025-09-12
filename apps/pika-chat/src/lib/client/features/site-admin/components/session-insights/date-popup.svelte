<script lang="ts">
    import DateTimePicker from '$ui/pika/date-time-picker/date-time-picker.svelte';
    import { Button } from '$ui/shadcn/button';
    import { Label } from '$ui/shadcn/label';
    import { Separator } from '$ui/shadcn/separator';
    import SimpleDropdown from '$ui/pika/simple-dropdown/simple-dropdown.svelte';
    import * as Popover from '$ui/shadcn/popover';
    import * as ToggleGroup from '$ui/shadcn/toggle-group';
    import { ChevronsUpDown, X } from '$icons/lucide';

    import type {
        NameValuePair,
        SessionSearchDateFilter,
        SessionSearchDatePreset,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import {
        SESSION_SEARCH_DATE_PRESETS_SHORT_VALUES,
        SESSION_SEARCH_DATE_TYPES_VALUES,
        type SessionSearchDateType,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import {
        createDefaultDateFilter,
        getSessionSearchDateDisplayValue,
        getStartAndEndDate,
        getTimezoneValues,
    } from './utils';

    interface Props {
        dateFilter?: SessionSearchDateFilter;
        placeholder?: string;
        timezone: string;
    }

    let { dateFilter = $bindable(), placeholder, timezone = $bindable() }: Props = $props();
    let open = $state(false);
    let searchDateLabelDisplayValue = $derived(
        getSessionSearchDateDisplayValue(placeholder ?? 'Select Date', timezone, dateFilter)
    );

    let timezoneValues = getTimezoneValues();
    let currentTimezone = $derived.by(() => {
        return {
            value: timezone,
            name: timezoneValues.find((tz) => tz.value === timezone)?.name ?? timezone,
        } as NameValuePair<string>;
    });
</script>

<div class="flex flex-col gap-1">
    <Label for="date-filter-label" class="text-sm font-medium text-muted-foreground"
        >{searchDateLabelDisplayValue[0]}</Label
    >
    <div class="flex items-center gap-2 w-full">
        <Popover.Root
            bind:open={
                () => open,
                (newOpen) => {
                    open = newOpen;
                    if (open && !dateFilter) {
                        dateFilter = createDefaultDateFilter();
                    }
                }
            }
        >
            <Popover.Trigger id="date-filter-label">
                {#snippet child({ props })}
                    <Button {...props} variant="outline" size="sm" class="flex flex-1 items-center justify-between">
                        <span
                            class="flex-1 flex items-center {dateFilter && dateFilter.startDate
                                ? ''
                                : 'text-muted-foreground'}"
                        >
                            {#if dateFilter && dateFilter.startDate}
                                {@html searchDateLabelDisplayValue[1]}
                            {:else}
                                {placeholder ?? 'Select Date'}
                            {/if}
                        </span>
                        <ChevronsUpDown class="shrink-0 opacity-50" />
                    </Button>
                {/snippet}
            </Popover.Trigger>
            <Popover.Content class="p-0 w-[420px]">
                <div class="flex flex-row">
                    <!-- Basic Filters-->
                    <div class="flex flex-col w-[420px]">
                        <div class="pl-4 pr-1 flex items-center justify-between pt-1 h-9">
                            <div class="text-sm font-medium">Date Filter</div>
                            <SimpleDropdown
                                bind:value={
                                    () => currentTimezone,
                                    (newTimzone) => {
                                        timezone = newTimzone.value;
                                    }
                                }
                                inputPlaceholder="Select timezone..."
                                wrapperClasses="mr-2"
                                buttonClasses="h-6"
                                mapping={{
                                    value: (item) => item.value,
                                    label: (item) => item.name,
                                }}
                                options={timezoneValues}
                                dontShowSearchInput={true}
                                showValueInListEntries={true}
                                popupWidthClasses="w-[280px]"
                            />
                        </div>
                        <Separator />
                        {#if dateFilter}
                            <div class="p-4 flex flex-col gap-4">
                                <div class="flex flex-col gap-2">
                                    <Label class="text-sm font-medium text-muted-foreground">Filter By</Label>
                                    <ToggleGroup.Root
                                        variant="outline"
                                        type="single"
                                        size="default"
                                        class="w-[370px]"
                                        bind:value={
                                            () => dateFilter!.dateType,
                                            (value: string) => {
                                                if (value) {
                                                    dateFilter!.dateType = value as SessionSearchDateType;
                                                }
                                            }
                                        }
                                    >
                                        {#each SESSION_SEARCH_DATE_TYPES_VALUES as type}
                                            <ToggleGroup.Item value={type.value}>{type.name}</ToggleGroup.Item>
                                        {/each}
                                    </ToggleGroup.Root>
                                </div>

                                <div class="flex flex-row gap-2">
                                    <div class="flex flex-col gap-2">
                                        <Label class="text-sm font-medium text-muted-foreground">Start Date</Label>
                                        <DateTimePicker
                                            bind:value={
                                                () => dateFilter!.startDate,
                                                (value) => {
                                                    if (value) {
                                                        dateFilter!.startDate = value;
                                                    }
                                                }
                                            }
                                            maxValue={dateFilter!.endDate}
                                            {timezone}
                                            placeHolder="Start date"
                                            required
                                            autoCorrectTimeForSameDay={true}
                                            classes="w-[180px]"
                                        />
                                    </div>
                                    <div class="flex flex-col gap-2">
                                        <Label class="text-sm font-medium text-muted-foreground">End Date</Label>
                                        <DateTimePicker
                                            bind:value={
                                                () => dateFilter!.endDate,
                                                (value) => {
                                                    if (value) {
                                                        dateFilter!.endDate = value;
                                                    }
                                                }
                                            }
                                            minValue={dateFilter.startDate}
                                            {timezone}
                                            placeHolder="Defaults to now"
                                            autoCorrectTimeForSameDay={true}
                                            classes="w-[180px]"
                                        />
                                    </div>
                                </div>
                            </div>
                            <Separator />
                            <div class="flex flex-col gap-2 p-4">
                                <Label class="text-sm font-medium text-muted-foreground"
                                    >Quick Presets for Last...</Label
                                >
                                <div class="flex flex-wrap gap-2">
                                    {#each SESSION_SEARCH_DATE_PRESETS_SHORT_VALUES as type}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            class="h-6 mt-1 mb-1 w-17"
                                            onclick={() => {
                                                const preset = type.value as SessionSearchDatePreset;
                                                const [startDate, endDate] = getStartAndEndDate(preset);
                                                dateFilter!.startDate = startDate;
                                                dateFilter!.endDate = endDate;
                                            }}
                                        >
                                            {type.name}
                                        </Button>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
            </Popover.Content>
        </Popover.Root>
        <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-muted-foreground "
            onclick={() => (dateFilter = undefined)}
        >
            <X />
        </Button>
    </div>
</div>
