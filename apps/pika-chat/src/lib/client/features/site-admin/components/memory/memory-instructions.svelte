<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import Combobox from '$ui/pika/combobox/combobox.svelte';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import { Button } from '$ui/shadcn/button';
    import { Input } from '$ui/shadcn/input';
    import { Label } from '$ui/shadcn/label';
    import hljs from 'highlight.js/lib/core';
    import json from 'highlight.js/lib/languages/json';
    import xml from 'highlight.js/lib/languages/xml';
    import 'highlight.js/styles/github.css';
    import {
        DEFAULT_MAX_K_MATCHES_PER_STRATEGY,
        DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT,
        type ChatUserLite,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    // or any other theme you prefer
    import CopyButton from '$ui/pika/copy-button/copy-button.svelte';
    import { Textarea } from '$ui/shadcn/textarea';

    // Register the languages
    hljs.registerLanguage('xml', xml);
    hljs.registerLanguage('json', json);

    const appState = getContext<AppState>('appState');
    const memoryState = appState.siteAdmin.memory;

    function computeReady() {
        const result =
            memoryState.userForInstructions &&
            memoryState.prompt &&
            memoryState.maxMemoryRecordsPerPrompt > 0 &&
            memoryState.maxKMatchesPerStrategy > 0;

        memoryState.readyToGetMemoryInstructions = !!result;
    }

    // Function to check if a line contains JSON
    function isJsonLine(line: string): boolean {
        const trimmed = line.trim();
        return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    }

    // Function to pretty print JSON
    function formatJson(jsonStr: string): string {
        try {
            const parsed = JSON.parse(jsonStr);
            return JSON.stringify(parsed, null, 2);
        } catch (error) {
            return jsonStr; // Return original if not valid JSON
        }
    }

    // Function to pretty print XML with JSON detection
    function formatXmlWithJson(xml: string): string {
        const formatted = xml.replace(/></g, '>\n<');
        const lines = formatted.split('\n');
        let indent = 0;
        let formattedXml = '';

        for (let line of lines) {
            const trimmedLine = line.trim();

            if (trimmedLine.startsWith('</')) {
                indent--;
            }

            if (isJsonLine(trimmedLine)) {
                // Format JSON and apply proper indentation to each line
                const formattedJson = formatJson(trimmedLine);
                const jsonLines = formattedJson.split('\n');
                for (let i = 0; i < jsonLines.length; i++) {
                    formattedXml += '  '.repeat(indent) + jsonLines[i];
                    if (i < jsonLines.length - 1) formattedXml += '\n';
                }
                formattedXml += '\n';
            } else {
                formattedXml += '  '.repeat(indent) + trimmedLine + '\n';
            }

            if (trimmedLine.startsWith('<') && !trimmedLine.startsWith('</') && !trimmedLine.endsWith('/>')) {
                indent++;
            }
        }
        return formattedXml.trim();
    }

    // Function to highlight XML with embedded JSON
    function highlightXmlWithJson(xml: string): string {
        try {
            const formatted = formatXmlWithJson(xml);
            const lines = formatted.split('\n');
            let result = '';
            let inJsonBlock = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmedLine = line.trim();

                // Detect start of JSON block
                if (trimmedLine.startsWith('{') || trimmedLine.startsWith('[')) {
                    inJsonBlock = true;
                }

                if (inJsonBlock) {
                    // Check if this is the end of JSON block
                    if (trimmedLine.endsWith('}') || trimmedLine.endsWith(']')) {
                        inJsonBlock = false;
                    }

                    // Highlight as JSON
                    const highlighted = hljs.highlight(line, { language: 'json' });
                    result += highlighted.value;
                } else {
                    // Highlight as XML
                    const highlighted = hljs.highlight(line, { language: 'xml' });
                    result += highlighted.value;
                }

                if (i < lines.length - 1) result += '\n';
            }

            return result;
        } catch (error) {
            console.error('Error highlighting XML with JSON:', error);
            // Fallback to basic XML highlighting
            const formatted = formatXmlWithJson(xml);
            const highlighted = hljs.highlight(formatted, { language: 'xml' });
            return highlighted.value;
        }
    }

    let instructions = $derived.by(() => {
        const instructions = memoryState.instructionsAddedForUserMemory;
        return instructions ? `<instructions>${instructions}</instructions>` : undefined;
    });

    let highlightedInstructions = $derived.by(() => {
        return instructions ? highlightXmlWithJson(instructions) : undefined;
    });
</script>

<div class="mb-6">
    <p class="text-sm text-muted-foreground">
        View the instructions added for user memory for a given user, prompt, max memory records per prompt, and max k
        matches per strategy.
    </p>
