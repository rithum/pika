<script lang="ts">
    import { cn } from '../../shadcn/utils.js';
    import { Tabs as TabsPrimitive } from 'bits-ui';

    let { ref = $bindable(null), class: className, value, ...restProps }: TabsPrimitive.TriggerProps = $props();
</script>

<!--
    Uses explicit CSS for styling because Tailwind v4's @tailwindcss/vite plugin only generates
    CSS for classes found in the consuming app's src/ directory. Classes unique to external
    packages (like this one) won't have CSS generated unless they're also used in the main app.
    
    This means Tailwind utility classes from this component only work if the same class is
    already used somewhere in apps/pika-chat/src/. The CSS block below ensures consistent
    styling regardless of what classes the consuming app happens to use.
-->

<TabsPrimitive.Trigger
    bind:ref
    class={cn(
        'pika-tab-trigger ring-offset-background focus-visible:ring-ring inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        className
    )}
    {value}
    {...restProps}
/>

<style>
    :global(.pika-tab-trigger[data-state='active']) {
        background-color: var(--card);
        color: var(--foreground);
        box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
        border-bottom: 2px solid var(--primary);
    }

    :global(.pika-tab-trigger[data-state='inactive']) {
        color: var(--muted-foreground);
    }

    :global(.pika-tab-trigger[data-state='inactive']:hover) {
        color: var(--primary);
        background-color: color-mix(in oklch, var(--foreground) 5%, transparent);
    }
</style>
