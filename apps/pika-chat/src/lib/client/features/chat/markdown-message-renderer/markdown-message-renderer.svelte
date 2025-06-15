<script lang="ts">
    import { getContext, onMount, tick } from 'svelte';
    import { StreamingMarkdownProcessor, hydrateComponents, MarkdownToHtmlGenerator } from './md-to-html-generator';
    import type { ParsedSegment } from './md-to-html-generator';

    // Import all tag components
    import PromptComponent from './markdown-tag-components/prompt.svelte';
    import ChartComponent from './markdown-tag-components/chart.svelte';
    import ImageComponent from './markdown-tag-components/image.svelte';
    import ChatComponent from './markdown-tag-components/chat.svelte';
    import DownloadComponent from './markdown-tag-components/download.svelte';
    import type { AppState } from '$client/app/app.state.svelte';
    import type { ChatMessageFile } from '@pika/shared/types/chatbot/chatbot-types';
    import { ChatAppState } from '../chat-app.state.svelte';

    interface Props {
        message: string;
        files: ChatMessageFile[];
        isStreaming?: boolean;
        chatAppState: ChatAppState;
    }

    let { message, isStreaming = false, chatAppState: chat }: Props = $props();
    const appState = getContext<AppState>('appState');

    // Create component map
    const componentMap = {
        prompt: PromptComponent,
        chart: ChartComponent,
        image: ImageComponent,
        chat: ChatComponent,
        download: DownloadComponent,
    };

    let messageContainer: HTMLElement;
    let processor: StreamingMarkdownProcessor | null = null;
    let staticGenerator: MarkdownToHtmlGenerator | null = null;
    let currentHtml = $state('');
    let segments: ParsedSegment[] = $state([]);
    let lastProcessedLength = 0;

    // Process static message (non-streaming)
    async function processStaticMessage(content: string) {
        if (!staticGenerator) {
            staticGenerator = new MarkdownToHtmlGenerator();
        }

        const result = staticGenerator.parseMarkdown(content);
        segments = result.segments;
        currentHtml = staticGenerator.combineSegments(result.segments);

        // Wait for DOM update, then hydrate components
        await tick();
        if (messageContainer && result.segments.some((s) => s.type === 'placeholder')) {
            hydrateComponents(messageContainer, result.segments, componentMap, chat, appState);
        }
    }

    // Process streaming message
    async function processStreamingMessage(content: string) {
        if (!processor) {
            processor = new StreamingMarkdownProcessor();
            lastProcessedLength = 0;
        }

        // Only process the new chunk
        const newChunk = content.slice(lastProcessedLength);
        if (newChunk) {
            const result = processor.processChunk(newChunk);
            segments = processor.getSegments();
            currentHtml = result.fullHtml;
            lastProcessedLength = content.length;

            // Hydrate any new components
            await tick();
            if (messageContainer && result.newSegments.some((s) => s.type === 'placeholder')) {
                hydrateComponents(messageContainer, result.newSegments, componentMap, chat, appState);
            }
        }
    }

    // Finalize streaming
    async function finalizeStreaming() {
        if (processor) {
            const result = processor.finalize();
            segments = result.finalSegments;
            currentHtml = result.fullHtml;

            // Final hydration pass
            await tick();
            if (messageContainer && segments.some((s) => s.type === 'placeholder')) {
                hydrateComponents(messageContainer, segments, componentMap, chat, appState);
            }

            // Reset for potential future streaming
            processor = null;
        }
    }

    // React to message changes
    $effect(() => {
        if (message) {
            if (isStreaming) {
                processStreamingMessage(message);
            } else {
                // Only process static message if we weren't streaming before
                // (processor will be null if we weren't streaming)
                if (!processor) {
                    processStaticMessage(message);
                }
            }
        }
    });

    // React to streaming state changes
    $effect(() => {
        // When streaming ends, finalize the processor
        if (!isStreaming && processor) {
            finalizeStreaming();
        }
    });

    // Cleanup when component unmounts
    onMount(() => {
        return () => {
            processor = null;
            staticGenerator = null;
        };
    });
</script>

<div bind:this={messageContainer} class="prose prose-gray max-w-none markdown-content">
    {@html currentHtml}
</div>

<style>
    /* Add styles for markdown content */
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

    /* Styles for tag placeholders during loading */
    :global(.markdown-tag-placeholder) {
        @apply my-2;
    }
</style>
