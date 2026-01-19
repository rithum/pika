<script lang="ts">
    import ArrowUp from '$icons/lucide/arrow-up';
    import Cpu from '$icons/lucide/cpu';
    import Paperclip from '$icons/lucide/paperclip';
    import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import { getContext } from 'svelte';
    import { toast } from 'svelte-sonner';
    import { ChatAppState } from '../chat-app.state.svelte';
    import { ChatFileValidationError } from '../lib/ChatFileValidationError';
    import AddContextMenu from './add-context-menu.svelte';
    import AutoContextDropdown from './auto-context-dropdown.svelte';
    import ChatFileAttachment from './chat-file-attachment.svelte';
    import ContextChip from './context-chip.svelte';

    interface Props {
        // Allows external components to get the height of the input region, we don't
        // use this to set the height of the input region, only to report the height as
        // it changes.
        inputRegionHeight?: number;
    }

    let { inputRegionHeight = $bindable() }: Props = $props();

    const chat = getContext<ChatAppState>('chatAppState');

    // Read-only mode for shared sessions
    const isReadOnly = $derived(chat.currentSessionIsReadOnly);

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
        if (event.key === 'Enter') {
            if (event.shiftKey) {
                // Shift+Enter: Allow default behavior (insert newline)
                // Stop propagation to prevent container handler from interfering
                event.stopPropagation();
                return;
            } else {
                // Enter alone: Send message
                event.preventDefault();
                chat.sendMessage();
            }
        }
    }

    function focusTextarea() {
        if (textarea) {
            textarea.focus();
        }
    }

    function handleContainerKeyDown(event: KeyboardEvent) {
        // Only handle Enter if it's not from the textarea (and not Shift+Enter)
        if (event.key === 'Enter' && !event.shiftKey && event.target !== textarea) {
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

    $effect(() => {
        // Watch for changes to chat.chatInput and resize accordingly
        // This handles programmatic changes (like clearing after send)
        chat.chatInput;
        autoResizeTextarea();
    });

    function handleRemoveAutoContext(sourceId: string) {
        chat.removeContextSource(sourceId);
    }

    function handleAddContext(context: any) {
        chat.addContextSource({
            ...context,
            origin: 'user',
        });
    }

    function handleRemoveManualContext(sourceId: string) {
        chat.removeContextSource(sourceId);
    }
</script>

<div
    class="flex w-full cursor-text flex-col items-center justify-center rounded-[14px] bg-clip-padding contain-inline-size overflow-clip border-border border shadow-sm sm:shadow-lg dark:shadow-none! bg-card dark:bg-card"
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

        <!-- Context chips area -->
        {#if chat.autoContextSources.length > 0 || chat.manualContextSources.length > 0}
            <div class="flex flex-wrap gap-2 mb-2">
                <!-- Auto-context chip (collapsed) -->
                {#if chat.autoContextSources.length > 0}
                    <AutoContextDropdown contexts={chat.autoContextSources} onRemove={handleRemoveAutoContext}>
                        <div
                            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-gray-600 text-[0.6875rem] leading-tight font-medium transition-all duration-150 whitespace-nowrap cursor-pointer hover:bg-gray-100 hover:border-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:border-gray-600"
                        >
                            <Cpu style="width: 14px; height: 14px; opacity: 0.7;" />
                            <span
                                >{chat.autoContextSources.length}
                                {chat.autoContextSources.length === 1 ? 'Context Source' : 'Context Sources'}</span
                            >
                        </div>
                    </AutoContextDropdown>
                {/if}

                <!-- Manual context chips (individual) -->
                {#each chat.manualContextSources as context (context.sourceId)}
                    <ContextChip {context} onRemove={() => handleRemoveManualContext(context.sourceId)} />
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
                        disabled={isReadOnly || chat.isStreamingResponseNow}
                        class="text-foreground placeholder:text-muted-foreground block w-full min-h-[48px] resize-none border-0 bg-transparent px-0 py-2 ring-0 placeholder:ps-px focus:outline-none {isReadOnly
                            ? 'bg-gray-100 cursor-not-allowed'
                            : ''}"
                        placeholder={isReadOnly
                            ? "This chat session was shared with you and isn't editable"
                            : 'Ask me a question'}
                        rows="1"
                    ></textarea>
                </div>
            </div>
            <div style="height: 48px;"></div>
        </div>

        <!-- Button row -->
        <div class="bg-primary-surface-primary absolute start-3 end-0 bottom-3 z-2 flex items-center justify-between">
            <!-- Left buttons -->
            <div class="flex items-center gap-1.5">
                {#if !isReadOnly}
                    {#if chat.getAvailableContexts(true).length > 0}
                        <AddContextMenu
                            availableContexts={chat.getAvailableContexts()}
                            onAdd={handleAddContext}
                            disabled={isReadOnly || chat.isViewingContentForAnotherUser}
                        />
                    {/if}
                    {#if chat.enableFileUpload}
                        <TooltipPlus tooltip="Upload File">
                            <Button variant="outline" class="w-9 h-9" onclick={openFileDialog}>
                                <Paperclip style="width: 1.3rem; height: 1.3rem;" />
                            </Button>
                        </TooltipPlus>
                    {/if}
                {/if}
            </div>

            <!-- Right button -->
            <div class="flex items-center gap-1.5 mr-2.5">
                <Button
                    variant="default"
                    class="w-9 h-9"
                    disabled={isReadOnly ||
                        chat.isViewingContentForAnotherUser ||
                        chat.userNeedsToProvideDataOverrides ||
                        !chat.chatInput.trim()}
                    onclick={async () => await chat.sendMessage()}
                >
                    <ArrowUp style="width: 1.3rem; height: 1.3rem;" />
                </Button>
            </div>
        </div>
    </div>

    <!-- Hidden file input -->
    {#if chat.enableFileUpload && !chat.isViewingContentForAnotherUser && !isReadOnly}
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