</div>

<div class="bg-card border border-border/50 rounded-xl p-6 shadow-sm space-y-6">
    <div class="space-y-4">
        <div class="flex gap-4">
            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <Label class="text-sm font-medium text-foreground">User</Label>
                    <PopupHelp popoverClasses="text-xs w-auto p-1">Memory Instructions for this user</PopupHelp>
                </div>
                <Combobox
                    bind:value={
                        () => {
                            let result: ChatUserLite | undefined = undefined;

                            if (memoryState.userForInstructions) {
                                result = memoryState.userForInstructions;
                            }

                            return result;
                        },
                        (val) => {
                            memoryState.userForInstructions = val ?? undefined;
                            computeReady();
                        }
                    }
                    mapping={{
                        value: (val) => val?.userId ?? '',
                        label: (val) => val?.userId ?? '',
                    }}
                    options={memoryState.valuesForUserAutoComplete}
                    onSearchValueChanged={(val) => memoryState.getValuesForUserAutoComplete(val)}
                    loading={memoryState.userAutoCompleteSearchInProgress}
                    optionTypeName="user"
                    optionTypeNamePlural="users"
                    minCharactersForSearch={3}
                    allowClear={true}
                    inputPlaceholder="Choose a user..."
                    wrapperClasses="w-full"
                />
            </div>

            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <Label class="text-sm font-medium text-foreground">Max Records</Label>
                    <PopupHelp popoverClasses="text-xs w-auto p-1">Max memory records per prompt</PopupHelp>
                </div>
                <Input
                    bind:value={
                        () => memoryState.maxMemoryRecordsPerPrompt,
                        (val) => {
                            if (!val || val < 1) {
                                memoryState.maxMemoryRecordsPerPrompt = DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT;
                            } else {
                                memoryState.maxMemoryRecordsPerPrompt = val;
                            }
                            computeReady();
                        }
                    }
                    placeholder="Enter max memory records per prompt..."
                    class="w-[150px]"
                />
            </div>

            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <Label class="text-sm font-medium text-foreground">Top K Matches</Label>
                    <PopupHelp popoverClasses="text-xs w-auto p-1">Max top k matches per strategy</PopupHelp>
                </div>

                <Input
                    bind:value={
                        () => memoryState.maxKMatchesPerStrategy,
                        (val) => {
                            if (!val || val < 1) {
                                memoryState.maxKMatchesPerStrategy = DEFAULT_MAX_K_MATCHES_PER_STRATEGY;
                            } else {
                                memoryState.maxKMatchesPerStrategy = val;
                            }
                            computeReady();
                        }
                    }
                    placeholder="Enter max k matches per strategy..."
                    class="w-[150px]"
                />
            </div>
        </div>

        <div class="space-y-1">
            <div class="flex items-center gap-2">
                <Label class="text-sm font-medium text-foreground">Prompt</Label>
                <PopupHelp popoverClasses="text-xs w-auto p-1">Prompt to generate instructions for</PopupHelp>
            </div>

            <Textarea
                bind:value={
                    () => memoryState.prompt,
                    (val) => {
                        memoryState.prompt = val;
                        computeReady();
                    }
                }
                placeholder="Enter a prompt..."
                class="w-full"
            />
        </div>
    </div>

    <Button
        onclick={() => memoryState.getInstructionsAddedForUserMemory()}
        disabled={memoryState.isGettingInstructionsAddedForUserMemory || !memoryState.readyToGetMemoryInstructions}
        class="w-[150px] "
    >
        Get Instructions
    </Button>
</div>

<div class="flex flex-col gap-6 mt-6">
    {#if highlightedInstructions}
        <div class="w-full space-y-3">
            <div class="relative group">
                <div class="relative bg-card border border-border/50 rounded-xl overflow-hidden shadow-lg">
                    <CopyButton value={instructions} title="Instructions XML" />
                    <div class="bg-card">
                        <pre class="hljs p-6 overflow-x-auto text-sm leading-6 bg-transparent"><code
                                class="language-xml font-mono">{@html highlightedInstructions}</code
                            ></pre>
                    </div>
                </div>
            </div>
        </div>
    {:else}
        <div class="flex flex-col items-center justify-center py-12 px-6 text-center">
            <h3 class="text-sm font-medium text-foreground mb-2">No Instructions Generated</h3>
            <p class="text-sm text-muted-foreground max-w-md">
                Enter a prompt, select a user, and click "Get Instructions" to view the generated memory instructions
                XML.
            </p>
        </div>
    {/if}
</div>
