<script lang="ts">
    import X from '$icons/lucide/x';
    import * as DropdownMenu from 'pika-ux/shadcn/dropdown-menu/index';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import type { ContextSource } from 'pika-shared/types/chatbot/chatbot-types';

    interface Props {
        contexts: ContextSource[];
        onRemove: (sourceId: string) => void;
        children: any;
    }

    let { contexts, onRemove, children }: Props = $props();

    let iconCache = $state<Map<string, string>>(new Map());
    let open = $state(false);
    let hoverTimeout: ReturnType<typeof setTimeout> | undefined;

    // Pre-fetch icons for all contexts
    $effect(() => {
        for (const context of contexts) {
            if (context.lucideIconName && !iconCache.has(context.sourceId)) {
                getIconSvg(context.lucideIconName)
                    .then((svg) => {
                        iconCache.set(context.sourceId, svg);
                        iconCache = new Map(iconCache); // Trigger reactivity
                    })
                    .catch((error) => {
                        console.error('Failed to fetch icon:', error);
                    });
            }
        }
    });

    function handleMouseEnter() {
        // Set timeout to open dropdown after 2 seconds
        hoverTimeout = setTimeout(() => {
            open = true;
        }, 1500);
    }

    function handleMouseLeave() {
        // Clear timeout if user stops hovering before 2 seconds
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = undefined;
        }
    }
</script>

<DropdownMenu.Root bind:open>
    <DropdownMenu.Trigger>
        <div
            onmouseenter={handleMouseEnter}
            onmouseleave={handleMouseLeave}
            role="button"
            tabindex="0"
            aria-label="Auto-added contexts"
        >
            {@render children()}
        </div>
    </DropdownMenu.Trigger>
    <DropdownMenu.Content class="w-[280px] max-h-[400px] overflow-y-auto">
        <DropdownMenu.Label>Auto-Added Context</DropdownMenu.Label>
        <DropdownMenu.Separator />
        {#if contexts.length === 0}
            <div class="px-2 py-6 text-center text-sm text-gray-500">No auto-added context</div>
        {:else}
            {#each contexts as context (context.sourceId)}
                <DropdownMenu.Item
                    class="flex items-center justify-between gap-2 cursor-pointer"
                    onSelect={(e) => e.preventDefault()}
                >
                    <div class="flex items-center gap-2 flex-1 min-w-0">
                        {#if iconCache.has(context.sourceId)}
                            <span class="[&>svg]:w-4 [&>svg]:h-4 [&>svg]:opacity-70 flex-shrink-0"
                                >{@html iconCache.get(context.sourceId)}</span
                            >
                        {:else}
                            <span class="w-4 h-4 flex-shrink-0"></span>
                        {/if}
                        <div class="flex-1 min-w-0">
                            <div class="font-medium text-sm truncate">{context.title}</div>
                            {#if context.description}
                                <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {context.description}
                                </div>
                            {/if}
                        </div>
                    </div>
                    <button
                        class="flex-shrink-0 p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                        onclick={(e) => {
                            e.stopPropagation();
                            onRemove(context.sourceId);
                        }}
                        type="button"
                        aria-label="Remove {context.title}"
                    >
                        <X style="width: 14px; height: 14px;" />
                    </button>
                </DropdownMenu.Item>
            {/each}
        {/if}
    </DropdownMenu.Content>
</DropdownMenu.Root>
