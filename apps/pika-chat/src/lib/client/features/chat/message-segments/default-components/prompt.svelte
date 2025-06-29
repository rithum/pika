<script lang="ts">
    import { AppState } from '$client/app/app.state.svelte';
    import { Button } from '$lib/components/ui/button';
    import { MessageSquare } from '$lib/icons/lucide';
    import { ChatAppState } from '../../chat-app.state.svelte';
    import type { ProcessedTagSegment } from '../segment-types';

    interface Props {
        segment: ProcessedTagSegment;
        appState: AppState;
        chatAppState: ChatAppState;
        disabled?: boolean;
    }

    let { segment, chatAppState: chat, disabled }: Props = $props();

    function handleClick() {
        // console.log('[PROMPT-RENDERER] Button clicked:', {
        //     segmentId: segment.id,
        //     promptContent: segment.rawContent
        // });
        chat.chatInput = segment.rawContent;
        chat.sendMessage();
    }

    // Show placeholder ONLY during streaming state AND when there's actual content
    // Don't show placeholder for empty segments (rawContentLength === 0)
    // Once completed, always show the actual button (mutually exclusive)
    let showPlaceholder = $derived(segment.streamingStatus === 'streaming');

    // LOGGING: Track component state changes
    // $effect(() => {
    //     console.log('[PROMPT-RENDERER] Segment updated:', {
    //         segmentId: segment.id,
    //         streamingStatus: segment.streamingStatus,
    //         rawContentLength: segment.rawContent.length,
    //         rawContentPreview: segment.rawContent.slice(0, 50) + (segment.rawContent.length > 50 ? '...' : ''),
    //         showPlaceholder,
    //         hasContent: !!segment.rawContent && segment.rawContent.trim().length > 0
    //     });
    // });

    // LOGGING: Track when derived values change
    // $effect(() => {
    //     console.log('[PROMPT-RENDERER] Derived values changed:', {
    //         segmentId: segment.id,
    //         showPlaceholder,
    //         streamingStatus: segment.streamingStatus,
    //         rawContentLength: segment.rawContent.length
    //     });
    // });

    // LOGGING: Track component lifecycle and DOM state
    // $effect(() => {
    //     console.log('[PROMPT-RENDERER] 🔄 DOM State Check:', {
    //         segmentId: segment.id,
    //         showPlaceholder,
    //         streamingStatus: segment.streamingStatus,
    //         domElements: {
    //             placeholder: document.querySelector(`[data-prompt-placeholder="${segment.id}"]`),
    //             button: document.querySelector(`[data-prompt-button="${segment.id}"]`)
    //         },
    //         timestamp: new Date().toISOString()
    //     });
    // });

    // DEBUGGING: Capture ALL prompt elements when this segment shows a placeholder
    $effect(() => {
        if (showPlaceholder) {
            const allPlaceholders = document.querySelectorAll('[data-prompt-placeholder]');
            const allButtons = document.querySelectorAll('[data-prompt-button]');

            // Also capture ALL gray elements that might be the culprit
            const grayElements = document.querySelectorAll('.bg-gray-100, .animate-pulse, [class*="gray"]');
            const textRendererElements = document.querySelectorAll('[data-segment-type="text"]');

            // console.log('[PROMPT-RENDERER] 🚨 PLACEHOLDER DEBUG:', {
            //     segmentId: segment.id,
            //     showPlaceholder,
            //     streamingStatus: segment.streamingStatus,
            //     allPlaceholderElements: Array.from(allPlaceholders).map(el => ({
            //         id: el.getAttribute('data-prompt-placeholder'),
            //         streamingStatus: el.getAttribute('data-streaming-status'),
            //         isVisible: (el as HTMLElement).offsetParent !== null,
            //         boundingRect: (el as HTMLElement).getBoundingClientRect(),
            //         outerHTML: el.outerHTML.slice(0, 200)
            //     })),
            //     allButtonElements: Array.from(allButtons).map(el => ({
            //         id: el.getAttribute('data-prompt-button'),
            //         streamingStatus: el.getAttribute('data-streaming-status'),
            //         isVisible: (el as HTMLElement).offsetParent !== null,
            //         boundingRect: (el as HTMLElement).getBoundingClientRect(),
            //         outerHTML: el.outerHTML.slice(0, 200)
            //     })),
            //     allGrayElements: Array.from(grayElements).map(el => ({
            //         tagName: el.tagName,
            //         className: el.className,
            //         isVisible: (el as HTMLElement).offsetParent !== null,
            //         boundingRect: (el as HTMLElement).getBoundingClientRect(),
            //         textContent: el.textContent?.slice(0, 50),
            //         outerHTML: el.outerHTML.slice(0, 300)
            //     })),
            //     textRendererElements: Array.from(textRendererElements).map(el => ({
            //         segmentId: el.getAttribute('data-segment-id'),
            //         streamingStatus: el.getAttribute('data-streaming-status'),
            //         isVisible: (el as HTMLElement).offsetParent !== null,
            //         boundingRect: (el as HTMLElement).getBoundingClientRect(),
            //         hasStreamingCursor: el.querySelector('.streaming-cursor') !== null,
            //         outerHTML: el.outerHTML.slice(0, 300)
            //     })),
            //     timestamp: new Date().toISOString()
            // });

            // Log this placeholder element specifically with more detail
            const thisPlaceholder = document.querySelector(`[data-prompt-placeholder="${segment.id}"]`);
            if (thisPlaceholder) {
                // console.log(`[PROMPT-RENDERER] 🔍 THIS PLACEHOLDER ELEMENT (segment ${segment.id}):`, {
                //     element: thisPlaceholder,
                //     boundingRect: (thisPlaceholder as HTMLElement).getBoundingClientRect(),
                //     computedStyle: {
                //         display: getComputedStyle(thisPlaceholder as HTMLElement).display,
                //         position: getComputedStyle(thisPlaceholder as HTMLElement).position,
                //         backgroundColor: getComputedStyle(thisPlaceholder as HTMLElement).backgroundColor,
                //         opacity: getComputedStyle(thisPlaceholder as HTMLElement).opacity,
                //         zIndex: getComputedStyle(thisPlaceholder as HTMLElement).zIndex
                //     },
                //     parentElement: (thisPlaceholder as HTMLElement).parentElement?.tagName,
                //     nextSibling: (thisPlaceholder as HTMLElement).nextElementSibling?.tagName,
                //     previousSibling: (thisPlaceholder as HTMLElement).previousElementSibling?.tagName
                // });
            }
        }
    });
