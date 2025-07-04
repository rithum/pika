<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import type { ChatMessageForRendering } from '@pika/shared/types/chatbot/chatbot-types';
    import { ChevronRight, CircleCheck } from '$icons/lucide';
    import TextWaveShimmer from '$lib/components/ui-pika/text-wave-shimmer/text-wave-shimmer.svelte';
    import MarkdownIt from 'markdown-it';

    interface Props {
        message: ChatMessageForRendering;
        appState: AppState;
    }

    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        breaks: true,
    });

    // const mockTraces: ChatMessageForRendering['traces'] = [
    //     {
    //         orchestrationTrace: {
    //             modelInvocationOutput: {
    //                 metadata: {
    //                     clientRequestId: '02382387-6c69-44e9-b03d-f2a7f4c12531',
    //                     endTime: '2025-06-16T20:46:56.472223941Z' as unknown as Date,
    //                     startTime: '2025-06-16T20:46:52.307705519Z' as unknown as Date,
    //                     totalTimeMs: 4165,
    //                     usage: {
    //                         inputTokens: 5136,
    //                         outputTokens: 108,
    //                     },
    //                 },
    //                 traceId: '83dd27a0-4d30-43e9-bf64-1fa6ea6bb210-0',
    //             },
    //         },
    //     },
    //     {
    //         orchestrationTrace: {
    //             rationale: {
    //                 text: "I'll need to:\n1. Get the current date first to calculate the 30-day range\n2. Get order statistics for meaningful insights\n3. Get returns and invoice data for a complete picture\n4. Structure the data in a clear, actionable format",
    //                 traceId: '83dd27a0-4d30-43e9-bf64-1fa6ea6bb210-0',
    //             },
    //         },
    //     },
    //     {
    //         orchestrationTrace: {
    //             modelInvocationOutput: {
    //                 metadata: {
    //                     clientRequestId: '73d417fa-30e6-4534-a438-790f64675b5a',
    //                     endTime: '2025-06-16T20:47:02.955683834Z' as unknown as Date,
    //                     startTime: '2025-06-16T20:46:57.767022899Z' as unknown as Date,
    //                     totalTimeMs: 5188,
    //                     usage: {
    //                         inputTokens: 5269,
    //                         outputTokens: 119,
    //                     },
    //                 },
    //                 traceId: '83dd27a0-4d30-43e9-bf64-1fa6ea6bb210-1',
    //             },
    //         },
    //     },
    //     {
    //         orchestrationTrace: {
    //             rationale: {
    //                 text: "Now I'll get the order statistics for the past 30 days using this date range. I'll use daily intervals for the trend analysis.",
    //                 traceId: '83dd27a0-4d30-43e9-bf64-1fa6ea6bb210-1',
    //             },
    //         },
    //     },
    //     {
    //         orchestrationTrace: {
    //             modelInvocationOutput: {
    //                 metadata: {
    //                     clientRequestId: '66c69700-efee-4838-b017-e6bb0dfd45c6',
    //                     endTime: '2025-06-16T20:47:32.082139646Z' as unknown as Date,
    //                     startTime: '2025-06-16T20:47:27.278739063Z' as unknown as Date,
    //                     totalTimeMs: 4804,
    //                     usage: {
    //                         inputTokens: 12966,
    //                         outputTokens: 105,
    //                     },
    //                 },
    //                 traceId: '83dd27a0-4d30-43e9-bf64-1fa6ea6bb210-2',
    //             },
    //         },
    //     },
    //     {
    //         orchestrationTrace: {
    //             rationale: {
    //                 text: 'Let me analyze the returns data for the same period to get a complete picture.',
    //                 traceId: '83dd27a0-4d30-43e9-bf64-1fa6ea6bb210-2',
    //             },
    //         },
    //     },
    //     {
    //         orchestrationTrace: {
    //             modelInvocationOutput: {
    //                 metadata: {
    //                     clientRequestId: '512b5e26-82d5-4f87-a912-56b8108ff1bb',
    //                     endTime: '2025-06-16T20:47:44.918223111Z' as unknown as Date,
    //                     startTime: '2025-06-16T20:47:32.210752982Z' as unknown as Date,
    //                     totalTimeMs: 12708,
    //                     usage: {
    //                         inputTokens: 15358,
    //                         outputTokens: 625,
    //                     },
    //                 },
    //                 traceId: '83dd27a0-4d30-43e9-bf64-1fa6ea6bb210-3',
    //             },
    //         },
    //     },
    //     {
    //         orchestrationTrace: {
    //             rationale: {
    //                 text: 'Let me compile this data into a clear performance overview for the last 30 days.',
    //                 traceId: '83dd27a0-4d30-43e9-bf64-1fa6ea6bb210-3',
    //             },
    //         },
    //     },
    // ];

    let { message, appState }: Props = $props();

    let expanded = $state(true);
    let isStreaming = $derived(message.isStreaming === true);
    let haveActualMessageContent = $derived.by(() => {
        return (
            message.segments.length > 0 &&
            message.segments.some((segment) => {
                return segment.segmentType === 'text' || (segment.segmentType === 'tag' && segment.tag !== 'trace');
            })
        );
    });

    function renderMarkdown(text: string | object, lang?: string) {
        let textString: string;

        if (lang === 'try-json') {
            lang = 'plaintext';
            if (typeof text === 'string') {
                try {
                    text = JSON.parse(text);
                    // Check the type of the parsed response
                    lang = typeof text === 'object' ? 'json' : 'plaintext';
                } catch (e) {
                    // Couldn't parse it
                }
            }
        }

        if (typeof text == 'object') {
            lang = 'json';
            textString = JSON.stringify(text, null, 2);
        } else {
            textString = text;
        }

        return md.render(lang != null ? '```' + lang + '\n' + textString + '\n```\n' : textString);
    }

    let detailedTrace = appState.identity?.user?.features?.trace?.trace == 'detailed';
    message.traces?.forEach((trace) => {
        if (detailedTrace && trace.orchestrationTrace?.observation?.actionGroupInvocationOutput?.text) {
            trace.collapsed = trace.orchestrationTrace?.observation.actionGroupInvocationOutput.text.length > 1000;
            trace.collapsable = trace.collapsed;
        }
    });
    let filteredTraces = $derived.by(() => {
        const traces = message.traces;
        return (traces || [])
            .map((val) => {
                let md;
                let title;
                if (val.orchestrationTrace?.rationale?.text) {
                    md = renderMarkdown(val.orchestrationTrace?.rationale?.text);
                } else if (val.failureTrace?.failureReason) {
                    md = renderMarkdown(val.failureTrace.failureReason, 'plaintext');
                } else if (detailedTrace && val.orchestrationTrace?.invocationInput?.actionGroupInvocationInput) {
                    title = 'Parameters:';
                    md = renderMarkdown(val.orchestrationTrace?.invocationInput.actionGroupInvocationInput, 'json');
                } else if (detailedTrace && val.orchestrationTrace?.observation?.actionGroupInvocationOutput?.text) {
                    title = 'Response:';
                    md = renderMarkdown(
                        val.orchestrationTrace?.observation.actionGroupInvocationOutput.text,
                        'try-json'
                    );
                }
                return md
                    ? {
                          title,
                          markdown: md,
                          ref: val,
                      }
                    : null;
            })
            .filter((a) => !!a);
    });
