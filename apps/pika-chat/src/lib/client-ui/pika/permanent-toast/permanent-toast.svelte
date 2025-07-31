<script lang="ts">
    import { CircleAlert, Info, TriangleAlert } from '$icons/lucide';
    import type { Snippet } from 'svelte';

    interface Props {
        type: 'info' | 'warning' | 'error';
        children?: Snippet<[]>;
    }

    const { type, children }: Props = $props();

    const typeConfig = {
        info: {
            icon: Info,
            bgColor: 'bg-blue-50',
            iconColor: 'text-blue-500',
            borderColor: 'border-blue-100',
        },
        warning: {
            icon: TriangleAlert,
            bgColor: 'bg-yellow-50',
            iconColor: 'text-yellow-500',
            borderColor: 'border-yellow-100',
        },
        error: {
            icon: CircleAlert,
            bgColor: 'bg-red-50',
            iconColor: 'text-red-500',
            borderColor: 'border-red-100',
        },
    } as const;

    const config = typeConfig[type];
</script>

<div class={`py-2 ${config.bgColor} border-b ${config.borderColor}`}>
    <div class="ml-4 flex items-center space-x-3">
        {#if config.icon}
            <config.icon class="w-5 h-5 {config.iconColor}" />
        {/if}
        <div class="text-sm text-gray-700">
            {@render children?.()}
        </div>
    </div>
</div>
