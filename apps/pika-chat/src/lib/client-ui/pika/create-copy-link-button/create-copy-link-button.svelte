<script lang="ts">
    import { Check, Copy, Link, Loader } from '$icons/lucide';
    import { Button } from '$ui/shadcn/button';

    interface Props {
        /** If this doesn't exist, we assume that we need to create the link */
        linkUrl?: string;

        /** If not provided, will show Click button to create link */
        valueToShowBeforeLinkIsCreated?: string;

        /** When the user clicks the create link button, this function will be called */
        createLinkFn: () => void;

        /** If true, will show a loader and the button will be disabled */
        creatingLink: boolean;

        /** When set, will disable the create link button */
        disableCreateLinkButton?: boolean;

        /** Truncate the linkUrl or valueToShowBeforeLinkIsCreated after this many characters showing a ...*/
        truncateAfter?: number;

        /** Defaults to 100px */
        width?: number;
    }

    const {
        linkUrl,
        valueToShowBeforeLinkIsCreated,
        createLinkFn,
        creatingLink,
        disableCreateLinkButton,
        truncateAfter = 0,
        width = 100,
    }: Props = $props();

    const height = 50;

    let showCheckmark = $state(false);
    let value = $derived.by(() => {
        if (linkUrl) {
            return linkUrl;
        } else {
            return valueToShowBeforeLinkIsCreated ?? 'Click button to create link';
        }
    });
    let truncatedValue = $derived.by(() => {
        let result = value;
        if (truncateAfter && truncateAfter > 0 && result.length > truncateAfter) {
            result = `${result.slice(0, truncateAfter)}...`;
        }
        return result;
    });

    function copy() {
        if (!linkUrl) {
            console.error('No linkUrl to copy');
            return;
        }

        if (!navigator || !navigator.clipboard) {
            console.error('Clipboard API not supported');
            return;
        }

        try {
            navigator.clipboard.writeText(linkUrl);
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

<div class="flex items-center w-[{width}px] h-[{height}px] border border-gray-200 rounded-xl">
    <div class="flex-1 p-4 {!linkUrl ? 'text-gray-400' : ''}">{truncatedValue}</div>
    <div class="w-[150px] h-[{height}px] flex items-center justify-center mr-4">
        {#if showCheckmark}
            <Check class="w-3.5 h-3.5 text-green-600 mr-2" /> <span class="text-green-600">Copied!</span>
        {:else}
            <Button
                class="h-[{height}px] w-[150px] ml-1"
                onclick={() => {
                    if (linkUrl) {
                        copy();
                    } else {
                        createLinkFn();
                    }
                }}
                disabled={creatingLink || (disableCreateLinkButton && !linkUrl)}
            >
                {#if creatingLink}
                    <Loader class="w-3.5 h-3.5 animate-spin white" /> Creating...
                {:else if linkUrl}
                    <Copy class="w-3.5 h-3.5 white" /> Copy link
                {:else}
                    <Link class="w-3.5 h-3.5 white" /> Create link
                {/if}
            </Button>
        {/if}
    </div>
</div>

<!-- <div class="flex h-[{height}px] w-[{width}px] items-center {'border border-gray-200 rounded-sm'}">
    
    <div class={'border-r border-gray-200 px-2 h-[100px] flex items-center flex-1'}>{truncatedValue}</div>
    <div class="w-[100px] h-[36px] flex items-center justify-center">
        {#if showCheckmark}
            <Check class="w-3.5 h-3.5 text-green-500" /> Copied!
        {:else}
            <Button
                variant="ghost"
                class="h-[36px] w-[100px] ml-1 rounded-none hover:border-blue-100 hover:border hover:rounded-sm"
                onclick={() => {
                    if (linkUrl) {
                        copy();
                    } else {
                        createLinkFn();
                    }
                }}
                disabled={creatingLink || (disableCreateLinkButton && !linkUrl)}
            >
                {#if creatingLink}
                    <Loader class="w-3.5 h-3.5 animate-spin" /> Copying...
                {:else if linkUrl}
                    <Copy class="w-3.5 h-3.5 text-gray-400" /> Copy link
                {:else}
                    <Link class="w-3.5 h-3.5 text-gray-400" /> Create link
                {/if}
            </Button>
        {/if}
    </div>
</div> -->
