<script lang="ts" module>
    import { type VariantProps, tv } from 'tailwind-variants';
    export const pikaBadgeVariants = tv({
        base: 'focus:ring-ring inline-flex select-none items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground hover:bg-primary/80 border-transparent shadow',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent',
                destructive:
                    'bg-destructive text-destructive-foreground hover:bg-destructive/80 border-transparent shadow',
                success: 'bg-green-700 text-white hover:bg-green-700 border-transparent shadow',
                outline: 'text-foreground',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    });

    export type PikaBadgeVariant = VariantProps<typeof pikaBadgeVariants>['variant'];
</script>

<script lang="ts">
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import { cn } from '$ui/shadcn/utils.js';
    import type { WithElementRef } from 'bits-ui';
    import type { HTMLAnchorAttributes } from 'svelte/elements';

    let {
        ref = $bindable(null),
        href,
        class: className,
        variant = 'default',
        children,
        help,
        helpStyles,
        ...restProps
    }: WithElementRef<HTMLAnchorAttributes> & {
        variant?: PikaBadgeVariant;
        help?: string;
        helpStyles?: string;
    } = $props();

    // Split help text by line feeds to create paragraphs
    const helpParagraphs = $derived(help ? help.split('\n') : []);
</script>

<svelte:element
    this={href ? 'a' : 'span'}
    bind:this={ref}
    {href}
    class={cn(pikaBadgeVariants({ variant }), help ? 'space-x-1' : '', className)}
    {...restProps}
>
    {@render children?.()}

    {#if help}
        <div class="ml-2 items-center flex">
            <PopupHelp popoverClasses={`max-w-[400px] ${helpStyles ? helpStyles : ''}`}>
                <div class="text-xs space-y-2 text-muted-foreground">
                    {#each helpParagraphs as paragraph}
                        <p>{paragraph}</p>
                    {/each}
                </div>
            </PopupHelp>
        </div>
    {/if}
</svelte:element>
