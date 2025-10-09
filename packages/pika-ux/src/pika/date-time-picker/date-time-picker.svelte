<script lang="ts">
    import CalendarIcon from '$icons/lucide/calendar';
    import X from '$icons/lucide/x';
    import { Button } from '../../shadcn/button';
    import { Calendar } from '../../shadcn/calendar';
    import { Input } from '../../shadcn/input';
    import * as Popover from '../../shadcn/popover';
    import { cn } from '../../shadcn/utils';
    import { CalendarDate, parseAbsolute, type DateValue } from '@internationalized/date';
    import { isSameDay, parseISO } from 'date-fns';
    import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

    type Props = {
        value?: string; // ISO string
        onChange?: (value: string | undefined) => void;
        placeHolder?: string;
        minValue?: string; // ISO string
        maxValue?: string; // ISO string
        required?: boolean;
        timezone: string; // Required timezone prop
        classes?: string;

        /**
         * This is ignored if minValue or maxValue is not set.  If both are set,
         * this is similarly ignored.
         *
         * If true and minValue is set and the user sets the date to the same day as minValue
         * but the time is before the time in minValue, the time will be set to the exact time
         * of minValue.
         *
         * If true and maxValue is set and the user sets the date to the same day as maxValue
         * but the time is after the time in maxValue, the time will be set to the exact time
         * of maxValue.
         */
        autoCorrectTimeForSameDay?: boolean;
    };

    let { value = $bindable(), onChange, placeHolder, minValue, maxValue, required, timezone, classes, autoCorrectTimeForSameDay = false }: Props = $props();

    // State for flashing red effect when auto-correction occurs
    let isFlashingRed = $state(false);

    // Helper function to trigger red flash effect
    function triggerRedFlash() {
        isFlashingRed = true;
        setTimeout(() => {
            isFlashingRed = false;
        }, 600); // Flash for 600ms
    }

    // Convert ISO string to DateValue for the Calendar component
    function isoToDateValue(isoString: string | undefined): DateValue | undefined {
        if (!isoString) return undefined;
        try {
            return parseAbsolute(isoString, timezone);
        } catch {
            return undefined;
        }
    }

    // Convert ISO string to date-only DateValue for Calendar min/max (ignores time)
    function isoToDateOnlyValue(isoString: string | undefined): DateValue | undefined {
        if (!isoString) return undefined;
        try {
            const date = parseISO(isoString);
            return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
        } catch {
            return undefined;
        }
    }

    // Convert DateValue to ISO string
    function dateValueToIso(dateValue: DateValue | undefined, hour: number = 0, minute: number = 0): string | undefined {
        if (!dateValue) return undefined;

        // Create a Date object in the specified timezone
        const date = new Date(dateValue.year, dateValue.month - 1, dateValue.day, hour, minute);

        // Convert to UTC and return ISO string
        return fromZonedTime(date, timezone).toISOString();
    }

    // DATA FLOW EXPLANATION:
    // 1. Main prop 'value' is an ISO string (what gets passed to parent)
    // 2. Calendar component needs DateValue, so we use localDateValue as intermediate
    // 3. When prop changes -> update localDateValue (effect below)
    // 4. When user clicks calendar -> Calendar updates localDateValue via bind:value -> second effect detects this -> calls handleDateChange -> updates main value

    // Create a local DateValue to track calendar changes
    let localDateValue = $state<DateValue | undefined>(isoToDateValue(value));

    // EFFECT 1: Prop -> Local (when parent updates the value prop)
    $effect(() => {
        localDateValue = isoToDateValue(value);
    });

    // EFFECT 2: Local -> Prop (when user interacts with calendar)
    $effect(() => {
        // Skip if localDateValue change was caused by the prop change above
        if (localDateValue === isoToDateValue(value)) return;

        // Call handleDateChange when localDateValue changes through calendar interaction
        handleDateChange(localDateValue);
    });

    // Time handling - derive from ISO value
    let hours = $derived.by(() => {
        if (!value) return 0;
        const date = parseISO(value);
        // Parse the time in the specified timezone
        const timeStr = formatInTimeZone(date, timezone, 'H');
        return parseInt(timeStr);
    });

    let minutes = $derived.by(() => {
        if (!value) return 0;
        const date = parseISO(value);
        const timeStr = formatInTimeZone(date, timezone, 'm');
        return parseInt(timeStr);
    });

    let isPM = $derived(hours >= 12);

    // Format for display using your timezone approach
    const displayFormatter = $derived.by(() => {
        if (!value) return '';
        const date = parseISO(value);
        return formatInTimeZone(date, timezone, 'M/d/yy h:mm a');
    });

    function isTimeValid(isoString: string, hour: number, minute: number): boolean {
        if (!minValue && !maxValue) return true;

        const testDate = parseISO(isoString);
        const testDateTime = new Date(testDate.getFullYear(), testDate.getMonth(), testDate.getDate(), hour, minute);
        const testIso = fromZonedTime(testDateTime, timezone).toISOString();

        if (minValue && testIso < minValue) return false;
        if (maxValue && testIso > maxValue) return false;

        return true;
    }

    function handleTimeChange(type: 'hour' | 'minute', newValue: string) {
        const num = parseInt(newValue) || 0;
        let newHour = hours;
        let newMinute = minutes;

        if (type === 'hour') {
            newHour = Math.max(0, Math.min(23, num));
        } else {
            newMinute = Math.max(0, Math.min(59, num));
        }

        // If no date is set, use today
        let dateToUse = value ? parseISO(value) : new Date();
        const newDateTime = new Date(dateToUse.getFullYear(), dateToUse.getMonth(), dateToUse.getDate(), newHour, newMinute);
        let newIso = fromZonedTime(newDateTime, timezone).toISOString();

        // Apply auto-correction if enabled and time is invalid
        let autoCorrectionApplied = false;
        if (!isTimeValid(newIso, newHour, newMinute) && autoCorrectTimeForSameDay && (minValue || maxValue) && !(minValue && maxValue)) {
            const newDate = parseISO(newIso);
            const originalIso = newIso;

            // Case 1: minValue is set, same day, but time is before minValue
            if (minValue && !maxValue) {
                const minDateTime = parseISO(minValue);
                if (isSameDay(newDate, minDateTime) && newDate < minDateTime) {
                    newIso = minValue;
                    autoCorrectionApplied = originalIso !== newIso;
                }
            }

            // Case 2: maxValue is set, same day, but time is after maxValue
            if (maxValue && !minValue) {
                const maxDateTime = parseISO(maxValue);
                if (isSameDay(newDate, maxDateTime) && newDate > maxDateTime) {
                    newIso = maxValue;
                    autoCorrectionApplied = originalIso !== newIso;
                }
            }
        }

        // Apply the change if it's now valid (either originally or after auto-correction)
        if (isTimeValid(newIso, parseISO(newIso).getHours(), parseISO(newIso).getMinutes())) {
            value = newIso;
            onChange?.(newIso);

            // Trigger red flash if auto-correction was applied
            if (autoCorrectionApplied) {
                triggerRedFlash();
            }
        }
    }

    function handleDateChange(newDate: DateValue | undefined) {
        if (!newDate) {
            if (required) return;
            value = undefined;
            onChange?.(undefined);
            return;
        }

        // Preserve existing time or use current time
        const currentHour = hours;
        const currentMinute = minutes;

        let newIso = dateValueToIso(newDate, currentHour, currentMinute);

        if (newIso) {
            let autoCorrectionApplied = false;

            // Auto-correct time for same day if enabled and only one of min/max is set
            if (autoCorrectTimeForSameDay && (minValue || maxValue) && !(minValue && maxValue)) {
                const newDateTime = parseISO(newIso);
                const originalIso = newIso;

                // Case 1: minValue is set, same day, but time is before minValue
                if (minValue && !maxValue) {
                    const minDateTime = parseISO(minValue);
                    if (isSameDay(newDateTime, minDateTime) && newDateTime < minDateTime) {
                        newIso = minValue;
                        autoCorrectionApplied = originalIso !== newIso;
                    }
                }

                // Case 2: maxValue is set, same day, but time is after maxValue
                if (maxValue && !minValue) {
                    const maxDateTime = parseISO(maxValue);
                    if (isSameDay(newDateTime, maxDateTime) && newDateTime > maxDateTime) {
                        newIso = maxValue;
                        autoCorrectionApplied = originalIso !== newIso;
                    }
                }
            }

            // Use normal validation if auto-correction didn't apply or wasn't enabled
            if (isTimeValid(newIso, parseISO(newIso).getHours(), parseISO(newIso).getMinutes())) {
                localDateValue = newDate;
                value = newIso;
                onChange?.(newIso);

                // Trigger red flash if auto-correction was applied
                if (autoCorrectionApplied) {
                    triggerRedFlash();
                }
            }
        }
    }

    function handleClear(e: Event) {
        e.stopPropagation();
        localDateValue = undefined;
        value = undefined;
        onChange?.(undefined);
    }
