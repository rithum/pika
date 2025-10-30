<!--
Widget Action Button Component
Renders a single action button with icon and tooltip for widget chrome.
Used in spotlight, canvas, and dialog contexts.
-->
<script lang="ts">
    import { Button } from 'pika-ux/shadcn/button';
    import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';
    import type { WidgetAction } from 'pika-shared/types/chatbot/webcomp-types';
    import type { ChatAppState } from '../chat-app.state.svelte';
    import { getContext } from 'svelte';

    interface Props {
        action: WidgetAction;
        /** Widget instance ID - required to provide context to the callback */
        instanceId: string;
        /** Display style - 'icon-only' for toolbar, 'with-text' for dialog footer */
        variant?: 'icon-only' | 'with-text';
        /** Button size */
        size?: 'sm' | 'default' | 'lg';
        /** Button styling variant */
        buttonVariant?: 'ghost' | 'outline' | 'default' | 'secondary';
        /** Additional CSS classes */
        class?: string;
    }

    let {
        action,
        instanceId,
        variant = 'icon-only',
        size = 'sm',
        buttonVariant = 'ghost',
        class: className = '',
    }: Props = $props();

    const chat = getContext<ChatAppState>('chatAppState');

    async function handleClick() {
        try {
            // Get the widget instance and context
            const instance = chat.getWidgetInstance(instanceId);
            const context = chat.getWidgetContext(instanceId);

            if (!instance || !context) {
                throw new Error(
                    `[WidgetActionButton] Cannot execute action "${action.id}": widget instance or context not found`
                );
            }

            // Call the action callback with full context
            await action.callback({
                element: instance.element,
                instanceId,
                context,
            });
        } catch (error) {
            console.error(`[WidgetActionButton] Error executing action "${action.id}":`, error);
            chat.showToast('An unexpected error occurred.  Please try again.', {
                type: 'error',
            });
        }
    }
</script>

{#if variant === 'icon-only'}
    <!-- Icon-only button for toolbars (spotlight, canvas) -->
    <TooltipPlus tooltip={action.title}>
        <Button
            variant={buttonVariant}
            size="icon"
            disabled={action.disabled}
            onclick={handleClick}
            class="p-0 w-5.5 h-5.5 {className ?? ''}"
            aria-label={action.title}
        >
            <span class="icon-wrapper inline-block h-3.5 w-3.5">
                {@html action.iconSvg}
            </span>
        </Button>
    </TooltipPlus>
{:else}
    <!-- Button with icon + text for dialog footers -->
    <Button
        variant={action.primary ? 'default' : 'secondary'}
        {size}
        disabled={action.disabled}
        onclick={handleClick}
        class={className ?? ''}
    >
        <span class="icon-wrapper inline-block mr-2 h-3.5 w-3.5">
            {@html action.iconSvg}
        </span>
        {action.title}
    </Button>
{/if}

<style>
    .icon-wrapper :global(svg) {
        width: 100% !important;
        height: 100% !important;
        display: block;
    }
</style>
