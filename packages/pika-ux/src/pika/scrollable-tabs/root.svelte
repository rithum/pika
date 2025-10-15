<script lang="ts">
    import { setScrollableTabsContext } from './context.svelte.js';
    import type { Snippet } from 'svelte';
    import { cn } from '../../shadcn/utils.js';

    interface Props {
        value: string;
        onValueChange?: (value: string) => void;
        onClose?: (value: string) => void;
        onPin?: (value: string) => void;
        onUnpin?: (value: string) => void;
        class?: string;
        children: Snippet;
    }

    let { value = $bindable(), onValueChange, onClose, onPin, onUnpin, class: className, children }: Props = $props();

    function handleValueChange(newValue: string) {
        value = newValue;
        onValueChange?.(newValue);
    }

    setScrollableTabsContext({
        getValue: () => value,
        onValueChange: handleValueChange,
        onClose,
        onPin,
        onUnpin
    });
</script>

<div class={cn('w-full', className)}>
    {@render children()}
</div>
