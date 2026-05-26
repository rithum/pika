<script lang="ts">
    import Copy from '$icons/ci/copy';
    import ChevronRight from '$icons/lucide/chevron-right';
    import CircleCheck from '$icons/lucide/circle-check';
    import Expand from '$icons/lucide/expand';
    import Maximize2 from '$icons/lucide/maximize-2';
    import Shrink from '$icons/lucide/shrink';
    import { gunzipBase64EncodedString } from '$lib/client/util';
    import hljs from 'highlight.js';
    import 'highlight.js/styles/github-dark.css';
    import MarkdownIt from 'markdown-it';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { ChatAppOverridableFeatures, ChatMessageForRendering } from 'pika-shared/types/chatbot/chatbot-types';
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import TextWaveShimmer from 'pika-ux/pika/text-wave-shimmer/text-wave-shimmer.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import { getContext } from 'svelte';
    import { toast } from 'svelte-sonner';
    import { v4 as uuidv4 } from 'uuid';
    import type { ChatAppState } from '../chat-app.state.svelte';
    import { shouldShowDetailedTrace } from '$lib/custom/show-detailed-trace';

    interface Props {
        message: ChatMessageForRendering;
        features: ChatAppOverridableFeatures;
        chatAppState?: ChatAppState;
    }

    const appState = getContext<AppState | undefined>('appState');

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

    // Gate detailed traces on the shouldShowDetailedTrace hook so consumers
    // can hide implementation details (e.g. in demo mode or for external users).
    const detailedTrace = $derived(
        shouldShowDetailedTrace(appState?.identity.user) ? features.traces.detailedTraces : undefined
    );
    const isContentAdmin = $derived(chatAppState?.userIsContentAdmin ?? false);
    let expandedTraces = $state<Record<string, boolean>>({});
    let decompressedInstructions = $state<Record<string, string>>({});
    let instructionDialogOpen = $state(false);
    let instructionDialogContent = $state<string>('');

    // TODO: Pull this from the correct user setting
    const dontGroupTraces = $derived((features as any).traceDontGroup?.value);
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

    // Auto-collapse when actual message content starts streaming
    let previousHaveContent = $state(false);
    $effect(() => {
        if (haveActualMessageContent && !previousHaveContent) {
            expanded = false;
        }
        previousHaveContent = haveActualMessageContent;
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
          }
        | {
              type: 'llm-instruction';
              id: string;
              compressedData: string;
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

                // Check if this is a semantic directives trace (detailed traces permission required)
                try {
                    const parsed = JSON.parse(rationaleText);

                    // Hide directive and LLM instruction traces entirely when detailedTrace is off
                    if (!detailedTrace && (parsed.type === 'semantic-directives' || parsed.type === 'semantic-directives-collaborator' || parsed.type === 'llm-instruction')) {
                        return; // Skip — these are implementation details not meant for regular users
                    }

                    if ((parsed.type === 'semantic-directives' || parsed.type === 'semantic-directives-collaborator') && detailedTrace && parsed.directives) {
                        // Build a nice table format for the directives
                        const directivesTable = parsed.directives
                            .map((d: any) => {
                                return `<div class="mb-4 p-3 bg-slate-50 rounded border border-slate-200">
                                <div class="flex items-start gap-2 mb-2">
                                    <span class="font-semibold text-slate-700">Scope:</span>
                                    <span class="font-mono text-sm text-slate-900 bg-slate-100 px-2 py-0.5 rounded">${d.scope}</span>
                                </div>
                                <div class="flex items-start gap-2 mb-2">
                                    <span class="font-semibold text-slate-700">ID:</span>
                                    <span class="font-mono text-sm text-slate-900">${d.id}</span>
                                </div>
                                <div class="mb-2">
                                    <div class="font-semibold text-slate-700 mb-1">Description:</div>
                                    <div class="text-slate-600 text-sm">${d.description}</div>
                                </div>
                                <div>
                                    <div class="font-semibold text-slate-700 mb-1">Instructions:</div>
                                    <div class="text-slate-600 text-sm font-mono bg-white p-2 rounded border border-slate-200">${d.instructions}</div>
                                </div>
                            </div>`;
                            })
                            .join('');

                        const html = `<div class="font-medium text-slate-800 mb-3">Applied Semantic Directives (${parsed.directives.length})</div>${directivesTable}`;

                        grouped.push({
                            id: val.orchestrationTrace.rationale.traceId ?? 'semantic-directives',
                            type: 'text',
                            markdown: html,
                            rawText: JSON.stringify(parsed.directives, null, 2),
                        });
                        return; // Skip further processing for this trace
                    }

                    // Check if this is an LLM instruction trace (detailed traces permission required)
                    if (parsed.type === 'llm-instruction' && detailedTrace && parsed.compressedData) {
                        grouped.push({
                            id: val.orchestrationTrace.rationale.traceId ?? 'llm-instruction',
                            type: 'llm-instruction',
                            compressedData: parsed.compressedData,
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
                            {:else if trace.type === 'llm-instruction'}
                                {@render llmInstructionTrace(trace)}
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
                            ? 'bg-success-bg text-success'
                            : trace.grade === 'B'
                              ? 'bg-warning-bg text-warning'
                              : trace.grade === 'C'
                                ? 'bg-warning-bg text-warning'
                                : trace.grade === 'F'
                                  ? 'bg-danger-bg text-destructive'
                                  : 'bg-muted text-muted-foreground'
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
                        <span class="px-2 py-1 rounded text-xs font-medium bg-success-bg text-success">A</span>
                        <span>Factually accurate</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 rounded text-xs font-medium bg-warning-bg text-warning">B</span>
                        <span>Accurate with stated assumptions</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 rounded text-xs font-medium bg-warning-bg text-warning">C</span>
                        <span>Accurate with unstated assumptions</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 rounded text-xs font-medium bg-danger-bg text-destructive">F</span>
                        <span>Inaccurate or contains made up information</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground">U</span>
                        <span>Response was not verified</span>
                    </div>
                </div>
            </div>
        {/if}
    </div>
{/snippet}

{#snippet llmInstructionTrace(trace: GroupedTrace & { type: 'llm-instruction' })}
    <div class="border border-slate-200 rounded-lg overflow-hidden mt-2">
        <button
            class="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors cursor-pointer text-left"
            onclick={() => {
                if (expandedTraces[trace.id]) {
                    delete expandedTraces[trace.id];
                } else {
                    // Decompress on first expansion
                    if (!decompressedInstructions[trace.id]) {
                        decompressedInstructions[trace.id] = gunzipBase64EncodedString(trace.compressedData);
                    }
                    expandedTraces[trace.id] = true;
                }
            }}
        >
            <div class="flex items-center gap-2">
                <ChevronRight
                    class="w-4 h-4 transition-transform duration-200 text-slate-500 {expandedTraces[trace.id]
                        ? 'rotate-90'
                        : ''}"
                />
                <span class="font-medium text-slate-700">LLM Instruction Prompt</span>
            </div>
            {#if expandedTraces[trace.id]}
                <div class="flex items-center gap-1" role="group">
                    <Button
                        onclick={(e) => {
                            e.stopPropagation();
                            const decompressed =
                                decompressedInstructions[trace.id] || gunzipBase64EncodedString(trace.compressedData);
                            navigator.clipboard.writeText(decompressed);
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
                        onclick={(e) => {
                            e.stopPropagation();
                            const decompressed =
                                decompressedInstructions[trace.id] || gunzipBase64EncodedString(trace.compressedData);
                            instructionDialogContent = decompressed;
                            instructionDialogOpen = true;
                        }}
                    >
                        <Maximize2 class="w-4 h-4" />
                    </Button>
                </div>
            {/if}
        </button>

        {#if expandedTraces[trace.id] && decompressedInstructions[trace.id]}
            <div class="px-4 pb-4 border-t border-slate-200 bg-slate-50">
                <div class="prose prose-sm max-w-none pt-3">
                    {@html md.render(decompressedInstructions[trace.id])}
                </div>
            </div>
        {/if}
    </div>
{/snippet}

{#snippet toolInvocationTrace(
    trace: GroupedTrace & { type: 'toolInvocation' | 'knowledgeBaseInvocation' | 'collaboratorInvocation' }
)}
    <button
        class="flex items-center gap-1 font-medium text-gray-700 mb-1 hover:text-gray-900 transition-colors cursor-pointer"
        onclick={() => {
            if (expandedTraces[trace.id]) {
                delete expandedTraces[trace.id];
            } else {
                expandedTraces[trace.id] = true;
            }
        }}
    >
        <ChevronRight
            class="w-4 h-4 transition-transform duration-200 {expandedTraces[trace.id] ? 'rotate-90' : ''}"
        />
        {trace.title}
    </button>

    {#if expandedTraces[trace.id]}
        {#if trace.parameters}
            {@render codeSection('Request Parameters', trace.parameters, trace, 'parameters')}
        {/if}

        {#if trace.response}
            {@render codeSection('Response', trace.response, trace, 'response')}
        {/if}
    {/if}
{/snippet}

{#snippet codeSection(
    title: string,
    content: { markdown: string; rawText: string },
    trace: GroupedTrace & { type: 'toolInvocation' | 'knowledgeBaseInvocation' | 'collaboratorInvocation' },
    section: 'parameters' | 'response'
)}
    {@const sectionKey = `${trace.id}_${section}`}
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
                        if (expandedTraces[sectionKey]) {
                            delete expandedTraces[sectionKey];
                        } else {
                            expandedTraces[sectionKey] = true;
                        }
                    }}
                >
                    {#if expandedTraces[sectionKey]}
                        <Shrink class="w-4 h-4" />
                    {:else}
                        <Expand class="w-4 h-4" />
                    {/if}
                </Button>
            </div>
        </div>
        <div
            class={`code-block flex flex-col transition-all duration-300 overflow-hidden ${expandedTraces[sectionKey] ? '' : 'max-h-64'}`}
        >
            {@html content.markdown}
            {#if expandedTraces[sectionKey]}
                <div class="buttons flex relative mt-[-20px]">
                    <Button
                        variant="ghost"
                        size="icon"
                        onclick={() => {
                            if (expandedTraces[sectionKey]) {
                                delete expandedTraces[sectionKey];
                            } else {
                                expandedTraces[sectionKey] = true;
                            }
                        }}
                    >
                        {#if expandedTraces[sectionKey]}
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

<!-- Full-screen dialog for viewing LLM instruction -->
<Dialog.Root bind:open={instructionDialogOpen}>
    <Dialog.Content class="overflow-hidden flex flex-col" style="width: 95vw; height: 90vh;">
        <Dialog.Header>
            <Dialog.Title>
                <div class="flex items-center gap-2">
                    <span>LLM Instruction Prompt</span>
                </div>
            </Dialog.Title>
        </Dialog.Header>

        <div class="flex-1 overflow-auto p-4">
            <div class="prose prose-sm max-w-none">
                {@html md.render(instructionDialogContent)}
            </div>
        </div>

        <Dialog.Footer class="flex items-center justify-end gap-2">
            <Button
                onclick={() => {
                    navigator.clipboard.writeText(instructionDialogContent);
                    toast.info('Copied to clipboard', { duration: 1500 });
                }}
                variant="outline"
            >
                <Copy class="w-4 h-4 mr-2" />
                Copy
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<style>
    .thinking-step-btn {
        background: var(--background);
        border: 2px solid var(--border);
        border-radius: 25px;
        padding: 5px 24px;
        font-size: 14px;
        font-weight: 500;
        color: var(--foreground);
        cursor: pointer;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        position: relative;
    }

    .thinking-step-btn:hover {
        border-color: var(--ring);
        background: var(--accent);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
</style>
