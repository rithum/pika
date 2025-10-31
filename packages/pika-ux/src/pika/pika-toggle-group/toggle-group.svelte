<script lang="ts" module>
    import { getContext, setContext } from 'svelte';
    
    type ToggleGroupContext = {
        type: 'single' | 'multiple';
        getValue: () => string | string[];
        toggle: (itemValue: string) => void;
        buttonWidth?: string;
    };
    
    export function setToggleGroupCtx(ctx: ToggleGroupContext) {
        setContext('pika-toggle-group', ctx);
    }

    export function getToggleGroupCtx() {
        return getContext<ToggleGroupContext>('pika-toggle-group');
    }
</script>

<script lang="ts">
    import { cn } from '../../shadcn/utils.js';
    import type { Snippet } from 'svelte';

    type Props = {
        value?: string | string[];
        type?: 'single' | 'multiple';
        buttonWidth?: string;
        class?: string;
        variant?: 'default' | 'outline';
        children?: Snippet;
    };

    let {
        type = 'single',
        value = $bindable(type === 'single' ? '' : []),
        buttonWidth,
        class: className,
        variant = 'outline',
        children
    }: Props = $props();

    function toggle(itemValue: string) {
        if (type === 'single') {
            value = value === itemValue ? '' : itemValue;
        } else {
            const arr = Array.isArray(value) ? value : [];
            const index = arr.indexOf(itemValue);
            if (index > -1) {
                value = arr.filter(v => v !== itemValue);
            } else {
                value = [...arr, itemValue];
            }
        }
    }

    setToggleGroupCtx({
        type,
        getValue: () => value,
        toggle,
        buttonWidth
    });
</script>

<div 
    class={cn(
        'flex w-fit items-center',
        className
    )}
    role="group"
>
    {@render children?.()}
</div>
