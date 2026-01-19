<script lang="ts">
    import CircleAlert from '$icons/lucide/circle-alert';
    import Info from '$icons/lucide/info';
    import TriangleAlert from '$icons/lucide/triangle-alert';
    import type { Snippet } from 'svelte';

    interface Props {
        type: 'info' | 'warning' | 'error';
        children?: Snippet<[]>;
    }

    const { type, children }: Props = $props();

    const typeConfig = {
        info: {
            icon: Info,
            bgColor: 'bg-info-bg',
            iconColor: 'text-info',
            borderColor: 'border-info/20'
        },
        warning: {
            icon: TriangleAlert,
            bgColor: 'bg-warning-bg',
            iconColor: 'text-warning',
            borderColor: 'border-warning/20'
        },
        error: {
            icon: CircleAlert,
            bgColor: 'bg-danger-bg',
            iconColor: 'text-destructive',
            borderColor: 'border-destructive/20'
        }
    } as const;

    const config = typeConfig[type];
</script>

<div class={`py-2 ${config.bgColor} border-b ${config.borderColor}`}>
    <div class="ml-4 flex items-center space-x-3">
        {#if config.icon}
            <config.icon class="w-5 h-5 {config.iconColor}" />
        {/if}
        <div class="text-sm text-foreground">
            {@render children?.()}
        </div>
    </div>
</div>
