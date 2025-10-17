<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { injectChatAppWebComponent } from '$lib/client/webcomponent-utils';
    import type { TagDefinition, TagDefinitionWidgetWebComponent } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import type { ChatAppState } from '../../chat-app.state.svelte';
    import type { ProcessedTagSegment } from '../segment-types';
    import findAndParseJsonLikeText from 'json-like-parse';

    interface Props {
        segment: ProcessedTagSegment;
    }

    const { segment }: Props = $props();
    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');

    let containerEl = $state<HTMLElement>();
    let initialized = $state(false);
    let previousSegment = $state<ProcessedTagSegment | undefined>(undefined);

    /**
     * Parse tag content robustly, handling JSON and fallback cases
     */
    function parseTagContent(rawContent: string): any {
        if (!rawContent || !rawContent.trim()) {
            return {};
        }

        // First try direct JSON parsing
        try {
            return JSON.parse(rawContent);
        } catch (parseError) {
            // If direct JSON parsing fails, try to extract JSON-like text
            const parsed = findAndParseJsonLikeText(rawContent);

            if (parsed.length > 0) {
                return parsed[0];
            }

            // If nothing worked, return the raw content as a property
            console.warn('Tag content was not JSON, returning as rawContent property:', rawContent);
            return { rawContent };
        }
    }

    $effect(() => {
        // Reset initialization when segment changes
        if (segment !== previousSegment) {
            initialized = false;
            previousSegment = segment;
        }

        // Only inject when:
        // 1. Container is available
        // 2. Segment is complete (not streaming or incomplete)
        // 3. Not already initialized
        const isComplete =
            segment?.streamingStatus === 'completed' ||
            (segment?.streamingStatus !== 'incomplete' && segment?.streamingStatus !== 'streaming');

        if (containerEl && segment && isComplete && !initialized) {
            const tagDef = chat.widgetRegistry.getTagDefinition(segment.tag.split('.')[0], segment.tag.split('.')[1]);

            if (!tagDef || tagDef.widget.type !== 'web-component') {
                console.error('Invalid web component tag:', segment.tag);
                return;
            }

            // Parse tag content for the web component
            const parsedData = parseTagContent(segment.rawContent);

            // Inject component and get instance ID (async operation)
            injectChatAppWebComponent(
                tagDef as TagDefinition<TagDefinitionWidgetWebComponent>,
                containerEl,
                {
                    renderingContext: 'inline',
                    appState: appState,
                    chatAppState: chat,
                    chatAppId: chat.chatApp.chatAppId,
                    dataForWidget: parsedData,
                },
                true
            )
                .then(() => {
                    // Component injected successfully
                })
                .catch((error) => {
                    console.error('Error injecting web component:', error);
                });

            initialized = true;
        }
    });
</script>

<div bind:this={containerEl} class="my-2 h-[400px] max-h-[500px]">
    {#if segment.streamingStatus === 'incomplete' || segment.streamingStatus === 'streaming'}
        <div
            class="animate-pulse bg-gray-100 rounded-lg p-6 text-center text-gray-500"
            data-widget-placeholder={segment.id}
            data-streaming-status={segment.streamingStatus}
        >
            Loading...
        </div>
    {/if}
</div>
