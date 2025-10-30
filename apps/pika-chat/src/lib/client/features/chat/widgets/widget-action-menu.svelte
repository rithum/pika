<!--
Widget Action Menu Component
Renders a dropdown menu with multiple widget actions.
Used when there are 2+ actions in spotlight or overflow actions in canvas.
-->
<script lang="ts">
    import { Button } from 'pika-ux/shadcn/button';
    import * as DropdownMenu from 'pika-ux/shadcn/dropdown-menu';
    import type { WidgetAction } from 'pika-shared/types/chatbot/webcomp-types';
    import EllipsisVertical from '$icons/lucide/ellipsis-vertical';
    import type { ChatAppState } from '../chat-app.state.svelte';
    import { getContext } from 'svelte';

    interface Props {
        actions: WidgetAction[];
        /** Widget instance ID - required to provide context to the callbacks */
        instanceId: string;
        /** Button size */
        size?: 'sm' | 'default';
        /** Additional CSS classes */
        class?: string;
    }

    let { actions, instanceId, size = 'sm', class: className = '' }: Props = $props();

    const chat = getContext<ChatAppState>('chatAppState');

    async function handleActionClick(action: WidgetAction) {
        if (action.disabled) return;

        try {
            // Get the widget instance and context
            const instance = chat.getWidgetInstance(instanceId);
            const context = chat.getWidgetContext(instanceId);

            if (!instance || !context) {
                throw new Error(
                    `[WidgetActionMenu] Cannot execute action "${action.id}": widget instance or context not found`
                );
            }

            // Call the action callback with full context
            await action.callback({
                element: instance.element,
                instanceId,
                context,
            });
        } catch (error) {
            console.error(`[WidgetActionMenu] Error executing action "${action.id}":`, error);
            chat.showToast('An unexpected error occurred.  Please try again.', {
                type: 'error',
            });
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
