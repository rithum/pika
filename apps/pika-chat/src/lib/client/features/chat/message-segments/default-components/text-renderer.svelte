<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import MarkdownIt from 'markdown-it';
    import type { ChatAppState } from '../../chat-app.state.svelte';
    import type { ProcessedTextSegment } from '../segment-types';

    interface Props {
        segment: ProcessedTextSegment;
        appState: AppState;
        chatAppState: ChatAppState;
    }

    let { segment, appState, chatAppState }: Props = $props();

    // Initialize markdown-it with the same config as the old generator
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        breaks: true,
    });

    // Convert markdown to HTML
    let htmlContent = $derived(md.render(segment.rawContent));

    let container: HTMLElement | undefined = $state(undefined);

    // LOGGING: Track prop changes
    // $effect(() => {
    //     console.log('[TEXT-RENDERER] Props updated:', {
    //         rawContentLength: segment.rawContent.length,
    //         rawContentPreview: segment.rawContent.slice(0, 100) + (segment.rawContent.length > 100 ? '...' : ''),
    //         isStreaming: segment.streamingStatus === 'streaming',
    //         htmlContentLength: htmlContent.length
    //     });
    // });

    // LOGGING: Track HTML content changes
    // $effect(() => {
    //     console.log('[TEXT-RENDERER] HTML content changed:', {
    //         rawContentLength: segment.rawContent.length,
    //         htmlContentLength: htmlContent.length,
    //         htmlPreview: htmlContent.slice(0, 100) + (htmlContent.length > 100 ? '...' : ''),
    //         isStreaming: segment.streamingStatus === 'streaming',
    //     });
    // });

    // Update container HTML when content changes
    $effect(() => {
        // console.log('[TEXT-RENDERER] Updating container HTML:', {
        //     hasContainer: !!container,
        //     htmlContentLength: htmlContent.length,
        //     isStreaming: segment.streamingStatus === 'streaming',
        // });

        if (container && htmlContent) {
            container.innerHTML = htmlContent;
            // console.log('[TEXT-RENDERER] Container HTML updated');
        }
    });

    // LOGGING: Track container element binding
    // $effect(() => {
    //     console.log('[TEXT-RENDERER] Container element changed:', {
    //         hasContainer: !!container
    //     });
    // });

    // DEBUGGING: Track segment status vs isStreaming discrepancies
    // $effect(() => {
    //     const segmentStreaming = segment.streamingStatus === 'streaming';

    //     console.log('[TEXT-RENDERER] 📋 STATUS CHECK:', {
    //         segmentId: segment.id,
    //         segmentStreamingStatus: segment.streamingStatus,
    //         segmentStreamingBool: segmentStreaming,
    //         rawContentLength: segment.rawContent.length,
    //         timestamp: new Date().toISOString()
    //     });
    // });

    // Check if we should render anything (skip whitespace-only content)
    // const shouldRender = $derived(() => {
    //     const trimmed = segment.rawContent.trim();
    //     const hasContent = trimmed.length > 0;

    //     if (!hasContent) {
    //         console.log('[TEXT-RENDERER] Skipping render - no meaningful content:', {
    //             rawContent: JSON.stringify(segment.rawContent),
    //             rawContentLength: segment.rawContent.length
    //         });
    //     }

    //     return hasContent;
    // });

    // DEBUGGING: Log when this text renderer creates streaming elements
    // $effect(() => {
    //     if (container && segment.streamingStatus === 'streaming') {
    //         console.log('[TEXT-RENDERER] 🔍 STREAMING ELEMENT DETAILS:', {
    //             segmentId: segment.id,
    //             containerElement: container,
    //             boundingRect: container.getBoundingClientRect(),
    //             hasStreamingClass: container.classList.contains('streaming'),
    //             computedStyle: {
    //                 backgroundColor: getComputedStyle(container).backgroundColor,
    //                 position: getComputedStyle(container).position,
    //                 display: getComputedStyle(container).display
    //             },
    //             pseudoElementAfter: {
    //                 content: getComputedStyle(container, '::after').content,
    //                 backgroundColor: getComputedStyle(container, '::after').backgroundColor,
    //                 width: getComputedStyle(container, '::after').width,
    //                 height: getComputedStyle(container, '::after').height
    //             },
    //             parentElement: container.parentElement?.tagName,
    //             nextSibling: container.nextElementSibling?.tagName,
    //             previousSibling: container.previousElementSibling?.tagName,
    //             innerHTML: container.innerHTML.slice(0, 200)
    //         });
    //     }
    // });
</script>

{#if segment.rawContent.trim() !== ''}
    <div
        bind:this={container}
        class="prose prose-gray max-w-none markdown-content"
        class:streaming={segment.streamingStatus === 'streaming'}
    >
        <!-- LOGGING: Track when div is rendered -->
        <!-- {console.log('[TEXT-RENDERER] Rendering div:', { isStreaming: segment.streamingStatus === 'streaming', rawContentLength: segment.rawContent.length })} -->
        <!-- HTML content will be injected here -->
    </div>
{:else}
    <!-- LOGGING: Track when content is skipped -->
    <!-- {console.log('[TEXT-RENDERER] Skipping render - no meaningful content:', { rawContent: JSON.stringify(segment.rawContent), rawContentLength: segment.rawContent.length })} -->
{/if}

<style>
    /* Modern CSS - no PostCSS processing needed! */
    /* Add styles for markdown content - copied from markdown-message-renderer.svelte */
    :global(.markdown-content) {
        word-break: break-word;
    }

    :global(.markdown-content pre) {
        border-radius: 0.375rem; /* rounded */
        padding: 1rem; /* p-4 */
        overflow-x: auto; /* overflow-x-auto */
    }

    :global(.markdown-content pre code) {
        background-color: transparent; /* bg-transparent */
        padding: 0; /* p-0 */
    }

    :global(.markdown-content code) {
        background-color: var(--color-gray-100); /* bg-gray-100 */
        border-radius: 0.25rem; /* rounded */
        padding: 0.125rem 0.25rem; /* py-0.5 px-1 */
        font-size: 0.875rem; /* text-sm */
        line-height: 1.25rem; /* text-sm line-height */
    }

    :global(.markdown-content blockquote) {
        border-left: 4px solid var(--color-gray-300); /* border-l-4 border-gray-300 */
        padding-left: 1rem; /* pl-4 */
        font-style: italic; /* italic */
    }

    :global(.markdown-content table) {
        width: 100%; /* w-full */
        border-collapse: collapse; /* border-collapse */
    }

    :global(.markdown-content th),
    :global(.markdown-content td) {
        border: 1px solid var(--color-gray-300); /* border border-gray-300 */
        padding: 0.5rem 0.75rem; /* py-2 px-3 */
    }

    :global(.markdown-content th) {
        background-color: var(--color-gray-100); /* bg-gray-100 */
        font-weight: 600; /* font-semibold */
    }

    /* Streaming indicator styles */
    .streaming {
        position: relative; /* relative */

        &::after {
            content: '';
            display: inline-block; /* inline-block */
            width: 0.5rem; /* w-2 */
            height: 1rem; /* h-4 */
            background-color: var(--color-gray-400); /* bg-gray-400 */
            opacity: 0.75; /* opacity-75 */
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; /* animate-pulse */
            margin-left: 0.25rem; /* ml-1 */
        }
    }
</style>
