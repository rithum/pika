<script lang="ts">
    import { Copy } from '$icons/ci';
    import { ChevronRight, CircleCheck, Expand, Shrink } from '$icons/lucide';
    import TextWaveShimmer from '$ui/pika/text-wave-shimmer/text-wave-shimmer.svelte';
    import { Button } from '$ui/shadcn/button';
    import hljs from 'highlight.js';
    import 'highlight.js/styles/github-dark.css';
    import MarkdownIt from 'markdown-it';
    import type { ChatAppOverridableFeatures, ChatMessageForRendering } from 'pika-shared/types/chatbot/chatbot-types';
    import { toast } from 'svelte-sonner';
    import { v4 as uuidv4 } from 'uuid';
    import type { ChatAppState } from '../chat-app.state.svelte';

    interface Props {
        message: ChatMessageForRendering;
        features: ChatAppOverridableFeatures;
        chatAppState?: ChatAppState;
    }

    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        breaks: true,
        highlight: function (str: string, lang: string): string {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return (
                        '<pre class="hljs"><code>' +
                        hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                        '</code></pre>'
                    );
                } catch (__) {}
            }
            return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
        },
    });

    let { message, features, chatAppState }: Props = $props();

    const detailedTrace = $derived(features.traces.detailedTraces);
    const isContentAdmin = $derived(chatAppState?.userIsContentAdmin ?? false);
    let expandedTraces = $state<Record<string, boolean>>({});

    // TODO: Pull this from the correct user setting
    const dontGroupTraces = $derived(features.traceDontGroup?.value);
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

    /**
     * Recursively traverses an object and parses strings that start and end with {} as JSON
     * @param obj
     */
    function traverseAndParseStrings<T>(obj: T): T {
        // Handle null or undefined
        if (obj === null || obj === undefined) {
            return obj;
        }
        // Handle arrays
        if (Array.isArray(obj)) {
            return obj.map((item) => traverseAndParseStrings(item)) as T;
        }
        // Handle objects
        if (typeof obj === 'object') {
            const result = {} as T;
            for (const [key, value] of Object.entries(obj)) {
                (result as any)[key] = traverseAndParseStrings(value);
            }
            return result;
        }
        // Handle strings that start and end with {}
        if (typeof obj === 'string') {
            const trimmed = obj.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    // Parse the JSON string
                    const parsed = JSON.parse(trimmed);
                    // Recursively traverse the parsed object in case it contains more nested strings
                    return traverseAndParseStrings(parsed) as T;
                } catch (error) {
                    // If parsing fails, return the original string
                    //console.warn(`Failed to parse JSON string: ${trimmed}`, error);
                    return obj;
                }
            }
        }
        // Return primitive values as-is
        return obj;
    }

    /**
     * @returns [markdown, rawText]
     */
    function renderMarkdown(text: string | object, lang?: string): [string, string] {
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
            textString = JSON.stringify(traverseAndParseStrings(text), null, 2);
        } else {
            textString = text;
        }

        return [md.render(lang != null ? '```' + lang + '\n' + textString + '\n```\n' : textString), textString];
    }

    let filteredTraces = $derived.by(() => {
        const traces = message.traces;
        return (traces || [])
            .map((val) => {
                let md;
                let title;
                let isCode = false;
                let rawText = '';
                if (val.orchestrationTrace?.rationale?.text) {
                    [md, rawText] = renderMarkdown(val.orchestrationTrace?.rationale?.text);
                } else if (val.failureTrace?.failureReason) {
                    [md, rawText] = renderMarkdown(val.failureTrace.failureReason, 'plaintext');
                } else if (detailedTrace && val.orchestrationTrace?.invocationInput?.actionGroupInvocationInput) {
                    title = 'Parameters:';
                    isCode = true;
                    [md, rawText] = renderMarkdown(
                        val.orchestrationTrace?.invocationInput.actionGroupInvocationInput,
                        'json'
                    );
                } else if (detailedTrace && val.orchestrationTrace?.observation?.actionGroupInvocationOutput?.text) {
                    title = 'Response:';
                    isCode = true;
                    [md, rawText] = renderMarkdown(
                        val.orchestrationTrace?.observation.actionGroupInvocationOutput.text,
                        'try-json'
                    );
                } else if (detailedTrace && val.orchestrationTrace?.invocationInput?.agentCollaboratorInvocationInput) {
                    title = 'Parameters:';
                    isCode = true;
                    [md, rawText] = renderMarkdown(
                        val.orchestrationTrace?.invocationInput.agentCollaboratorInvocationInput,
                        'json'
                    );
                } else if (
                    detailedTrace &&
                    val.orchestrationTrace?.observation?.agentCollaboratorInvocationOutput?.output?.text
                ) {
                    title = 'Response:';
                    isCode = true;
                    [md, rawText] = renderMarkdown(
                        val.orchestrationTrace?.observation.agentCollaboratorInvocationOutput.output.text
                    );
                }
                return md
                    ? {
                          title,
                          markdown: md,
                          rawText,
                          ref: val,
                          isCode,
                          expanded: false,
                      }
                    : null;
            })
            .filter((a) => !!a);
    });

    type GroupedTrace =
        | {
              type: 'toolInvocation';
              title: string;
              id: string;
              parameters?: { markdown: string; rawText: string };
              response?: { markdown: string; rawText: string };
          }
        | {
              type: 'knowledgeBaseInvocation';
              title: string;
              id: string;
              parameters?: { markdown: string; rawText: string };
              response?: { markdown: string; rawText: string };
          }
        | {
              type: 'collaboratorInvocation';
              title: string;
              id: string;
              parameters?: { markdown: string; rawText: string };
              response?: { markdown: string; rawText: string };
          }
        | {
              type: 'text';
              title?: string;
              id: string;
              markdown: string;
              rawText: string;
          }
        | {
              type: 'verification';
              title?: string;
              id: string;
              grade: string;
          };

    function extractFunctionName(parametersRawText: string): string | null {
        try {
            // Try to parse as JSON first
            const parsed = JSON.parse(parametersRawText);
            if (parsed && typeof parsed === 'object' && 'function' in parsed && typeof parsed.function === 'string') {
                return parsed.function;
            }
        } catch (e) {
            // If JSON parsing fails, try to extract function name with regex
            // Look for "function": "functionName" pattern
            const functionMatch = parametersRawText.match(/"function"\s*:\s*"([^"]+)"/);
            if (functionMatch && functionMatch[1]) {
                return functionMatch[1];
            }
        }
        return null;
    }

    let groupedTraces = $derived.by(() => {
        const traces = message.traces || [];
        const grouped: GroupedTrace[] = [];
        const toolInvocations = new Map<
            string,
            GroupedTrace & { type: 'toolInvocation' | 'knowledgeBaseInvocation' | 'collaboratorInvocation' }
        >();
        const verificationTraces: GroupedTrace[] = [];

        // First pass: collect all traces and group tool invocations
        traces.forEach((val, index) => {
            if (val.orchestrationTrace?.rationale?.text) {
                const rationaleText = val.orchestrationTrace.rationale.text;

                // Check if this is a semantic directives trace (admin only)
                try {
                    const parsed = JSON.parse(rationaleText);
                    if (parsed.type === 'semantic-directives' && isContentAdmin) {
                        const directiveList = Array.isArray(parsed.directiveIds) 
                            ? parsed.directiveIds.join(', ') 
                            : String(parsed.directiveIds);
                        const [md, rawText] = renderMarkdown(
                            `**Applied Semantic Directives:** ${directiveList}`
                        );
                        grouped.push({
                            id: val.orchestrationTrace.rationale.traceId ?? 'semantic-directives',
                            type: 'text',
                            markdown: md,
                            rawText,
                        });
                        return; // Skip further processing for this trace
                    }
                } catch (e) {
                    // Not JSON or parsing failed, continue with normal processing
                }

                // Check if this is a verification trace
                const verificationMatch = rationaleText.match(/^(.*?Verified Response):\s+([A-Z])$/);
                const id = val.orchestrationTrace.rationale.traceId ?? rationaleText;

                if (verificationMatch) {
                    let a = dontGroupTraces ? grouped : verificationTraces;
                    a.push({
                        id,
                        type: 'verification',
                        title: verificationMatch[1].match(/correction/i)
                            ? 'Correction Verification'
                            : 'Response Verification',
                        grade: verificationMatch[2],
                    });
                } else {
                    const [md, rawText] = renderMarkdown(rationaleText);
                    grouped.push({
                        id: 'stuff',
                        type: 'text',
                        markdown: md,
                        rawText,
                    });
                }
            } else if (val.failureTrace?.failureReason) {
                const id = val.failureTrace.traceId ?? val.failureTrace.failureReason;
                const [md, rawText] = renderMarkdown(val.failureTrace.failureReason, 'plaintext');
                grouped.push({
                    id,
                    type: 'text',
                    markdown: md,
                    rawText,
                });
            } else if (detailedTrace && val.orchestrationTrace?.invocationInput?.agentCollaboratorInvocationInput) {
                // Parameters trace
                const [md, rawText] = renderMarkdown(
                    val.orchestrationTrace?.invocationInput.agentCollaboratorInvocationInput,
                    'json'
                );

                // Use index as a key to group related parameters and responses
                const key = `collaborator_${index}`;
                let toolInvocation = dontGroupTraces ? null : toolInvocations.get(key);

                if (!toolInvocation) {
                    const functionName =
                        val.orchestrationTrace?.invocationInput?.agentCollaboratorInvocationInput.agentCollaboratorName;
                    const id = val.orchestrationTrace.invocationInput.traceId ?? functionName ?? uuidv4();
                    toolInvocation = {
                        id,
                        type: 'collaboratorInvocation',
                        title: functionName ? `Invoking collaborator: ${functionName}` : 'Invoking collaborator...',
                    };
                    if (dontGroupTraces) {
                        grouped.push(toolInvocation);
                    } else {
                        toolInvocations.set(key, toolInvocation);
                    }
                }

                toolInvocation.parameters = { markdown: md, rawText };
            } else if (
                detailedTrace &&
                val.orchestrationTrace?.observation?.agentCollaboratorInvocationOutput?.output?.text
            ) {
                // Response trace - try to match with a previous parameters trace
                const [md, rawText] = renderMarkdown(
                    val.orchestrationTrace?.observation.agentCollaboratorInvocationOutput.output.text,
                    'try-json'
                );
                const id = val.orchestrationTrace.observation.traceId ?? uuidv4();

                // Look for a tool invocation that doesn't have a response yet
                let matchedToolInvocation = null;

                if (dontGroupTraces) {
                    matchedToolInvocation = grouped[grouped.length - 1];
                    if (matchedToolInvocation.type != 'collaboratorInvocation') {
                        matchedToolInvocation = null;
                    }
                } else {
                    for (const [key, toolInv] of toolInvocations) {
                        if (!toolInv.response) {
                            matchedToolInvocation = toolInv;
                            break;
                        }
                    }
                }

                if (matchedToolInvocation) {
                    matchedToolInvocation.response = { markdown: md, rawText };
                } else {
                    // Create a new tool invocation for orphaned response
                    const key = `collaborator_response_${index}`;
                    const toolInvocation: GroupedTrace & { type: 'collaboratorInvocation' } = {
                        id,
                        type: 'collaboratorInvocation',
                        title: 'Collaborator response',
                        response: { markdown: md, rawText },
                    };

                    if (dontGroupTraces) {
                        grouped.push(toolInvocation);
                    } else {
                        toolInvocations.set(key, toolInvocation);
                    }
                }
            } else if (detailedTrace && val.orchestrationTrace?.invocationInput?.actionGroupInvocationInput) {
                // Parameters trace
                const [md, rawText] = renderMarkdown(
                    val.orchestrationTrace?.invocationInput.actionGroupInvocationInput,
                    'json'
                );

                // Use index as a key to group related parameters and responses
                const key = `tool_${index}`;
                let toolInvocation = dontGroupTraces ? null : toolInvocations.get(key);

                if (!toolInvocation) {
                    const functionName = extractFunctionName(rawText);
                    const id = val.orchestrationTrace.invocationInput.traceId ?? functionName ?? uuidv4();
                    toolInvocation = {
                        id,
                        type: 'toolInvocation',
                        title: functionName ? `Invoking tool: ${functionName}` : 'Invoking tool...',
                    };
                    if (dontGroupTraces) {
                        grouped.push(toolInvocation);
                    } else {
                        toolInvocations.set(key, toolInvocation);
                    }
                }

                toolInvocation.parameters = { markdown: md, rawText };

                // Update title if we can extract function name
                const functionName = extractFunctionName(rawText);
                if (functionName) {
                    toolInvocation.title = `Invoking tool: ${functionName}`;
                }
            } else if (detailedTrace && val.orchestrationTrace?.observation?.actionGroupInvocationOutput?.text) {
                // Response trace - try to match with a previous parameters trace
                const [md, rawText] = renderMarkdown(
                    val.orchestrationTrace?.observation.actionGroupInvocationOutput.text,
                    'try-json'
                );
                const id = val.orchestrationTrace.observation.traceId ?? uuidv4();

                // Look for a tool invocation that doesn't have a response yet
                let matchedToolInvocation = null;

                if (dontGroupTraces) {
                    matchedToolInvocation = grouped[grouped.length - 1];
                    if (matchedToolInvocation.type != 'toolInvocation') {
                        matchedToolInvocation = null;
                    }
                } else {
                    for (const [key, toolInv] of toolInvocations) {
                        if (!toolInv.response) {
                            matchedToolInvocation = toolInv;
                            break;
                        }
                    }
                }

                if (matchedToolInvocation) {
                    matchedToolInvocation.response = { markdown: md, rawText };
                } else {
                    // Create a new tool invocation for orphaned response
                    const key = `tool_response_${index}`;
                    const toolInvocation: GroupedTrace & { type: 'toolInvocation' } = {
                        id,
                        type: 'toolInvocation',
                        title: 'Tool response',
                        response: { markdown: md, rawText },
                    };

                    if (dontGroupTraces) {
                        grouped.push(toolInvocation);
                    } else {
                        toolInvocations.set(key, toolInvocation);
                    }
                }
            } else if (detailedTrace && val.orchestrationTrace?.invocationInput?.knowledgeBaseLookupInput?.text) {
                const id = val.orchestrationTrace.invocationInput.traceId ?? uuidv4();
                // Parameters trace
                const [md, rawText] = renderMarkdown(
                    val.orchestrationTrace?.invocationInput?.knowledgeBaseLookupInput?.text,
                    'plaintext'
                );

                // Use index as a key to group related parameters and responses
                const key = `kb_${index}`;
                let kbInvocation = dontGroupTraces ? null : toolInvocations.get(key);

                if (!kbInvocation) {
                    const kbId = val.orchestrationTrace?.invocationInput?.knowledgeBaseLookupInput?.knowledgeBaseId;
                    kbInvocation = {
                        id,
                        type: 'knowledgeBaseInvocation',
                        title: kbId ? `Invoking Knowledge Base: ${kbId}` : 'Invoking Knowledge Base...',
                    };
                    if (dontGroupTraces) {
                        grouped.push(kbInvocation);
                    } else {
                        toolInvocations.set(key, kbInvocation);
                    }
                }

                kbInvocation.parameters = { markdown: md, rawText };
            } else if (
                detailedTrace &&
                val.orchestrationTrace?.observation?.knowledgeBaseLookupOutput?.retrievedReferences
            ) {
                const id = val.orchestrationTrace.observation.traceId ?? uuidv4();
                // Response trace - try to match with a previous parameters trace
                const [md, rawText] = renderMarkdown(
                    val.orchestrationTrace?.observation?.knowledgeBaseLookupOutput?.retrievedReferences,
                    'try-json'
                );

                // Look for a tool invocation that doesn't have a response yet
                let matchedKbInvocation = null;

                if (dontGroupTraces) {
                    matchedKbInvocation = grouped[grouped.length - 1];
                    if (matchedKbInvocation.type != 'knowledgeBaseInvocation') {
                        matchedKbInvocation = null;
                    }
                } else {
                    for (const [key, toolInv] of toolInvocations) {
                        if (!toolInv.response) {
                            matchedKbInvocation = toolInv;
                            break;
                        }
                    }
                }

                if (matchedKbInvocation) {
                    matchedKbInvocation.response = { markdown: md, rawText };
                } else {
                    // Create a new tool invocation for orphaned response
                    const key = `kb_response_${index}`;
                    const toolInvocation: GroupedTrace & { type: 'knowledgeBaseInvocation' } = {
                        id,
                        type: 'knowledgeBaseInvocation',
                        title: 'Knowledge Base response',
                        response: { markdown: md, rawText },
                    };

                    if (dontGroupTraces) {
                        grouped.push(toolInvocation);
                    } else {
                        toolInvocations.set(key, toolInvocation);
                    }
                }
            }
        });

        // Add tool invocations to the grouped array
        toolInvocations.forEach((toolInvocation) => {
            grouped.push(toolInvocation);
        });

        // Add verification traces at the end
        grouped.push(...verificationTraces);

        return grouped;
    });
