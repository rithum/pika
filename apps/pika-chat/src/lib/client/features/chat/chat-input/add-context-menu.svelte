<script lang="ts">
    import Plus from '$icons/lucide/plus';
    import * as DropdownMenu from 'pika-ux/shadcn/dropdown-menu/index';
    import { Button } from 'pika-ux/shadcn/button';
    import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import type { WidgetContextSourceDef } from 'pika-shared/types/chatbot/chatbot-types';

    interface Props {
        availableContexts: WidgetContextSourceDef[];
        onAdd: (context: WidgetContextSourceDef) => void;
        disabled?: boolean;
    }

    let { availableContexts, onAdd, disabled = false }: Props = $props();

    let iconCache = $state<Map<string, string>>(new Map());

    // Pre-fetch icons for all available contexts
    $effect(() => {
        for (const context of availableContexts) {
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
</script>

<DropdownMenu.Root>
    <DropdownMenu.Trigger>
        <TooltipPlus tooltip="Add Context">
            <Button variant="outline" class="w-9 h-9" {disabled}>
                <Plus style="width: 1.3rem; height: 1.3rem;" />
            </Button>
        </TooltipPlus>
    </DropdownMenu.Trigger>
    <DropdownMenu.Content class="w-[320px] max-h-[500px] overflow-y-auto">
        <DropdownMenu.Label>Add Context</DropdownMenu.Label>
        <DropdownMenu.Separator />
        {#if availableContexts.length === 0}
            <div class="px-2 py-6 text-center text-sm text-gray-500">No additional context available</div>
        {:else}
            {#each availableContexts as context (context.sourceId)}
                <DropdownMenu.Item class="flex items-start gap-3 cursor-pointer" onSelect={() => onAdd(context)}>
                    {#if iconCache.has(context.sourceId)}
                        <span class="[&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:opacity-70 flex-shrink-0 mt-0.5"
                            >{@html iconCache.get(context.sourceId)}</span
                        >
                    {:else}
                        <span class="w-[18px] h-[18px] flex-shrink-0 mt-0.5"></span>
                    {/if}
                    <div class="flex-1 min-w-0">
                        <div class="font-medium text-sm">{context.title}</div>
                        {#if context.description}
                            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                {context.description}
                            </div>
                        {/if}
                    </div>
                </DropdownMenu.Item>
            {/each}
        {/if}
    </DropdownMenu.Content>
</DropdownMenu.Root>
