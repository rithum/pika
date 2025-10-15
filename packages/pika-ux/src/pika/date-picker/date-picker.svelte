<script lang="ts">
    import { buttonVariants } from '../../shadcn/button/index.js';
    import { Calendar } from '../../shadcn/calendar/index.js';
    import * as Popover from '../../shadcn/popover/index.js';
    import { cn } from '../../shadcn/utils.js';
    import { DateFormatter, type DateValue, getLocalTimeZone } from '@internationalized/date';
    import CalendarIcon from '$icons/lucide/calendar';

    const df = new DateFormatter('en-US', {
        dateStyle: 'long'
    });

    let value = $state<DateValue | undefined>();
    let contentRef = $state<HTMLElement | null>(null);
</script>

<Popover.Root>
    <Popover.Trigger
        class={cn(
            buttonVariants({
                variant: 'outline',
                class: 'w-[280px] justify-start text-left font-normal'
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
