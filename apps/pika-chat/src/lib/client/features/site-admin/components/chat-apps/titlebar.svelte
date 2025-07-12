<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import type { ChatApp } from '@pika/shared/types/chatbot/chatbot-types';

    interface Props {
        selectedChatApp: ChatApp;
        isOverrideMode: boolean;
        onSetInitialOverride: () => void;
        onRemoveOverride: () => void;
    }

    let { selectedChatApp, isOverrideMode, onSetInitialOverride, onRemoveOverride }: Props = $props();
</script>

<div class="p-6 border-b">
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-xl font-bold">
                {selectedChatApp.title}
                <span class="text-sm font-normal text-muted-foreground">({selectedChatApp.chatAppId})</span>
            </h1>
            <p class="text-muted-foreground text-sm">
                {#if isOverrideMode}
                    Edit settings for this chat app that override the original settings published with the chat app
                    (Override mode)
                {:else}
                    Viewing default settings published with chat app (select "Enable Override" to edit)
                {/if}
            </p>
        </div>
        <div>
            {#if isOverrideMode}
                <Button variant="outline" size="sm" onclick={onRemoveOverride}>Remove Override</Button>
            {:else}
                <Button variant="default" size="sm" onclick={onSetInitialOverride}>Enable Override</Button>
            {/if}
        </div>
    </div>
</div>
