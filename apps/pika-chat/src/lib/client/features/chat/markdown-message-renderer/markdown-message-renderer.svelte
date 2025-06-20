<script lang="ts">
    import { getContext, onMount, tick } from 'svelte';
    import { StreamingMarkdownProcessor, hydrateComponents, MarkdownToHtmlGenerator } from './md-to-html-generator';
    import type { ParsedSegment } from './md-to-html-generator';

    // Import all tag components
    import TraceComponent from './markdown-tag-components/trace.svelte';
    import PromptComponent from './markdown-tag-components/prompt.svelte';
    import ChartComponent from './markdown-tag-components/chart.svelte';
    import ImageComponent from './markdown-tag-components/image.svelte';
    import ChatComponent from './markdown-tag-components/chat.svelte';
    import DownloadComponent from './markdown-tag-components/download.svelte';
    import type { AppState } from '$client/app/app.state.svelte';
    import type { ChatMessage, ChatMessageFile } from '@pika/shared/types/chatbot/chatbot-types';
    import { ChatAppState } from '../chat-app.state.svelte';

    interface Trace {
        failureTrace?:{
            failureReason:string;
        };
        orchestrationTrace?:{
            rationale:{
                text:string;
            };
            observation?:{
                actionGroupInvocationOutput?:{
                    text:string;
                }
            };
            modelInvocationOutput?:{}
            invocationInput?:{
                actionGroupInvocationInput:string
            }
        }
    }

    interface IsVisible {
        isVisible?:boolean
    }

    interface Props {
        chatMessage:Omit<ChatMessage, "traces"> & {traces: (Trace & IsVisible)[]};
        message: string;
        files: ChatMessageFile[];
        isStreaming?: boolean;
        chatAppState: ChatAppState;
    }

    let { chatMessage =$bindable(), message, isStreaming = false, chatAppState: chat }: Props = $props();
    const appState = getContext<AppState>('appState');

    chatMessage.traces = chatMessage.traces ?? [];
    // Create component map
    const componentMap = {
        prompt: PromptComponent,
        chart: ChartComponent,
        image: ImageComponent,
        chat: ChatComponent,
        download: DownloadComponent,
        trace: TraceComponent
    };

    let messageContainer: HTMLElement;
    let processor: StreamingMarkdownProcessor | null = null;
    let staticGenerator: MarkdownToHtmlGenerator | null = null;
    let currentHtml = $state('');
    let segments: ParsedSegment[] = $state([]);
    let lastProcessedLength = 0;
    let showThinking = $state(false);


    /**
     * Markdown renders for simple text without tags
     * @param text
     * @param lang
     */
    function markdown(text:string|undefined, lang?:string){
        if (!staticGenerator) {
            staticGenerator = new MarkdownToHtmlGenerator();
        }


        let textString: string;


        if (lang === "try-json") {
            lang = "plaintext"; // Set to text as an assumption
            if (typeof text === "string") {
                try {
                    text = JSON.parse(text);
                    // Check the type of the parsed response 
                    lang = typeof text === "object" ? "json" : "plaintext";
                } catch (e) {
                    // Couldn't parse it
                }
            }
        }

        if (typeof text == "object") {
            // text is now an object so switch to JSON
            lang = "json";
            textString = JSON.stringify(text, null, 2);
        } else {
            textString = text ?? "";
        }

        // Render the results with the desired lang
        let result =  staticGenerator.parseMarkdown(lang != null
        ? ("```" + lang + "\n" + textString + "\n```\n")
        : textString);

        let currentHtml = staticGenerator.combineSegments(result.segments);

        return currentHtml;
    }

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
            hydrateComponents(messageContainer, result.segments, componentMap, chat, appState, chatMessage as ChatMessage);
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
                hydrateComponents(messageContainer, result.newSegments, componentMap, chat, appState, chatMessage as ChatMessage);
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
                hydrateComponents(messageContainer, segments, componentMap, chat, appState, chatMessage as ChatMessage);
            }

            // Reset for potential future streaming
            processor = null;
        }
    }


    function isTraceVisible(trace: Trace & IsVisible): boolean {
        return trace.isVisible ?? !isLongTrace(trace)
    }
    function toggleTrace(trace: Trace & IsVisible) {
        trace.isVisible = !isTraceVisible(trace as {});
    }

    function isLongTrace(trace: Trace) {
        if (trace.orchestrationTrace?.observation?.actionGroupInvocationOutput?.text) {
            return trace.orchestrationTrace.observation.actionGroupInvocationOutput.text.length > 1000
        }
        return false;
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
    <div class="message-thinking-container">
    <button class="trace-btn" onclick={()=>{showThinking = !showThinking}}>
        {#if !showThinking}
            Show Thinking
        {:else}
            Hide Thinking
        {/if}
    </button>
    {#if showThinking}
    {#each chatMessage.traces.filter(t=>t.orchestrationTrace?.modelInvocationOutput == null) as trace}
    
        <div class="message-thinking-text message-content-text-container">
        {#if isLongTrace(trace)}
            <button class="trace-btn" onclick={()=>toggleTrace(trace)}>
                {#if !isTraceVisible(trace)}
                    Show Trace
                {:else}
                    Hide Trace
                {/if}
            </button>
        {/if}
        {#if isTraceVisible(trace)}

            {#if trace.orchestrationTrace?.rationale}
                <div class="message-thinking-rationale">
                    {@html markdown(trace.orchestrationTrace?.rationale.text)}
                </div>
            {:else if trace.failureTrace}
                <div class="message-thinking-failure">
                    <div>Error:</div>
                    <div>{@html markdown(trace.failureTrace.failureReason, 'plaintext')}</div>
                </div>
            {:else if trace.orchestrationTrace?.invocationInput}
                <div class="message-thinking-invocation">
                    <div>Parameters:</div>
                    <div>{@html markdown(trace.orchestrationTrace?.invocationInput.actionGroupInvocationInput, 'json')}</div>
                </div>
            {:else if trace.orchestrationTrace?.observation?.actionGroupInvocationOutput}
                <div class="message-thinking-observation">
                    <div>Response:</div>
                    <div>{@html markdown(trace.orchestrationTrace?.observation.actionGroupInvocationOutput.text, 'try-json')}</div>
                </div>
            {/if}
        {/if}
        
        </div>
    {/each}
    {/if}
    </div>
    {@html currentHtml}
</div>

<style>
    /* Add styles for markdown content */
    :global(.markdown-content) {
        word-break: break-word;
    }

    :global(.markdown-content pre) {
        @apply rounded p-4 overflow-x-auto;
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


    .message-thinking-text {
        padding-left: 0.8rem;
        border-left: solid gold;
        margin-bottom: 0.8rem;
    }

    /* .message-thinking-text>div {
        padding-left: 0.8rem;
        border-left: solid gold;
    } */

    .message-thinking-rationale {}

    .message-thinking-text:has(.message-thinking-failure) {
        border-left: solid red;
    }

    .message-thinking-container {
        margin-top: 0.3rem;
        margin-bottom: .5rem;
        border-bottom: solid .01rem;
        padding-bottom: .5rem;
    }

    .trace-btn {
        background: white;
        border: 2px solid #e0e0e0;
        border-radius: 25px;
        padding: 1px 10px;
        font-size: 14px;
        font-weight: 500;
        color: #333;
        cursor: pointer;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        position: relative;
        overflow: hidden;
    }

    .trace-btn:hover {
        border-color: #007bff;
        background: #f8f9ff;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 123, 255, 0.15);
    }

    .trace-btn:active {
        transform: translateY(0);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
</style>
