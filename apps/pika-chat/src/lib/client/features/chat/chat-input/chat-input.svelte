<script lang="ts">
    import { AppState } from '$client/app/app.state.svelte';
    import { Button } from '$lib/components/ui/button';
    import { ArrowUp, Plus } from '$lib/icons/lucide';
    import { getContext } from 'svelte';
    import { toast } from 'svelte-sonner';
    import { ChatFileValidationError } from '../lib/ChatFileValidationError';
    import ChatFileAttachment from './chat-file-attachment.svelte';
    import { ChatAppState } from '../chat-app.state.svelte';

    interface Props {
        // Allows external components to get the height of the input region, we don't
        // use this to set the height of the input region, only to report the height as
        // it changes.
        inputRegionHeight?: number;
    }

    let { inputRegionHeight = $bindable() }: Props = $props();

    const chat = getContext<ChatAppState>('chatAppState');

    let inputRegionEl: HTMLDivElement;
    let textarea: HTMLTextAreaElement;
    let fileInput: HTMLInputElement | undefined = $state();

    function autoResizeTextarea() {
        if (!textarea) return;

        // Reset height to allow proper calculation
        textarea.style.height = 'auto';

        // Set new height based on scroll height (content height)
        const newHeight = Math.min(textarea.scrollHeight, 200); // Max height of 200px
        textarea.style.height = `${newHeight}px`;

        if (inputRegionEl !== undefined) {
            inputRegionHeight = inputRegionEl.clientHeight;
        }
    }

    function handleInput() {
        autoResizeTextarea();
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            chat.sendMessage();
        }
    }

    function focusTextarea() {
        if (textarea) {
            textarea.focus();
        }
    }

    function handleContainerKeyDown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault();
            focusTextarea();
        }
    }

    function openFileDialog() {
        if (fileInput) {
            fileInput.click();
        }
    }

    async function handleFileSelect() {
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            try {
                const files = Array.from(fileInput.files);
                await chat.uploadFiles(files);

                // Clear the input to allow selecting the same file again
                fileInput.value = '';
            } catch (error) {
                let msg = '';
                if (error instanceof ChatFileValidationError) {
                    msg = error.message;
                }
                toast.error(`Error uploading files: ${msg}`, { duration: Number.POSITIVE_INFINITY });
            }
        }
    }

    $effect(() => {
        // Initial height adjustment, triggers just once on mount
        autoResizeTextarea();
    });
</script>

<div
    class="flex w-full cursor-text flex-col items-center justify-center rounded-[14px] bg-clip-padding contain-inline-size overflow-clip border-token-border-default border shadow-sm sm:shadow-lg dark:shadow-none! bg-token-bg-primary dark:bg-[#303030]"
    onclick={focusTextarea}
    onkeydown={handleContainerKeyDown}
    tabindex="0"
    role="textbox"
    aria-label="Chat input"
    bind:this={inputRegionEl}
>
    <div class="relative w-full flex flex-col px-3 pt-3 pb-0">
        <!-- File display area -->
        {#if chat.enableFileUpload && chat.inputFiles && chat.inputFiles.length > 0}
            <div class="flex flex-wrap gap-2 mb-3 my-input-files-container">
                {#each chat.inputFiles as fileInstance, index}
                    <ChatFileAttachment {fileInstance} removeFile={(s3Key: string) => chat.removeFile(s3Key)} />
                {/each}
            </div>
        {/if}

        <!-- Text area -->
        <div class="relative flex w-full flex-auto flex-col">
            <div class="relative flex w-full">
                <div class="w-full min-h-12">
                    <textarea
                        bind:this={textarea}
                        bind:value={chat.chatInput}
                        oninput={handleInput}
                        onkeydown={handleKeyDown}
                        class="text-token-text-primary placeholder:text-token-text-tertiary block w-full min-h-[48px] resize-none border-0 bg-transparent px-0 py-2 ring-0 placeholder:ps-px focus:outline-none"
                        placeholder="Ask me a question"
                        rows="1"
                    ></textarea>
                </div>
            </div>
            <div style="height: 48px;"></div>
        </div>

        <!-- Send buttons -->
        <div class="bg-primary-surface-primary absolute start-3 end-0 bottom-3 z-2 flex items-center">
            <div class="w-full">
                <div class="absolute end-3 bottom-0 flex items-center gap-2">
                    <div class="ms-auto flex items-center gap-1.5">
                        {#if chat.enableFileUpload}
                            <Button variant="outline" class="w-9 h-9" onclick={openFileDialog}>
                                <Plus style="width: 1.3rem; height: 1.3rem;" />
                            </Button>
                        {/if}
                        <Button
                            variant="default"
                            class="w-9 h-9"
                            disabled={chat.isViewingContentForAnotherUser ||
                                chat.userNeedsToProvideDataOverrides ||
                                !chat.chatInput.trim()}
                            onclick={async () => await chat.sendMessage()}
                        >
                            <ArrowUp style="width: 1.3rem; height: 1.3rem;" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Hidden file input -->
    {#if chat.enableFileUpload && !chat.isViewingContentForAnotherUser}
        <input
            type="file"
            bind:this={fileInput}
            onchange={handleFileSelect}
            accept=".csv"
            style="display: none;"
            multiple
        />
    {/if}
</div>
{#if chat.features.chatDisclaimerNotice}
    <div class="text-xs pl-6 pr-6 mt-2 text-gray-400" style="font-size: 0.7rem;">
        {chat.features.chatDisclaimerNotice}
    </div>
{/if}