</script>

{#if groupedTraces.length > 0 || isStreaming}
    <div class="border border-gray-200 rounded-lg bg-gray-25 p-4 my-4">
        {#if groupedTraces.length > 0}
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
                {#each groupedTraces as trace, index}
                    <div class="flex gap-2 {index < groupedTraces.length ? 'pb-2' : ''}">
                        <!-- Left column: Icon and vertical line -->
                        <div class="flex flex-col items-center w-6 relative left-[-4px] top-[3px]">
                            <div class="flex-shrink-0">
                                <div class="bg-gray-700 rounded-full mt-2" style="width: 0.4rem; height: 0.4rem;"></div>
                            </div>
                            <div class="w-px bg-gray-300 mt-2 flex-1 min-h-3"></div>
                        </div>

                        <!-- Right column: Content -->
                        <div
                            class="prose prose-sm prose-gray flex-1 text-md text-gray-600 pt-1 relative left-[-2px] max-w-[42rem]"
                        >
                            {#if trace.type === 'toolInvocation' || trace.type === 'knowledgeBaseInvocation' || trace.type === 'collaboratorInvocation'}
                                {@render toolInvocationTrace(trace)}
                            {:else if trace.type === 'verification'}
                                {@render verificationTrace(trace)}
                            {:else}
                                {@render textTrace(trace)}
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

{#snippet textTrace(trace: GroupedTrace & { type: 'text' })}
    {#if trace.title}
        <div>{trace.title}</div>
    {/if}
    {@html trace.markdown}
{/snippet}

{#snippet verificationTrace(trace: GroupedTrace & { type: 'verification' })}
    <div class="border border-slate-200 rounded-lg p-4 mt-2 {expandedTraces[trace.id] ? 'pb-4' : 'pb-2'}">
        <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-3">
                <div class="flex items-center gap-2">
                    <span class="font-medium text-slate-700">{trace.title ?? 'Response Verification'}</span>
                </div>
                <div
                    class={`px-2 py-1 rounded text-sm font-medium ${
                        trace.grade === 'A'
                            ? 'bg-green-100 text-green-800'
                            : trace.grade === 'B'
                              ? 'bg-yellow-100 text-yellow-800'
                              : trace.grade === 'C'
                                ? 'bg-orange-100 text-orange-800'
                                : trace.grade === 'F'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                    }`}
                >
                    Grade {trace.grade}
                </div>
            </div>
            <button
                class="text-slate-500 hover:text-slate-700 transition-colors"
                onclick={() => {
                    if (expandedTraces[trace.id]) {
                        delete expandedTraces[trace.id];
                    } else {
                        expandedTraces[trace.id] = true;
                    }
                    console.log('expandedTraces', expandedTraces);
                }}
            >
                <ChevronRight
                    class="w-4 h-4 transition-transform duration-200 {expandedTraces[trace.id] ? 'rotate-90' : ''}"
                />
            </button>
        </div>

        <div class="text-sm text-gray-400 mb-2">
            {#if trace.grade === 'A'}
                This response is factually accurate
            {:else if trace.grade === 'B'}
                This response is accurate but contains stated assumptions
            {:else if trace.grade === 'C'}
                This response is accurate but contains unstated assumptions
            {:else if trace.grade === 'U'}
                This response was not verified
            {:else}
                This response contains inaccurate information
            {/if}
        </div>

        {#if expandedTraces[trace.id]}
            <div class="mt-3 pt-3 border-t border-slate-200 text-sm text-slate-600">
                <div class="font-medium mb-2">Verification Scale:</div>
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">A</span>
                        <span>Factually accurate</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">B</span>
                        <span>Accurate with stated assumptions</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800">C</span>
                        <span>Accurate with unstated assumptions</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">F</span>
                        <span>Inaccurate or contains made up information</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">U</span>
                        <span>Response was not verified</span>
                    </div>
                </div>
            </div>
        {/if}
    </div>
{/snippet}

{#snippet toolInvocationTrace(
    trace: GroupedTrace & { type: 'toolInvocation' | 'knowledgeBaseInvocation' | 'collaboratorInvocation' }
)}
    <div class="font-medium text-gray-700 mb-3">{trace.title}</div>

    {#if trace.parameters}
        {@render codeSection('Request Parameters', trace.parameters, trace, 'parameters')}
    {/if}

    {#if trace.response}
        {@render codeSection('Response', trace.response, trace, 'response')}
    {/if}
{/snippet}

{#snippet codeSection(
    title: string,
    content: { markdown: string; rawText: string },
    trace: GroupedTrace & { type: 'toolInvocation' | 'knowledgeBaseInvocation' | 'collaboratorInvocation' },
    section: 'parameters' | 'response'
)}
    <div class="mb-4">
        <div
            class="text-sm font-medium text-gray-600 mb-2 flex justify-between relative mt-[-30px] top-[33px] items-center"
        >
            <div>{title}</div>
            <div class="buttons flex">
                <Button
                    onclick={() => {
                        navigator.clipboard.writeText(content.rawText);
                        toast.info('Copied to clipboard', { duration: 1500 });
                    }}
                    variant="ghost"
                    size="icon"
                >
                    <Copy class="w-4 h-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onclick={() => {
                        if (expandedTraces[trace.id]) {
                            delete expandedTraces[trace.id];
                        } else {
                            expandedTraces[trace.id] = true;
                        }
                    }}
                >
                    {#if expandedTraces[trace.id]}
                        <Shrink class="w-4 h-4" />
                    {:else}
                        <Expand class="w-4 h-4" />
                    {/if}
                </Button>
            </div>
        </div>
        <div
            class={`code-block flex flex-col transition-all duration-300 overflow-hidden ${expandedTraces[trace.id] ? '' : 'max-h-64'}`}
        >
            {@html content.markdown}
            {#if expandedTraces[trace.id]}
                <div class="buttons flex relative mt-[-20px]">
                    <Button
                        variant="ghost"
                        size="icon"
                        onclick={() => {
                            if (expandedTraces[trace.id]) {
                                delete expandedTraces[trace.id];
                            } else {
                                expandedTraces[trace.id] = true;
                            }
                        }}
                    >
                        {#if expandedTraces[trace.id]}
                            <Shrink class="w-4 h-4" />
                        {:else}
                            <Expand class="w-4 h-4" />
                        {/if}
                    </Button>
                </div>
            {/if}
        </div>
    </div>
{/snippet}

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