</script>

{#if filteredTraces.length > 0 || isStreaming}
    <div class="border border-gray-200 rounded-lg bg-gray-25 p-4 my-4">
        {#if filteredTraces.length > 0}
            <!-- Clickable header -->
            <button
                class="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors w-full text-left"
                onclick={() => (expanded = !expanded)}
            >
                <ChevronRight class="w-4 h-4 transition-transform duration-200 {expanded ? 'rotate-90' : ''}" />
                <TextWaveShimmer disabled={!isStreaming || haveActualMessageContent}>Answer reasoning</TextWaveShimmer>
            </button>
        {:else}
            <TextWaveShimmer>Reasoning about the answer...</TextWaveShimmer>
        {/if}

        <!-- Expandable content -->
        {#if expanded}
            <div class="mt-4">
                {#each filteredTraces as trace, index}
                    <div class="flex gap-2 {index < filteredTraces.length ? 'pb-2' : ''}">
                        <!-- Left column: Icon and vertical line -->
                        <div class="flex flex-col items-center w-6 relative left-[-4px] top-[3px]">
                            <div class="flex-shrink-0">
                                <div class="bg-gray-700 rounded-full mt-2" style="width: 0.4rem; height: 0.4rem;"></div>
                            </div>
                            <div class="w-px bg-gray-300 mt-2 flex-1 min-h-3"></div>
                        </div>

                        <!-- Right column: Text content -->
                        <div class="prose prose-sm prose-gray flex-1 text-md text-gray-600 pt-1 relative left-[-2px]">
                            {#if trace.ref.collapsable}
                                <button
                                    onclick={() => (trace.ref.collapsed = !trace.ref.collapsed)}
                                    class="thinking-step-btn"
                                >
                                    {#if trace.ref.collapsed}
                                        Expand
                                    {:else}
                                        Collapse
                                    {/if}
                                </button>
                            {/if}
                            {#if !trace.ref.collapsed}
                                {#if trace.title}
                                    <div>{trace.title}</div>
                                {/if}
                                {@html trace.markdown}
                            {/if}
                        </div>
                    </div>
                {/each}

                <!-- Final "Done" entry -->
                {#if haveActualMessageContent}
                    <div class="flex gap-4 items-start items-center pt-2">
                        <!-- Left column: CircleCheck icon -->
                        <div class="flex flex-col items-center">
                            <CircleCheck class="w-4 h-4 text-gray-700" />
                        </div>

                        <div class="flex-1 text-md text-gray-600">Done</div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
{/if}

<style>
    .thinking-step-btn {
        background: white;
        border: 2px solid #e0e0e0;
        border-radius: 25px;
        padding: 5px 24px;
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
    }

    .thinking-step-btn:hover {
        border-color: #007bff;
        background: #f8f9ff;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 123, 255, 0.15);
    }
</style>
