<script lang="ts">
    import CalendarIcon from '@lucide/svelte/icons/calendar';
    import { DateFormatter, type DateValue, getLocalTimeZone } from '@internationalized/date';
    import { cn } from '$ui/shadcn/utils.js';
    import { buttonVariants } from '$ui/shadcn/button/index.js';
    import { Calendar } from '$ui/shadcn/calendar/index.js';
    import * as Popover from '$ui/shadcn/popover/index.js';

    const df = new DateFormatter('en-US', {
        dateStyle: 'long',
    });

    let value = $state<DateValue | undefined>();
    let contentRef = $state<HTMLElement | null>(null);
</script>

<Popover.Root>
    <Popover.Trigger
        class={cn(
            buttonVariants({
                variant: 'outline',
                class: 'w-[280px] justify-start text-left font-normal',
            }),
            !value && 'text-muted-foreground'
        )}
    >
        <CalendarIcon />
        {value ? df.format(value.toDate(getLocalTimeZone())) : 'Pick a date'}
    </Popover.Trigger>
    <Popover.Content bind:ref={contentRef} class="w-auto p-0">
        <Calendar type="single" bind:value />
    </Popover.Content>
</Popover.Root>
