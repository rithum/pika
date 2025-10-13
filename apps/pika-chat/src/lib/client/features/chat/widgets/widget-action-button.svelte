<!--
Widget Action Button Component
Renders a single action button with icon and tooltip for widget chrome.
Used in spotlight, canvas, and dialog contexts.
-->
<script lang="ts">
    import { Button } from 'pika-ux/shadcn/button';
    import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';
    import type { WidgetAction } from 'pika-shared/types/chatbot/chatbot-types';

    interface Props {
        action: WidgetAction;
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
        variant = 'icon-only',
        size = 'sm',
        buttonVariant = 'ghost',
        class: className = '',
    }: Props = $props();

    async function handleClick() {
        try {
            await action.callback();
        } catch (error) {
            console.error(`[WidgetActionButton] Error executing action "${action.id}":`, error);
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
            class={className}
            aria-label={action.title}
        >
            <span class="inline-block h-4 w-4">
                {@html action.iconSvg}
            </span>
        </Button>
    </TooltipPlus>
{:else}
    <!-- Button with icon + text for dialog footers -->
    <Button
        variant={action.primary ? 'default' : buttonVariant}
        {size}
        disabled={action.disabled}
        onclick={handleClick}
        class={className}
    >
        <span class="inline-block mr-2 h-4 w-4">
            {@html action.iconSvg}
        </span>
        {action.title}
    </Button>
{/if}
