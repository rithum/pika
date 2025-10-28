<script lang="ts">
    import X from '$icons/lucide/x';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import type { ContextSource } from 'pika-shared/types/chatbot/chatbot-types';
    import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';

    interface Props {
        context: ContextSource;
        onRemove?: () => void;
        onClick?: () => void;
    }

    let { context, onRemove, onClick }: Props = $props();

    let hovering = $state(false);
    let iconSvg = $state<string | undefined>();

    // Create tooltip text - use the most descriptive field available, only include up to 10 characters of the description
    // and only include the ... if it was longer than 10 characters
    let tooltipText = $derived(
        'Context: ' +
            (context.description.length > 20 ? context.description.substring(0, 20) + '...' : context.description)
    );

    // Fetch icon if lucideIconName is provided
    $effect(() => {
        if (context.lucideIconName) {
            getIconSvg(context.lucideIconName)
                .then((svg) => {
                    iconSvg = svg;
                })
                .catch((error) => {
                    console.error('Failed to fetch icon:', error);
                    iconSvg = undefined;
                });
        } else {
            iconSvg = undefined;
        }
    });

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' || event.key === ' ') {
            if (onClick) {
                event.preventDefault();
                onClick();
            }
        }
    }
</script>

<TooltipPlus tooltip={tooltipText} delayDuration={500}>
    <div
        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-gray-600 text-[0.6875rem] leading-tight font-medium cursor-default transition-all duration-150 whitespace-nowrap max-w-[200px] dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
        class:cursor-pointer={!!onClick}
        class:hover:bg-gray-100={!!onClick}
        class:hover:border-gray-300={!!onClick}
        class:dark:hover:bg-gray-700={!!onClick}
        class:dark:hover:border-gray-600={!!onClick}
        onmouseenter={() => (hovering = true)}
        onmouseleave={() => (hovering = false)}
        onkeydown={handleKeydown}
        onclick={(e) => {
            if (onClick) {
                e.stopPropagation();
                onClick();
            }
        }}
        role="button"
        tabindex="0"
    >
        <span class="inline-flex items-center gap-1 overflow-hidden">
            {#if onRemove && hovering}
                <!-- Replace icon with X button on hover -->
                <button
                    class="flex items-center justify-center w-3.5 h-3.5 rounded bg-transparent border-0 text-gray-500 cursor-pointer transition-all duration-150 shrink-0 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    onclick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    type="button"
                    aria-label="Remove {context.title}"
                >
                    <X style="width: 14px; height: 14px;" />
                </button>
            {:else if iconSvg}
                <span class="[&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:shrink-0 [&>svg]:opacity-70">{@html iconSvg}</span>
            {:else}
                <span class="w-3.5 h-3.5 shrink-0"></span>
            {/if}
            <span class="overflow-hidden text-ellipsis whitespace-nowrap">{context.title}</span>
        </span>
    </div>
</TooltipPlus>
