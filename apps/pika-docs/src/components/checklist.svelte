<script lang="ts">
    export let content: string = '';

    interface ChecklistItem {
        checked: boolean;
        text: string;
    }

    // Parse markdown checklist items
    function parseChecklist(rawContent: string): ChecklistItem[] {
        const lines = rawContent.trim().split('\n');
        const items: ChecklistItem[] = [];

        for (const line of lines) {
            const trimmedLine = line.trim();
            // Match patterns like "- [ ] text" or "- [x] text"
            const match = trimmedLine.match(/^-\s*\[([ xX])\]\s*(.+)$/);
            if (match) {
                items.push({
                    checked: match[1].toLowerCase() === 'x',
                    text: match[2].trim()
                });
            }
        }

        return items;
    }

    $: items = parseChecklist(content);
</script>

<div class="checklist">
    {#each items as item}
        <div class="checklist-item">
            <div class="checkbox-wrapper">
                {#if item.checked}
                    <svg class="checkbox checked" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect width="16" height="16" rx="3" class="checkbox-bg" />
                        <path d="M12 5L6.5 10.5L4 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="checkmark" />
                    </svg>
                {:else}
                    <svg class="checkbox unchecked" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect width="16" height="16" rx="3" class="checkbox-bg" />
                    </svg>
                {/if}
            </div>
            <span class="checklist-text" class:completed={item.checked}>
                {item.text}
            </span>
        </div>
    {/each}
</div>

<style>
    .checklist {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem;
        background: var(--sl-color-gray-6);
        border-radius: 0.5rem;
        border: 1px solid var(--sl-color-gray-5);
        margin: 1.5rem 0;
    }

    .checklist-item {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
    }

    .checkbox-wrapper {
        flex-shrink: 0;
        padding-top: 0.125rem;
    }

    .checkbox {
        width: 1.25rem;
        height: 1.25rem;
        display: block;
    }

    .checkbox.unchecked .checkbox-bg {
        fill: var(--sl-color-gray-5);
        stroke: var(--sl-color-gray-4);
        stroke-width: 1;
    }

    .checkbox.checked .checkbox-bg {
        fill: var(--sl-color-accent);
    }

    .checkbox.checked .checkmark {
        color: var(--sl-color-white);
    }

    .checklist-text {
        flex: 1;
        line-height: 1.6;
        color: var(--sl-color-white);
        font-size: 0.9375rem;
    }

    .checklist-text.completed {
        color: var(--sl-color-gray-3);
        text-decoration: line-through;
    }

    @media (prefers-color-scheme: light) {
        .checklist {
            background: var(--sl-color-gray-7);
        }

        .checklist-text {
            color: var(--sl-color-gray-1);
        }

        .checklist-text.completed {
            color: var(--sl-color-gray-4);
        }

        .checkbox.unchecked .checkbox-bg {
            fill: var(--sl-color-white);
            stroke: var(--sl-color-gray-4);
        }
    }
</style>
