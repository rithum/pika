<script lang="ts">
    import { getContext } from 'svelte';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import * as Card from '$ui/shadcn/card';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import Combobox from '$ui/pika/combobox/combobox.svelte';
    import type { ChatUserLite } from 'pika-shared/types/chatbot/chatbot-types';
    import { Label } from '$ui/shadcn/label';
    import hljs from 'highlight.js/lib/core';
    import json from 'highlight.js/lib/languages/json';
    import 'highlight.js/styles/github.css'; // or any other theme you prefer

    // Register the languages
    hljs.registerLanguage('json', json);

    const appState = getContext<AppState>('appState');
    const memoryState = appState.siteAdmin.memory;

    function formatDate(date: Date | string) {
        return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // Function to check if content is JSON or an object
    function isJsonContent(content: any): boolean {
        // If it's already an object, we can format it as JSON
        if (typeof content === 'object' && content !== null) return true;

        // If it's a string that looks like JSON
        if (typeof content === 'string') {
            const trimmed = content.trim();
            return (
                (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))
            );
        }

        return false;
    }

    // Function to pretty print JSON (handles both objects and JSON strings)
    function formatJson(content: any): string {
        try {
            // If it's already an object, stringify it directly
            if (typeof content === 'object' && content !== null) {
                return JSON.stringify(content, null, 2);
            }

            // If it's a string, try to parse and format it
            if (typeof content === 'string') {
                const parsed = JSON.parse(content);
                return JSON.stringify(parsed, null, 2);
            }

            return String(content);
        } catch (error) {
            return String(content); // Return original if not valid JSON
        }
    }

    // Function to highlight JSON content
    function highlightJson(content: any): string {
        try {
            const formattedJson = formatJson(content);
            const highlighted = hljs.highlight(formattedJson, { language: 'json' });
            return highlighted.value;
        } catch (error) {
            console.error('Error highlighting JSON:', error);
            // Fallback to formatted but unhighlighted JSON
            return formatJson(content);
        }
    }
</script>

<div class="text-sm text-muted-foreground mb-4">View all memory records for a given user.</div>

<div class="flex flex-col gap-1 w-full mr-4 bg-card border border-border/50 rounded-xl p-6 shadow-sm space-y-6">
    <div class="flex flex-col gap-1 w-[220px]">
        <div class="flex items-center gap-2">
            <Label class="text-sm font-medium text-foreground">User</Label>
            <PopupHelp popoverClasses="text-xs w-auto p-1">Get all memory records for this user</PopupHelp>
        </div>
        <Combobox
            bind:value={
                () => {
                    let result: ChatUserLite | undefined = undefined;

                    if (memoryState.userForMemory) {
                        result = memoryState.userForMemory;
                    }

                    return result;
                },
                (val) => {
                    memoryState.userForMemory = val ?? undefined;
                    if (memoryState.userForMemory) {
                        memoryState.loadAllMemoryRecords();
                    } else {
                        memoryState.clearAllMemoryRecords();
                    }
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
            wrapperClasses="flex-1 w-full"
        />
    </div>
</div>

<div class="flex flex-col gap-4 mt-4">
    {#each memoryState.allMemoryRecordsSorted as memoryRecord}
        <Card.Root>
            <Card.Header>
                <Card.Title>Memory created {formatDate(memoryRecord.createdAt ?? new Date())}</Card.Title>
            </Card.Header>
            <Card.Content>
                {#if memoryRecord.content && isJsonContent(memoryRecord.content)}
                    <div class="relative bg-muted/50 border border-border/50 rounded-lg overflow-hidden">
                        <pre class="hljs p-4 overflow-x-auto text-sm leading-6 bg-transparent"><code
                                class="language-json font-mono">{@html highlightJson(memoryRecord.content)}</code
                            ></pre>
                    </div>
                {:else}
                    <p>{memoryRecord.content || 'No content available'}</p>
                {/if}
            </Card.Content>
        </Card.Root>
    {/each}
</div>
