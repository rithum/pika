<script lang="ts">
    import { cn } from '../../shadcn/utils.js';
    import { Tabs as TabsPrimitive } from 'bits-ui';

    let { ref = $bindable(null), class: className, value, ...restProps }: TabsPrimitive.TriggerProps = $props();
</script>

<!-- 
    Modified from standard shadcn tabs trigger component:
    Added 'data-[state=inactive]:hover:text-primary' to provide visual feedback 
    when hovering over unselected tabs. This changes the text color to the theme's 
    primary color on hover for better UX, indicating that the tabs are clickable.
-->

<TabsPrimitive.Trigger
    bind:ref
    class={cn(
        'ring-offset-background focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=inactive]:hover:text-primary inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow',
        className
    )}
    {value}
    {...restProps}
/>
