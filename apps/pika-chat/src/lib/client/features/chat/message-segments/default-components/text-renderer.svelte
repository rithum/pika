<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import type { ChatAppState } from '../../chat-app.state.svelte';
    import MarkdownIt from 'markdown-it';
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

<style lang="postcss">
    /* TODO: find a better set of styles for this and a better way to do it. */
    /* Add styles for markdown content - copied from markdown-message-renderer.svelte */
    :global(.markdown-content) {
        word-break: break-word;
    }
    
    :global(.markdown-content pre) {
        @apply bg-gray-100 rounded p-4 overflow-x-auto;
    }

    
    :global(.markdown-content code) {
        @apply bg-gray-100 rounded px-1 py-0.5 text-sm;
    }

    
    :global(.markdown-content pre code) {
        @apply bg-transparent p-0;
    }

    
    :global(.markdown-content blockquote) {
        @apply border-l-4 border-gray-300 pl-4 italic;
    }

    
    :global(.markdown-content table) {
        @apply w-full border-collapse;
    }

    
    :global(.markdown-content th),
    :global(.markdown-content td) {
        @apply border border-gray-300 px-3 py-2;
    }

    
    :global(.markdown-content th) {
        @apply bg-gray-100 font-semibold;
    }

    /* Streaming indicator styles */
    
    .streaming {
        @apply relative;
    }

    
    .streaming::after {
        content: '';
        @apply inline-block w-2 h-4 bg-gray-400 opacity-75 animate-pulse ml-1;
    }
</style>
