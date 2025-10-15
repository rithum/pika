<!--
Widget Action Menu Component
Renders a dropdown menu with multiple widget actions.
Used when there are 2+ actions in spotlight or overflow actions in canvas.
-->
<script lang="ts">
    import { Button } from 'pika-ux/shadcn/button';
    import * as DropdownMenu from 'pika-ux/shadcn/dropdown-menu';
    import type { WidgetAction } from 'pika-shared/types/chatbot/chatbot-types';
    import EllipsisVertical from '$icons/lucide/ellipsis-vertical';

    interface Props {
        actions: WidgetAction[];
        /** Button size */
        size?: 'sm' | 'default';
        /** Additional CSS classes */
        class?: string;
    }

    let { actions, size = 'sm', class: className = '' }: Props = $props();

    async function handleActionClick(action: WidgetAction) {
        if (action.disabled) return;

        try {
            await action.callback();
        } catch (error) {
            console.error(`[WidgetActionMenu] Error executing action "${action.id}":`, error);
        }
    }
</script>

<DropdownMenu.Root>
    <DropdownMenu.Trigger>
        <Button variant="ghost" size="icon" class="p-0 w-5.5 h-5.5 {className ?? ''}" aria-label="Widget actions">
            <EllipsisVertical class="h-4 w-4" />
        </Button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Content>
        <DropdownMenu.Group>
            {#each actions as action (action.id)}
                <DropdownMenu.Item disabled={action.disabled} onclick={() => handleActionClick(action)}>
                    <span class="inline-block mr-2 h-4 w-4">
                        {@html action.iconSvg}
                    </span>
                    <span>{action.title}</span>
                </DropdownMenu.Item>
            {/each}
        </DropdownMenu.Group>
    </DropdownMenu.Content>
</DropdownMenu.Root>
