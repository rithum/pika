<script lang="ts">
    import { X } from '$icons/lucide';
    import type { Snippet } from 'svelte';

    interface Props {
        children: Snippet;
        onclick?: () => void;
        showHover?: boolean;
        ondelete?: () => void;
        disabled?: boolean;
        deleteLabel?: string;
        size?: 'sm' | 'md' | 'lg';
    }

    let {
        children,
        ondelete,
        showHover = true,
        onclick,
        disabled = false,
        deleteLabel = 'Remove item',
        size = 'md',
    }: Props = $props();

    function handleDelete() {
        if (!disabled && ondelete) {
            ondelete();
        }
    }

    function handleClick() {
        if (!disabled && onclick) {
            onclick();
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (!disabled && onclick && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onclick();
        }
    }

    // Shared classes for both interactive and non-interactive states
    const baseClasses =
        'inline-flex items-center gap-1 px-3 py-1 rounded-full border border-gray-200 bg-white text-sm font-medium';

    // Dynamic classes that apply to both states
    const dynamicClasses = $derived(
        [
            size === 'sm' ? 'text-xs' : '',
            size === 'md' ? 'text-sm' : '',
            size === 'lg' ? 'text-base' : '',
            disabled ? 'opacity-50 cursor-not-allowed' : '',
        ]
            .filter(Boolean)
            .join(' ')
    );

    // Interactive-specific classes
    const interactiveClasses = $derived((onclick || showHover) && !disabled ? 'hover:bg-gray-50 cursor-pointer' : '');
</script>

{#snippet chipContent()}
    {@render children()}
    {#if ondelete}
        <button
            type="button"
            class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
            class:hover:bg-gray-100={!disabled}
            class:cursor-not-allowed={disabled}
            onclick={handleDelete}
            {disabled}
            aria-label={deleteLabel}
        >
            <X class="w-3 h-3" />
        </button>
    {/if}
{/snippet}

{#if onclick}
    <div
        class="{baseClasses} {dynamicClasses} {interactiveClasses}"
        onclick={handleClick}
        onkeydown={handleKeydown}
        role="button"
        tabindex={disabled ? -1 : 0}
    >
        {@render chipContent()}
    </div>
{:else}
    <div class="{baseClasses} {dynamicClasses} {interactiveClasses}">
        {@render chipContent()}
    </div>
{/if}
