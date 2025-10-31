<script lang="ts">
    import Calendar from '$icons/lucide/calendar';
    import ChevronsUpDown from '$icons/lucide/chevrons-up-down';
    import X from '$icons/lucide/x';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { CalendarDate, DateFormatter, getLocalTimeZone, type DateValue } from '@internationalized/date';
    import type { DateRange } from 'bits-ui';
    import type {
        ChatAppLite,
        ConverseInvocationMode,
        SimpleOption,
        UserType,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import Combobox from 'pika-ux/pika/combobox/combobox.svelte';
    import * as PikaToggleGroup from 'pika-ux/pika/pika-toggle-group';
    import { Badge } from 'pika-ux/shadcn/badge';
    import { Button } from 'pika-ux/shadcn/button';
    import { Label } from 'pika-ux/shadcn/label';
    import * as Popover from 'pika-ux/shadcn/popover';
    import { RangeCalendar } from 'pika-ux/shadcn/range-calendar';
    import { Separator } from 'pika-ux/shadcn/separator';
    import { getContext } from 'svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const sessionAnalytics = siteAdmin.sessionAnalytics;
    const sessionInsights = siteAdmin.sessionInsights;

    let dateRangeOpen = $state(false);

    const df = new DateFormatter('en-US', {
        dateStyle: 'medium',
    });

    // Convert JavaScript Date to CalendarDate and vice versa
    function dateToCalendarDate(date: Date): CalendarDate {
        return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }

    function calendarDateToDate(calendarDate: DateValue): Date {
        return calendarDate.toDate(getLocalTimeZone());
    }

    // Create reactive date range value for RangeCalendar
    let dateRangeValue = $derived.by<DateRange>(() => ({
        start: dateToCalendarDate(sessionAnalytics.dateRange.start),
        end: dateToCalendarDate(sessionAnalytics.dateRange.end),
    }));

    let startValue = $state<DateValue | undefined>(undefined);

    // Derived state from sessionAnalytics
    const entityFeatureEnabled = $derived(sessionAnalytics.entityFeatureEnabled);
    const entitySingularUpper = $derived.by(() => {
        const result = sessionAnalytics.entityDisplayName;
        return result.charAt(0).toUpperCase() + result.slice(1);
    });
    const entityPluralUpper = $derived.by(() => {
        const result = siteAdmin.siteFeatures?.entity?.displayNamePlural ?? 'Entities';
        return result.charAt(0).toUpperCase() + result.slice(1);
    });

    // Get entity name for selected entity
    let selectedEntityOption = $state<SimpleOption | undefined>(undefined);

    // Chat apps
    const chatApps = $derived(siteAdmin.chatApps);
    const selectedChatApps = $derived.by(() => {
        return chatApps.filter((app) => sessionAnalytics.selectedChatAppIds.includes(app.chatAppId));
    });

    // User types
    const userTypeOptions: { value: UserType; label: string }[] = [
        { value: 'external-user', label: 'External Users' },
        { value: 'internal-user', label: 'Internal Users' },
    ];

    // Invocation modes
    const invocationModeOptions: { value: ConverseInvocationMode | 'undefined'; label: string; description: string }[] =
        [
            {
                value: 'undefined',
                label: 'User-Initiated (undefined)',
                description: 'Sessions without invocation mode',
            },
            { value: 'chat-app', label: 'User-Initiated (chat-app)', description: 'Sessions from chat UI' },
            { value: 'direct-agent-invoke', label: 'Direct Agent API', description: 'Direct API invocations' },
            { value: 'chat-app-component', label: 'Widget Invocations', description: 'Embedded widget sessions' },
        ];

    // Date range display
    const dateRangeDisplay = $derived.by(() => {
        const value = dateRangeValue;
        if (value && value.start) {
            if (value.end) {
                return `${df.format(value.start.toDate(getLocalTimeZone()))} - ${df.format(value.end.toDate(getLocalTimeZone()))}`;
            }
            return df.format(value.start.toDate(getLocalTimeZone()));
        } else if (startValue) {
            return df.format(startValue.toDate(getLocalTimeZone()));
        }
        return 'Pick a date';
    });

    // Quick range buttons
    const quickRanges: { value: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all'; label: string }[] = [
        { value: 'day', label: 'Today' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
        { value: 'quarter', label: 'Quarter' },
        { value: 'year', label: 'Year' },
        { value: 'all', label: 'All Time' },
    ];

    function toggleChatApp(chatApp: ChatAppLite) {
        const currentIds = [...sessionAnalytics.selectedChatAppIds];
        const index = currentIds.indexOf(chatApp.chatAppId);
        if (index > -1) {
            currentIds.splice(index, 1);
        } else {
            currentIds.push(chatApp.chatAppId);
        }
        sessionAnalytics.setChatApps(currentIds);
    }

    function clearChatApps() {
        sessionAnalytics.setChatApps([]);
    }
</script>

<div class="flex flex-col gap-4 p-4 bg-muted/30 rounded-lg border">
    <div class="flex flex-wrap gap-4 items-end">
        <!-- Date Range Filter -->
        <div class="flex flex-col gap-1 min-w-[280px]">
            <Label for="date-range-filter" class="text-sm font-medium text-muted-foreground">Date Range</Label>
            <div class="flex items-center gap-2">
                <Popover.Root bind:open={dateRangeOpen}>
                    <Popover.Trigger id="date-range-filter">
                        {#snippet child({ props })}
                            <Button
                                {...props}
                                variant="outline"
                                size="sm"
                                class="flex flex-1 items-center justify-between min-w-[240px]"
                            >
                                <span class="flex items-center gap-2">
                                    <Calendar class="h-4 w-4" />
                                    {dateRangeDisplay}
                                </span>
                                <ChevronsUpDown class="shrink-0 opacity-50" />
                            </Button>
                        {/snippet}
                    </Popover.Trigger>
                    <Popover.Content class="w-auto p-0" align="start">
                        <div class="flex flex-col">
                            <RangeCalendar
                                value={dateRangeValue}
                                onValueChange={(v) => {
                                    if (v && v.start && v.end) {
                                        sessionAnalytics.setDateRange(
                                            calendarDateToDate(v.start),
                                            calendarDateToDate(v.end)
                                        );
                                    }
                                }}
                                onStartValueChange={(v) => {
                                    startValue = v;
                                }}
                                numberOfMonths={2}
                            />
                            <Separator />
                            <div class="flex flex-col gap-2 p-4">
                                <Label class="text-sm font-medium text-muted-foreground">Quick Presets</Label>
                                <div class="flex flex-wrap gap-2">
                                    {#each quickRanges as range}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            class="h-7"
                                            onclick={() => {
                                                sessionAnalytics.setQuickDateRange(range.value);
                                                dateRangeOpen = false;
                                            }}
                                        >
                                            {range.label}
                                        </Button>
                                    {/each}
                                </div>
                            </div>
                        </div>
                    </Popover.Content>
                </Popover.Root>
            </div>
        </div>

        <!-- Entity Filter (if enabled) -->
        {#if entityFeatureEnabled}
            <div class="flex flex-col gap-1 min-w-[200px]">
                <Label class="text-sm font-medium text-muted-foreground">Filter by {entitySingularUpper}</Label>
                <Combobox
                    bind:value={
                        () => selectedEntityOption,
                        (val) => {
                            selectedEntityOption = val;
                            sessionAnalytics.setEntity(val?.value);
                        }
                    }
                    mapping={{
                        value: (val) => val?.value ?? '',
                        label: (val) => val?.label ?? '',
                    }}
                    options={sessionInsights.valuesForEntityAutoComplete}
                    onSearchValueChanged={(val) => sessionInsights.getValuesForEntityAutoComplete(val)}
                    loading={sessionInsights.entityAutoCompleteSearchInProgress}
                    optionTypeName={entitySingularUpper}
                    optionTypeNamePlural={entityPluralUpper}
                    minCharactersForSearch={2}
                    allowClear={true}
                    inputPlaceholder="All {entityPluralUpper}"
                    showValueInListEntries={true}
                    wrapperClasses="flex-1"
                />
            </div>
        {/if}

        <!-- Chat Apps Filter -->
        <div class="flex flex-col gap-1 min-w-[200px]">
            <Label class="text-sm font-medium text-muted-foreground">Chat Apps</Label>
            <Popover.Root>
                <Popover.Trigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="outline"
                            class="flex items-center justify-between min-w-[200px] h-9"
                        >
                            <span>
                                {#if selectedChatApps.length === 0}
                                    All Chat Apps
                                {:else if selectedChatApps.length === 1}
                                    {selectedChatApps[0].title}
                                {:else}
                                    {selectedChatApps.length} selected
                                {/if}
                            </span>
                            <ChevronsUpDown class="shrink-0 opacity-50 ml-2" />
                        </Button>
                    {/snippet}
                </Popover.Trigger>
                <Popover.Content class="w-[320px] p-0">
                    <div class="flex flex-col max-h-[400px]">
                        <div class="p-3 flex items-center justify-between border-b">
                            <div class="text-sm font-medium">Select Chat Apps</div>
                            {#if selectedChatApps.length > 0}
                                <Button variant="ghost" size="sm" class="h-6 px-2 text-xs" onclick={clearChatApps}>
                                    Clear All
                                </Button>
                            {/if}
                        </div>
                        <div class="overflow-y-auto p-2">
                            {#each chatApps as chatApp}
                                <button
                                    class="w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left"
                                    onclick={() => toggleChatApp(chatApp)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={sessionAnalytics.selectedChatAppIds.includes(chatApp.chatAppId)}
                                        class="rounded"
                                        readonly
                                    />
                                    <div class="flex-1">
                                        <div class="text-sm font-medium">{chatApp.title}</div>
                                        {#if chatApp.description}
                                            <div class="text-xs text-muted-foreground">{chatApp.description}</div>
                                        {/if}
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>
                </Popover.Content>
            </Popover.Root>
        </div>

        <!-- User Type Filter -->
        <div class="flex flex-col gap-1 min-w-[200px]">
            <Label class="text-sm font-medium text-muted-foreground">User Types</Label>
            <PikaToggleGroup.Root
                variant="outline"
                type="multiple"
                buttonWidth="w-[125px]"
                bind:value={
                    () => sessionAnalytics.selectedUserTypes,
                    (value: string[]) => {
                        if (value) {
                            sessionAnalytics.setUserTypes(value as UserType[]);
                        } else {
                            sessionAnalytics.setUserTypes([]);
                        }
                    }
                }
            >
                {#each userTypeOptions as userType}
                    <PikaToggleGroup.Item value={userType.value}>
                        {userType.label}
                    </PikaToggleGroup.Item>
                {/each}
            </PikaToggleGroup.Root>
        </div>

        <!-- Invocation Mode Filter -->
        <div class="flex flex-col gap-1 min-w-[200px]">
            <Label class="text-sm font-medium text-muted-foreground">Invocation Types</Label>
            <Popover.Root>
                <Popover.Trigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="outline"
                            size="sm"
                            class="flex items-center justify-between min-w-[200px]"
                        >
                            <span>
                                {#if sessionAnalytics.selectedInvocationModes.length === 0}
                                    All Types
                                {:else if sessionAnalytics.selectedInvocationModes.length === invocationModeOptions.length}
                                    All Types
                                {:else}
                                    {sessionAnalytics.selectedInvocationModes.length} selected
                                {/if}
                            </span>
                            <ChevronsUpDown class="shrink-0 opacity-50 ml-2" />
                        </Button>
                    {/snippet}
                </Popover.Trigger>
                <Popover.Content class="w-[360px] p-0">
                    <div class="flex flex-col">
                        <div class="p-3 border-b">
                            <div class="text-sm font-medium">Select Invocation Types</div>
                            <div class="text-xs text-muted-foreground mt-1">
                                Filter sessions by how they were initiated
                            </div>
                        </div>
                        <div class="p-2">
                            {#each invocationModeOptions as mode}
                                <button
                                    class="w-full flex items-start gap-2 p-2 rounded hover:bg-accent text-left"
                                    onclick={() => sessionAnalytics.toggleInvocationMode(mode.value)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={sessionAnalytics.selectedInvocationModes.includes(mode.value)}
                                        class="rounded mt-0.5"
                                        readonly
                                    />
                                    <div class="flex-1">
                                        <div class="text-sm font-medium">{mode.label}</div>
                                        <div class="text-xs text-muted-foreground">{mode.description}</div>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>
                </Popover.Content>
            </Popover.Root>
        </div>

        <!-- Group By Filter -->
        <div class="flex flex-col gap-1 min-w-[150px]">
            <Label class="text-sm font-medium text-muted-foreground">Group By</Label>
            <PikaToggleGroup.Root
                variant="outline"
                type="single"
                bind:value={
                    () => sessionAnalytics.groupBy,
                    (value: string) => {
                        if (value) {
                            sessionAnalytics.setGroupBy(value as 'day' | 'week' | 'month');
                        }
                    }
                }
            >
                <PikaToggleGroup.Item value="day">Day</PikaToggleGroup.Item>
                <PikaToggleGroup.Item value="week">Week</PikaToggleGroup.Item>
                <PikaToggleGroup.Item value="month">Month</PikaToggleGroup.Item>
            </PikaToggleGroup.Root>
        </div>
    </div>

    <!-- Active Filters Summary -->
    <div class="flex flex-wrap gap-2 items-center">
        <span class="text-xs text-muted-foreground font-medium">Active Filters:</span>

        {#if sessionAnalytics.selectedEntityId && selectedEntityOption}
            <Badge variant="secondary" class="gap-1">
                {entitySingularUpper}: {selectedEntityOption.label}
                <X class="h-3 w-3 cursor-pointer" onclick={() => sessionAnalytics.setEntity(undefined)} />
            </Badge>
        {/if}

        {#each selectedChatApps as chatApp}
            <Badge variant="secondary" class="gap-1">
                {chatApp.title}
                <X class="h-3 w-3 cursor-pointer" onclick={() => toggleChatApp(chatApp)} />
            </Badge>
        {/each}

        {#if sessionAnalytics.selectedUserTypes.length === 0 || sessionAnalytics.selectedUserTypes.length === 2}
            <Badge variant="secondary">All User Types</Badge>
        {:else}
            {#each sessionAnalytics.selectedUserTypes as userType}
                <Badge variant="secondary" class="gap-1">
                    {userTypeOptions.find((opt) => opt.value === userType)?.label}
                    <X class="h-3 w-3 cursor-pointer" onclick={() => sessionAnalytics.toggleUserType(userType)} />
                </Badge>
            {/each}
        {/if}

        {#if sessionAnalytics.selectedInvocationModes.length > 0 && sessionAnalytics.selectedInvocationModes.length < invocationModeOptions.length}
            {#each sessionAnalytics.selectedInvocationModes as mode}
                <Badge variant="secondary" class="gap-1">
                    {invocationModeOptions.find((opt) => opt.value === mode)?.label}
                    <X class="h-3 w-3 cursor-pointer" onclick={() => sessionAnalytics.toggleInvocationMode(mode)} />
                </Badge>
            {/each}
        {/if}
    </div>
</div>