</script>

{#if showPlaceholder}
    <!-- Use key to ensure proper DOM element replacement -->
    <!-- LOGGING: Track when placeholder is shown -->
    <!-- {console.log('[PROMPT-RENDERER] 🔴 DOM: Rendering placeholder div for segment:', segment.id, {
        streamingStatus: segment.streamingStatus,
        rawContentLength: segment.rawContent.length,
        showPlaceholder,
        timestamp: new Date().toISOString()
    })} -->

    <!-- DEBUGGING: Capture a comprehensive DOM snapshot when we render a placeholder -->
    {(() => {
        setTimeout(() => {
            const messageContainer = document.querySelector(`[data-message-id]`);
            if (messageContainer) {
                const allGrayElements = messageContainer.querySelectorAll(
                    '.bg-gray-100, .animate-pulse, [class*="gray"], .streaming'
                );
                // console.log('[PROMPT-RENDERER] 🌐 COMPREHENSIVE DOM SNAPSHOT (placeholder render):', {
                //     segmentId: segment.id,
                //     messageContainer: messageContainer,
                //     allGrayElementsInMessage: Array.from(allGrayElements).map((el, index) => ({
                //         index,
                //         tagName: el.tagName,
                //         className: el.className,
                //         textContent: el.textContent?.slice(0, 100),
                //         boundingRect: (el as HTMLElement).getBoundingClientRect(),
                //         isVisible: (el as HTMLElement).offsetParent !== null,
                //         dataAttributes: Array.from(el.attributes).filter(attr => attr.name.startsWith('data-')).map(attr => `${attr.name}="${attr.value}"`),
                //         outerHTML: el.outerHTML.slice(0, 400)
                //     }))
                // });
            }
        }, 100); // Small delay to ensure DOM is updated
    })()}

    <div
        class="animate-pulse bg-gray-100 rounded-lg p-3 text-gray-500 text-sm"
        data-prompt-placeholder={segment.id}
        data-streaming-status={segment.streamingStatus}
    >
        Loading prompt...
    </div>
{:else}
    <!-- LOGGING: Track when button is shown -->
    <!-- {console.log('[PROMPT-RENDERER] 🟢 DOM: Rendering button for segment:', segment.id, {
        streamingStatus: segment.streamingStatus,
        rawContent: segment.rawContent,
        showPlaceholder,
        timestamp: new Date().toISOString()
    })} -->
    <Button
        onclick={handleClick}
        class="mb-2 mt-2 inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
        title="Click to use this prompt"
        data-prompt-button={segment.id}
        data-streaming-status={segment.streamingStatus}
        {disabled}
    >
        <MessageSquare class="w-4 h-4" />
        {segment.rawContent}
    </Button>
{/if}
