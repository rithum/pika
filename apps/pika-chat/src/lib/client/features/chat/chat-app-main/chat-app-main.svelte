<script lang="ts">
    import ChatInput from '../chat-input/chat-input.svelte';
    import ChatFileDisplay from '../chat-input/chat-file-display.svelte';
    import { getContext } from 'svelte';
    import { AppState } from '$client/app/app.state.svelte';
    import { toast } from 'svelte-sonner';
    import { ChatFileValidationError } from '../lib/ChatFileValidationError';
    import { ChatAppState } from '../chat-app.state.svelte';
    import ExpandableContainer from '$comps/ui-pika/expandable-container/expandable-container.svelte';
    import Prompt from '../message-segments/default-components/prompt.svelte';
    import { MessageRenderer, type ProcessedTagSegment } from '../message-segments';

    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');

    const fullScreen = $derived(chat.chatApp.mode === 'fullpage');

    // File drag/drop state
    let isDraggingFile = $state(false);
    let dragTarget: EventTarget | null = null;

    // svelte-ignore non_reactive_update
    let scrollToDiv: HTMLDivElement;
    let resizeHeightEl: HTMLDivElement = $state() as HTMLDivElement;
    let inputRegionHeight = $state<number>(0);
    let userScrollOffOfBottom = $state(false);
    let hasTriedToScrollToBottom = $state(false);
    let isProgrammaticallyScrolling = $state(false);

    // Track previous values to detect actual changes
    let previousSession = $state<any>(undefined);

    $effect(() => {
        const height = inputRegionHeight;
        if (resizeHeightEl) {
            resizeHeightEl.style.bottom = `${height}px`;
        }
    });

    // Helper function to check if scrolled to bottom
    function isScrolledToBottom(element: Element): boolean {
        const threshold = 20; // pixels from bottom to consider "at bottom"
        return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
    }

    // Add scroll event listener to detect when user scrolls away from bottom
    $effect(() => {
        if (!resizeHeightEl) return;

        function handleScroll() {
            // Ignore scroll events when we're programmatically scrolling
            if (isProgrammaticallyScrolling) return;

            if (hasTriedToScrollToBottom && !isScrolledToBottom(resizeHeightEl)) {
                userScrollOffOfBottom = true;
                // console.log('User scrolled away from bottom - setting userScrollOffOfBottom = true');
            }
        }

        resizeHeightEl.addEventListener('scroll', handleScroll);

        return () => {
            resizeHeightEl.removeEventListener('scroll', handleScroll);
        };
    });

    $effect(() => {
        const session = chat.currentSession;
        const currentSessionMessages = chat.currentSessionMessages;
        const messageChunkCount = chat.messageChunkCount;

        // Reset userScrollOffOfBottom ONLY when session actually changes
        const sessionChanged = previousSession !== undefined && previousSession !== session;

        if (sessionChanged) {
            userScrollOffOfBottom = false;
            // console.log('Reset userScrollOffOfBottom - session changed');
        }

        // Update previous values
        previousSession = session;

        // Auto-scroll when messages or chunks change, unless user scrolled away
        const shouldAutoScroll =
            !userScrollOffOfBottom &&
            ((session && sessionChanged) || // New session
                (currentSessionMessages && currentSessionMessages.length > 0) || // Messages exist
                messageChunkCount > 0); // Streaming chunks

        if (shouldAutoScroll) {
            setTimeout(() => {
                hasTriedToScrollToBottom = true;
                scrollToBottom();
            }, 1000);
        }
    });

    // Effect to watch for height changes in scrollToDiv
    $effect(() => {
        if (!scrollToDiv) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Check if the content size has changed
                if (entry.contentBoxSize || entry.borderBoxSize) {
                    // Only autoscroll if the user hasn't scrolled away
                    if (!userScrollOffOfBottom){
                        console.log('scrollToDiv height changed, scrolling to bottom');
                        scrollToBottom();
                    }
                }
            }
        });

        resizeObserver.observe(scrollToDiv);

        // Cleanup function
        return () => {
            resizeObserver.disconnect();
        };
    });

    // File drag handlers
    function handleDragEnter(event: DragEvent) {
        if (!chat.enableFileUpload || chat.isStreamingResponseNow || !event.dataTransfer?.types.includes('Files'))
            return;

        event.preventDefault();
        dragTarget = event.target;
        isDraggingFile = true;
    }

    function handleDragOver(event: DragEvent) {
        if (!chat.enableFileUpload || chat.isStreamingResponseNow || !event.dataTransfer?.types.includes('Files'))
            return;

        event.preventDefault();
    }

    function handleDragLeave(event: DragEvent) {
        if (!chat.enableFileUpload) return;

        // Only consider it a leave if we're leaving the element we entered on
        // or one of its descendants
        if (dragTarget && event.currentTarget instanceof Node && event.relatedTarget instanceof Node) {
            if (!event.currentTarget.contains(event.relatedTarget)) {
                isDraggingFile = false;
                dragTarget = null;
            }
        }
    }

    async function handleDrop(event: DragEvent) {
        if (!chat.enableFileUpload || chat.isStreamingResponseNow || !event.dataTransfer?.types.includes('Files'))
            return;

        event.preventDefault();
        isDraggingFile = false;
        dragTarget = null;

        // Here you would process the files
        // const files = event.dataTransfer?.files;
        const files = Array.from(event.dataTransfer?.files ?? []);
        try {
            await chat.uploadFiles(files);
        } catch (error) {
            let msg = '';
            if (error instanceof ChatFileValidationError) {
                msg = error.message;
            }
            toast.error(`Error uploading files: ${msg}`, { duration: Number.POSITIVE_INFINITY });
        }
    }

    function scrollToBottom() {
        setTimeout(function () {
            if (scrollToDiv) {
                // console.log('scrolling to bottom');
                isProgrammaticallyScrolling = true;
                scrollToDiv.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });

                // Reset flag after smooth scroll completes (smooth scroll typically takes ~500ms)
                setTimeout(() => {
                    isProgrammaticallyScrolling = false;
                }, 1000);
            }
        }, 1);
    }
