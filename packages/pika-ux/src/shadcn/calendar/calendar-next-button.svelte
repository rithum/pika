<script lang="ts">
    import { Calendar as CalendarPrimitive } from 'bits-ui';
    import ChevronRight from '$icons/lucide/chevron-right';
    import { buttonVariants } from '../button/index.js';
    import { cn } from '../utils.js';

    let { ref = $bindable(null), class: className, children, ...restProps }: CalendarPrimitive.NextButtonProps = $props();
</script>

{#snippet Fallback()}
    <ChevronRight />
{/snippet}

<CalendarPrimitive.NextButton
    bind:ref
    class={cn(buttonVariants({ variant: 'outline' }), 'size-7 bg-transparent p-0 opacity-50 hover:opacity-100', className)}
    {...restProps}
    children={children || Fallback}
/>
