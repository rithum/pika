<script lang="ts">
    import { cn } from '../utils.js';
    import Loader2Icon from '$icons/lucide/loader-circle';
    import type { ComponentProps } from 'svelte';
    type Props = ComponentProps<typeof Loader2Icon>;
    let { class: className, ...restProps }: Props = $props();
</script>

<Loader2Icon role="status" aria-label="Loading" class={cn('size-4 animate-spin', className)} {...restProps} />