</script>

<!-- Fullwidth outer container with drag and drop handlers -->
<div
    class="w-full h-full flex flex-col relative {isDraggingFile ? 'cursor-copy' : ''}"
    role="region"
    aria-label="Chat message area with file drop zone"
    ondragenter={chat.enableFileUpload ? handleDragEnter : undefined}
    ondragover={chat.enableFileUpload ? handleDragOver : undefined}
    ondragleave={chat.enableFileUpload ? handleDragLeave : undefined}
    ondrop={chat.enableFileUpload ? handleDrop : undefined}
>
    {#if isDraggingFile}
        <!-- File drop overlay -->
        <div class="absolute inset-0 bg-black/20 z-50 flex items-center justify-center cursor-copy">
            <div class="bg-white/90 p-8 rounded-lg shadow-lg text-center">
                <p class="text-xl font-semibold mb-2">Drop files to add to the conversation</p>
                <p class="text-sm text-gray-600">Share images and documents (up to 5 files)</p>
            </div>
        </div>
    {/if}

    {#if chat.retrievingMessages || (chat.currentSessionMessages && chat.currentSessionMessages.length > 0)}
        <!-- Scrollable area that spans full width with right-aligned scrollbar -->
        <div class="absolute inset-0 bottom-[80px] overflow-y-auto" bind:this={resizeHeightEl}>
            <!-- Centered content container -->
            <div class="w-full max-w-[768px] mx-auto" bind:this={scrollToDiv}>
                <div class="pb-4 px-4 pt-10">
                    {#each chat.currentSessionMessages as message}
                        <div class="flex flex-col gap-8 mb-10">
                            {#if message.source === 'user'}
                                <div class="flex flex-col items-end gap-2">
                                    <div class="p-4 rounded-lg bg-gray-50 max-w-[66%]">{message.message}</div>
                                    {#if message.files && message.files.length > 0}
                                        <div class="flex flex-wrap gap-2 max-w-[66%] justify-end">
                                            {#each message.files as file}
                                                <ChatFileDisplay {file} />
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {:else}
                                <div class="flex flex-col gap-2">
                                    {#if chat.waitingForFirstStreamedResponse && message.message === ''}
                                        <div class="flex items-center h-6">
                                            <div
                                                class="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-gray-100 w-fit"
                                            >
                                                <div class="h-2 w-2 bg-gray-600 rounded-full dot-1"></div>
                                                <div class="h-2 w-2 bg-gray-600 rounded-full dot-2"></div>
                                                <div class="h-2 w-2 bg-gray-600 rounded-full dot-3"></div>
                                            </div>
                                        </div>
                                    {:else}
                                        <MessageRenderer
                                            {message}
                                            files={message.files ?? []}
                                            chatAppState={chat}
                                            isStreaming={chat.isStreamingResponseNow &&
                                                !chat.waitingForFirstStreamedResponse}
                                        />
                                    {/if}
                                    {#if message.files && message.files.length > 0 && !chat.isStreamingResponseNow}
                                        <div class="flex flex-wrap gap-2 max-w-[66%]">
                                            {#each message.files as file}
                                                <ChatFileDisplay {file} />
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
            {@render loader(chat.retrievingMessages)}
        </div>

        <!-- Fixed input at bottom, also centered -->
        <div class="absolute bottom-0 left-0 right-0 bg-background pt-2 mb-6 px-4">
            <div class="w-full max-w-[768px] mx-auto">
                <ChatInput bind:inputRegionHeight />
            </div>
        </div>
    {:else}
        <!-- No messages case -->
        <div class="flex-grow flex flex-col" style="padding-top: {fullScreen ? '20vh' : '2vh'}">
            <div class="w-full max-w-[768px] mx-auto">
                <div class="flex flex-col px-4">
                    {#if !chat.hidePromptInputFieldLabel}
                        <div class="text-3xl text-center mb-4">{chat.promptInputFieldLabel}</div>
                    {/if}
                    {#if chat.suggestions.length > 0}
                        <div class="pb-1">
                            <ExpandableContainer title="Suggestions" useCase="button">
                                <div class="flex flex-col gap-2 items-start">
                                    {#each chat.suggestions as suggestion}
                                        <Prompt segment={{ rawContent: suggestion } as ProcessedTagSegment} {appState} chatAppState={chat} />
                                    {/each}
                                </div>
                            </ExpandableContainer>
                        </div>
                    {/if}
                    <ChatInput />
                </div>
            </div>
        </div>
    {/if}
</div>

{#snippet loader(showing: boolean)}
    {#if showing}
        <div class="flex items-center justify-center">
            <svg class="w-6 h-6 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
            </svg>
        </div>
    {/if}
{/snippet}

<style>
    @keyframes pulse-dot {
        0%,
        60%,
        100% {
            opacity: 0.3;
            transform: scale(1);
        }
        30% {
            opacity: 1;
            transform: scale(1.15);
        }
    }

    .dot-1 {
        animation: pulse-dot 1.4s infinite ease-in-out;
        animation-delay: 0s;
    }

    .dot-2 {
        animation: pulse-dot 1.4s infinite ease-in-out;
        animation-delay: 0.16s;
    }

    .dot-3 {
        animation: pulse-dot 1.4s infinite ease-in-out;
        animation-delay: 0.32s;
    }
</style>
