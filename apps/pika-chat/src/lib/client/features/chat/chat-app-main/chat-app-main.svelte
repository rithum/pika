<script lang="ts">
    import { AppState } from '$client/app/app.state.svelte';
    import { injectChatAppWebComponent } from '$client/webcomponent-utils';
    import Loader from '$icons/lucide/loader';
    import MessageSquarePlus from '$icons/lucide/message-square-plus';
    import ThumbsDown from '$icons/lucide/thumbs-down';
    import ThumbsUp from '$icons/lucide/thumbs-up';
    import type {
        ChatMessage,
        ChatSessionFeedbackForCreate,
        SessionFeedbackType,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import ExpandableContainer from 'pika-ux/pika/expandable-container/expandable-container.svelte';
    import TooltipPlus from 'pika-ux/pika/tooltip-plus/tooltip-plus.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import { getContext } from 'svelte';
    import { toast } from 'svelte-sonner';
    import { v7 as uuidv7 } from 'uuid';
    import { formatDateTime } from '../../../../utils';
    import { ChatAppState } from '../chat-app.state.svelte';
    import ChatFeedbackDialog from '../chat-feedback/chat-feedback.svelte';
    import ChatFileDisplay from '../chat-input/chat-file-display.svelte';
    import ChatInput from '../chat-input/chat-input.svelte';
    import CurrentSessionShareDialog from '../chat-share-dialog/current-session-share-dialog.svelte';
    import ContentAdminDialog from '../content-admin/content-admin-dialog.svelte';
    import { ChatFileValidationError } from '../lib/ChatFileValidationError';
    import { MessageRenderer, type ProcessedTagSegment } from '../message-segments';
    import Prompt from '../message-segments/default-components/prompt.svelte';
    import Hero from '../hero/index.svelte';
    import Spotlight from '../spotlight/index.svelte';
    import UserDataOverridesDialog from '../user-data-overrides/user-data-overrides-dialog.svelte';
    import WidgetDialog from './widget-dialog.svelte';

    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');

    // Spotlight and hero state for layout decisions
    const spotlightIsVisible = $derived(chat.spotlightVisible);
    const heroIsVisible = $derived(chat.heroVisible);
    const heroIsCollapsed = $derived(chat.heroCollapsed);
    const hasHeroWidget = $derived(!!chat.heroWidget);
    const spotlightHasWidgets = $derived(chat.spotlightWidgets.length > 0);

    // Minimized/collapsed states - these go to top-left row
    const spotlightMinimized = $derived(spotlightHasWidgets && !spotlightIsVisible);
    // Hero minimized: visible + collapsed (compact header bar)
    const heroMinimized = $derived(hasHeroWidget && heroIsVisible && heroIsCollapsed);
    // For layout: only spotlight can be in minimized row (hero handles its own states)
    const hasAnyMinimized = $derived(spotlightMinimized);

    // Expanded states - these render in their normal positions
    const spotlightExpanded = $derived(spotlightHasWidgets && spotlightIsVisible);
    // Hero expanded: visible + not collapsed (full widget)
    const heroExpanded = $derived(hasHeroWidget && heroIsVisible && !heroIsCollapsed);
    
    // Hero visibility for layout purposes (hidden in companion mode or when not visible)
    const heroShouldShow = $derived(hasHeroWidget && !chat.isCompanionMode);

    const fullScreen = $derived(chat.mode === 'standalone');

    // NOTE: Static widget tracking is now stored in ChatAppState to persist across component remounts.
    // This prevents the bug where static widgets were re-injected when the layout switched between
    // companion mode and normal mode, causing the component to remount and lose its local state.

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
    let chatMessageForFeedback = $state<ChatMessage | undefined>();

    // Track previous values to detect actual changes
    let previousSession = $state<any>(undefined);

    $effect(() => {
        let height = document.getElementById('cam-input-region-container')?.getBoundingClientRect()?.height;
        if (scrollToDiv && height) {
            scrollToDiv.style.paddingBottom = `${height}px`;
            scrollToDiv.style.scrollPaddingBottom = `${height}px`;
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
                    if (!userScrollOffOfBottom) {
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

    // Effect to inject static context widgets
    // NOTE: Tracking is stored in ChatAppState to persist across component remounts
    $effect(() => {
        const staticWidgets = chat.staticWidgets;

        // Inject each static widget that hasn't been injected yet
        for (const tagDef of staticWidgets) {
            const tagId = `${tagDef.scope}.${tagDef.tag}`;

            // Skip if already injected - tracking persists in ChatAppState
            if (chat.isStaticWidgetInjected(tagId)) {
                continue;
            }

            // Create hidden container for this static widget
            const container = document.createElement('div');
            container.style.display = 'none';
            container.setAttribute('data-static-widget', tagId);
            document.body.appendChild(container);

            // Mark as injected SYNCHRONOUSLY to prevent duplicate injection
            // This is stored in ChatAppState so it persists across component remounts
            chat.markStaticWidgetInjected(tagId, container);

            // Inject the web component
            injectChatAppWebComponent(
                tagDef,
                container,
                {
                    renderingContext: 'static',
                    appState: appState,
                    chatAppState: chat,
                    chatAppId: chat.chatApp.chatAppId,
                    dataForWidget: {},
                },
                false // Don't replace, append
            )
                .then((result) => {
                    // console.log(`[Static Widget] Successfully injected ${tagId}`);

                    // Register widget instance with ChatAppState
                    const customElementName = tagDef.widget.webComponent.customElementName || tagId;
                    chat.registerWidgetInstance({
                        instanceId: result.instanceId,
                        element: result.element,
                        tagId,
                        customElementName,
                        renderingContext: 'static',
                        tagDefinition: tagDef,
                        createdAt: Date.now(),
                    });

                    // Handle shutDownAfterMs cleanup (for widgets that should auto-destroy)
                    const shutDownAfterMs = tagDef.renderingContexts.static?.shutDownAfterMs;
                    if (shutDownAfterMs && shutDownAfterMs > 0) {
                        const timeoutId = setTimeout(() => {
                            const containerToRemove = chat.getStaticWidgetContainer(tagId);
                            if (containerToRemove) {
                                // Unregister from ChatAppState
                                chat.unregisterWidgetInstance(result.instanceId);
                                chat.removeStaticWidget(tagId);
                            }
                        }, shutDownAfterMs);

                        chat.setStaticWidgetTimeout(tagId, timeoutId);
                    }
                })
                .catch((error) => {
                    console.error(`[Static Widget] Failed to inject ${tagId}:`, error);
                    // Remove from tracking so it can be retried
                    chat.markStaticWidgetNotInjected(tagId);
                    container.remove();
                });
        }
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

    async function addFeedback(
        chatMessage: ChatMessage,
        sessionFeedbackType: SessionFeedbackType,
        userComment?: string
    ) {
        const sessionFeedback: ChatSessionFeedbackForCreate = {
            feedbackId: uuidv7(),
            sessionId: chat.currentSession.sessionId,
            type: sessionFeedbackType,
            userComment: userComment,
            reportedByHuman: true,
            createdByCustomer: chatMessage.userId === appState.identity.user.userId,
            status: 'open',
            severity: 'medium',
            userId: appState.identity.user.userId,
            messageId: chatMessage.messageId,
        };

        await chat.addFeedback(sessionFeedback);

        toast.success('Feedback added. Thanks!', {
            duration: 1000,
            position: 'top-right',
        });
    }
</script>

<!-- Fullwidth outer container with drag and drop handlers -->
<div
    class="chat-main-container w-full h-full flex flex-col relative {isDraggingFile ? 'cursor-copy' : ''}"
    class:companion-mode={chat.isCompanionMode}
    role="region"
    aria-label="Chat message area with file drop zone"
    data-companion-mode={chat.isCompanionMode}
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

    <!-- Spotlight and Hero layout -->
    <!-- Note: Hero is always mounted when hasHeroWidget to preserve web component state -->
    {#if !chat.isCompanionMode}
        <!-- Minimized spotlight header row - top left aligned -->
        {#if hasAnyMinimized}
            <div class="w-full flex items-center gap-6 px-4 mt-1">
                {#if spotlightMinimized}
                    <Spotlight
                        mode={chat.currentSessionMessages && chat.currentSessionMessages.length > 0
                            ? 'thumbnail'
                            : 'card'}
                        compact={true}
                    />
                {/if}
            </div>
        {/if}

        <!-- Expanded spotlight - full width, centered -->
        {#if spotlightExpanded}
            <div class="w-full flex justify-center min-h-[80px]">
                <div class="max-w-full w-full">
                    <Spotlight
                        mode={chat.currentSessionMessages && chat.currentSessionMessages.length > 0
                            ? 'thumbnail'
                            : 'card'}
                    />
                </div>
            </div>
        {/if}
    {/if}

    <!-- 
        Hero widget - ALWAYS mounted when hasHeroWidget to preserve web component state.
        The Hero component handles its own visibility via CSS (heroVisible state).
        This prevents the web component from being destroyed when hero is hidden.
        The widget can listen to heroDidShow/heroDidHide events to refresh data.
    -->
    {#if hasHeroWidget}
        <div 
            class:hidden={!heroShouldShow}
            class={heroExpanded && !spotlightHasWidgets ? 'pt-4' : ''}
        >
            <Hero compact={heroMinimized} />
        </div>
    {/if}

    {#if chat.retrievingMessages || (chat.currentSessionMessages && chat.currentSessionMessages.length > 0)}
        <!-- Scrollable area that spans full width with right-aligned scrollbar (hidden when chat pane is minimized in companion mode) -->
        <div
            class="flex-1 overflow-y-auto chat-history-area"
            class:hidden={chat.isCompanionMode && chat.isChatPaneMinimized}
            bind:this={resizeHeightEl}
        >
            <!-- Centered content container -->
            <div class="w-full max-w-[768px] mx-auto pb-[150px]" bind:this={scrollToDiv}>
                <div class="pb-4 px-4 pt-10">
                    {#each chat.currentSessionMessages as message}
                        <div class="flex flex-col gap-8 mb-10">
                            {#if message.source === 'user'}
                                <div class="flex flex-col items-end gap-2">
                                    <div class="chat-message-content p-4 rounded-lg bg-gray-50 max-w-[66%]">
                                        {message.message}
                                    </div>
                                    {#if message.files && message.files.length > 0}
                                        <div class="flex flex-wrap gap-2 max-w-[66%] justify-end">
                                            {#each message.files as file}
                                                <ChatFileDisplay {file} />
                                            {/each}
                                        </div>
                                    {/if}
                                    <div class="user timestamp">
                                        {formatDateTime(message.timestamp)}
                                    </div>
                                </div>
                            {:else}
                                <div class="chat-message-content flex flex-col gap-2">
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
                                            features={chat.features}
                                            componentRegistry={chat.componentRegistry}
                                            traceEnabled={chat.features.traces.enabled}
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

                                    {#if !chat.isStreamingResponseNow}
                                        <div class="flex items-center mt-2">
                                            {#if !chat.isInterimSession}
                                                {#if chat.addingFeedback}
                                                    <Loader class="h-4 w-4 animate-spin" />
                                                {:else}
                                                    <div class="flex items-center">
                                                        <TooltipPlus tooltip="Good response">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onclick={() => {
                                                                    addFeedback(message, 'user_thumbs_up');
                                                                }}
                                                            >
                                                                <ThumbsUp class="h-4 w-4" />
                                                            </Button>
                                                        </TooltipPlus>
                                                        <TooltipPlus tooltip="Bad response">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onclick={() => {
                                                                    addFeedback(message, 'user_thumbs_down');
                                                                }}
                                                            >
                                                                <ThumbsDown class="h-4 w-4" />
                                                            </Button>
                                                        </TooltipPlus>
                                                        <TooltipPlus tooltip="Give feedback">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onclick={() => {
                                                                    chatMessageForFeedback = message;
                                                                    chat.feedbackDialogOpen = true;
                                                                }}
                                                            >
                                                                <MessageSquarePlus class="h-4 w-4" />
                                                            </Button>
                                                        </TooltipPlus>
                                                    </div>
                                                {/if}
                                            {/if}
                                            <div class="assistant timestamp ml-2">
                                                {formatDateTime(message.timestamp)}
                                            </div>
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
        <div
            class="absolute bottom-0 left-0 right-0 pt-2 mb-0 mx-4"
            class:bg-background={!chat.isCompanionMode}
            class:bg-gray-25={chat.isCompanionMode}
            class:pb-6={!chat.isCompanionMode}
            class:pb-1={chat.isCompanionMode}
            id="cam-input-region-container"
        >
            <div class="w-full max-w-[768px] mx-auto">
                <ChatInput bind:inputRegionHeight />
            </div>
        </div>
    {:else}
        <!-- No messages case -->
        <!-- In companion mode: input at top; otherwise: centered vertically -->
        <div
            class="flex-1 flex flex-col"
            class:justify-center={!chat.isCompanionMode}
            class:justify-start={chat.isCompanionMode}
            class:pt-4={chat.isCompanionMode}
            class:min-h-[300px]={!chat.isCompanionMode}
        >
            <div class="w-full max-w-[768px] mx-auto">
                <div class="flex flex-col px-4">
                    <!-- Hide label and suggestions in companion mode -->
                    {#if !chat.isCompanionMode}
                        {#if chat.features.promptInputFieldLabel.label}
                            <div class="text-3xl text-center mb-4">{chat.features.promptInputFieldLabel.label}</div>
                        {/if}
                        {#if chat.suggestions.length > 0}
                            <div class="pb-1">
                                <ExpandableContainer title="Suggestions" useCase="button">
                                    <div class="flex flex-col gap-2 items-start">
                                        {#each chat.suggestions as suggestion}
                                            <Prompt
                                                segment={{ rawContent: suggestion } as ProcessedTagSegment}
                                                {appState}
                                                chatAppState={chat}
                                                disabled={chat.isViewingContentForAnotherUser}
                                            />
                                        {/each}
                                    </div>
                                </ExpandableContainer>
                            </div>
                        {/if}
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

{#if chat.userDataOverrideSettings.enabled}
    <UserDataOverridesDialog />
{/if}

{#if chat.userIsContentAdmin}
    <ContentAdminDialog />
{/if}

{#if chatMessageForFeedback}
    <ChatFeedbackDialog bind:open={chat.feedbackDialogOpen} {chatMessageForFeedback} />
{/if}

<CurrentSessionShareDialog />

<WidgetDialog />

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

    .timestamp {
        /* margin-top: 0.5rem; */
        font-size: 0.65rem;
        opacity: 0.7;
        text-align: right;
    }
    .timestamp.assistant {
        /* margin-top: 0.5rem; */
        font-size: 0.65rem;
        opacity: 0.7;
        text-align: left;
    }

    /* Companion Mode Styles - compact UI when canvas is the primary focus */
    .chat-main-container.companion-mode {
        font-size: 13px;
    }

    /* Companion mode: smaller text for all message content */
    .companion-mode .chat-message-content {
        font-size: 13px;
        line-height: 1.4;
    }

    .companion-mode .chat-message-content :global(p) {
        font-size: 13px;
        margin-bottom: 0.5em;
    }

    .companion-mode .chat-message-content :global(li) {
        font-size: 13px;
    }

    .companion-mode .chat-message-content :global(h1),
    .companion-mode .chat-message-content :global(h2),
    .companion-mode .chat-message-content :global(h3) {
        font-size: 14px;
        margin-top: 0.75em;
        margin-bottom: 0.5em;
    }

    /* Companion mode: smaller input area */
    .companion-mode :global(textarea) {
        font-size: 13px;
    }

    /* Companion mode: smaller timestamps */
    .companion-mode .timestamp {
        font-size: 0.55rem;
    }

    /* Companion mode: slightly smaller buttons */
    .companion-mode :global(.chat-input-area button) {
        transform: scale(0.9);
    }

    /* Companion mode: tighter spacing */
    .companion-mode .chat-history-area {
        padding-top: 0.5rem;
    }

    .companion-mode .chat-history-area > div {
        padding-bottom: 100px;
    }
</style>
