<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { injectChatAppWebComponent } from '$lib/client/webcomponent-utils';
    import type { TagDefinition, TagDefinitionWidgetWebComponent } from 'pika-shared/types/chatbot/chatbot-types';
    import { getContext } from 'svelte';
    import type { ChatAppState } from '../../chat-app.state.svelte';
    import type { ProcessedTagSegment } from '../segment-types';

    interface Props {
        segment: ProcessedTagSegment;
    }

    const { segment }: Props = $props();
    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');

    let containerEl = $state<HTMLElement>();
    let initialized = $state(false);
    let previousSegment = $state<ProcessedTagSegment | undefined>(undefined);

    $effect(() => {
        // Reset initialization when segment changes
        if (segment !== previousSegment) {
            initialized = false;
            previousSegment = segment;
        }

        // Only inject when:
        // 1. Container is available
        // 2. Segment is complete or streaming (not incomplete)
        // 3. Not already initialized
        if (containerEl && segment && segment.streamingStatus !== 'incomplete' && !initialized) {
            const tagDef = chat.widgetRegistry.getTagDefinition(segment.tag.split('.')[0], segment.tag.split('.')[1]);

            if (!tagDef || tagDef.widget.type !== 'web-component') {
                console.error('Invalid web component tag:', segment.tag);
                return;
            }

            // Inject component and get instance ID (async operation)
            injectChatAppWebComponent(
                tagDef as TagDefinition<TagDefinitionWidgetWebComponent>,
                containerEl,
                {
                    renderingContext: 'inline',
                    appState: appState,
                    chatAppState: chat,
                    chatAppId: chat.chatApp.chatAppId,
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

<div bind:this={containerEl} class="my-2">
    {#if segment.streamingStatus === 'incomplete'}
        <div class="text-muted-foreground italic">Loading widget...</div>
    {:else if segment.streamingStatus === 'streaming'}
        <div class="text-muted-foreground italic">Widget streaming...</div>
    {/if}
</div>
