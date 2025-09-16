<script lang="ts">
    import { Check, Copy } from '$icons/lucide';
    import { Button } from '$ui/shadcn/button';
    import { tick, type Snippet } from 'svelte';

    interface Props {
        children?: Snippet<[]>;
        value?: string;
        /** When embedded in other elements, like a table, we don't want borders */
        embedded?: boolean;

        /** Truncate the value after this many characters showing a ...*/
        truncateAfter?: number;

        /** If true, the text will be shown as a link */
        showTextAsLink?: boolean;

        /** If showTextAsLink is true, this function will be called when the link is clicked */
        linkCallbackFn?: () => void;

        /** When provided, this is the title of the button */
        title?: string;
    }

    const {
        children,
        value: propValue,
        embedded = false,
        truncateAfter = 0,
        showTextAsLink = false,
        linkCallbackFn,
        title,
    }: Props = $props();

    let hiddenRef = $state<HTMLElement>() as HTMLElement;
    let value: string | undefined = $state(undefined);
    let truncatedValue: string | undefined = $state(undefined);
    let showCheckmark = $state(false);

    let buttonTitle = $derived.by(() => {
        const t = title;
        const tv = truncatedValue;
        const v = value;
        if (t) {
            return t;
        } else if (tv) {
            return tv;
        } else if (v) {
            return v;
        } else {
            return 'Copy';
        }
    });

    $effect(() => {
        if (propValue !== undefined) {
            value = propValue;
            updateTruncatedValue();
        } else if (children) {
            // Fall back to extracting from children
            extractValue().catch((e) => {
                throw new Error(
                    `Failed to extract value: ${e instanceof Error ? e.message + ' ' + e.stack : String(e)}`
                );
            });
        }
    });

    async function extractValue() {
        // We need to wait for the DOM to update
        await tick();

        if (!hiddenRef) return;

        // Extract text content
        value = (hiddenRef.textContent || '').trim();
        updateTruncatedValue();
    }

    function updateTruncatedValue() {
        if (!value) {
            throw new Error('Did not find any text in the hidden container of ValueToCopy');
        }
        if (truncateAfter && truncateAfter > 0 && value.length > truncateAfter) {
            // Check if there are enough characters to make the "start...end" format worthwhile
            // We need at least truncateAfter + 7 characters (3 for "..." + 4 for end)
            // to make the start...end format meaningful
            const minLengthForStartEnd = truncateAfter + 7;

            if (value.length >= minLengthForStartEnd) {
                // Use "start...end" format
                truncatedValue = `${value.slice(0, truncateAfter)}...${value.slice(-4)}`;
            } else {
                // Just truncate with "..." at the end
                truncatedValue = `${value.slice(0, truncateAfter)}...`;
            }
        }
    }

    function copy() {
        if (!value) {
            console.error('No value to copy');
            return;
        }

        if (!navigator || !navigator.clipboard) {
            console.error('Clipboard API not supported');
            return;
        }

        try {
            navigator.clipboard.writeText(value);
            showCheckmark = true;
            setTimeout(() => {
                showCheckmark = false;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy value:', err);
            showCheckmark = false;
        }
    }
</script>

{#if !propValue}
    <pre
        class="hidden-container"
        bind:this={hiddenRef}
        style="display: none; position: absolute; left: -9999px;">{#if children}{@render children()}{/if}</pre>
{/if}

<span class="inline-flex w-fit items-center {embedded ? '' : 'border border-gray-200 rounded-sm'}">
    {#if showTextAsLink}
        <Button class="p-0" variant="link" onclick={() => linkCallbackFn?.()}>{buttonTitle}</Button>
    {:else}
        <span class={embedded ? '' : 'border-r border-gray-200 px-2'}>{buttonTitle}</span>
    {/if}
    <span class="w-6 h-6 flex items-center justify-center">
        {#if showCheckmark}
            <Check class="w-3.5 h-3.5 text-green-500" />
        {:else}
            <Button
                variant="ghost"
                class="h-full w-full min-h-0 p-0 ml-1 rounded-none hover:border-blue-100 hover:border hover:rounded-sm"
                onclick={copy}
                disabled={!value}
            >
                <Copy class="w-3.5 h-3.5 text-gray-400" />
            </Button>
        {/if}
    </span>
</span>