</script>

<Popover.Root>
    <Popover.Trigger class={cn('justify-start text-left font-normal', !value && 'text-muted-foreground')}>
        <div class={cn('relative')}>
            <Button variant="outline" class={cn('justify-start text-left font-normal', !value && 'text-muted-foreground', classes)}>
                <CalendarIcon class="h-5 w-5" />
                {value ? displayFormatter : placeHolder || 'Pick a date/time'}
            </Button>
            {#if value && !required}
                <button
                    type="button"
                    class="absolute top-1 right-2 h-7 hover:bg-muted rounded-sm text-muted-foreground hover:text-foreground"
                    onclick={handleClear}
                    onkeydown={(e) => e.key === 'Enter' && handleClear(e)}
                >
                    <X class="h-4 w-4" />
                </button>
            {/if}
        </div>
    </Popover.Trigger>
    <Popover.Content class="w-auto p-0">
        <Calendar type="single" bind:value={localDateValue} minValue={isoToDateOnlyValue(minValue)} maxValue={isoToDateOnlyValue(maxValue)} preventDeselect={required} />
        <div class="p-3 border-t border-border flex flex-col gap-2">
            <div class="flex items-center gap-1">
                <Input
                    type="number"
                    bind:value={
                        () => {
                            return hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
                        },
                        (newVal) => {
                            const newHour = newVal === 12 ? (isPM ? 12 : 0) : isPM ? newVal + 12 : newVal;
                            handleTimeChange('hour', newHour.toString());
                        }
                    }
                    min={1}
                    max={12}
                    class="w-16 {isFlashingRed ? 'text-destructive' : ''}"
                />
                <span>:</span>
                <Input
                    type="number"
                    bind:value={
                        () => minutes,
                        (newVal) => {
                            const newMinute = newVal === 60 ? 0 : newVal;
                            handleTimeChange('minute', newMinute.toString());
                        }
                    }
                    min={0}
                    max={59}
                    class="w-16 {isFlashingRed ? 'text-destructive' : ''}"
                />
                <Button
                    variant="outline"
                    size="sm"
                    class="w-20"
                    onclick={() => {
                        const newHour = hours >= 12 ? hours - 12 : hours + 12;
                        handleTimeChange('hour', newHour.toString());
                    }}
                >
                    {hours >= 12 ? 'PM' : 'AM'}
                </Button>
            </div>
            {#if minValue}
                <div class="text-xs transition-colors duration-200 {isFlashingRed ? 'text-destructive' : 'text-muted-foreground'}">
                    must be after {formatInTimeZone(parseISO(minValue), timezone, 'M/d/yy h:mm a')}
                </div>
            {/if}
            {#if maxValue}
                <div class="text-xs transition-colors duration-200 {isFlashingRed ? 'text-destructive' : 'text-muted-foreground'}">
                    must be before {formatInTimeZone(parseISO(maxValue), timezone, 'M/d/yy h:mm a')}
                </div>
            {/if}
        </div>
    </Popover.Content>
</Popover.Root>
