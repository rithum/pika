<script lang="ts">
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import { Button } from '$ui/shadcn/button';
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
        <div class="flex items-center gap-1">
            <PopupHelp popoverClasses="w-60">
                <div class="text-xs text-muted-foreground flex flex-col gap-3">
                    <span>A developer defines the initial settings for a chat app when he publishes it.</span>
                    <span>As an admin, you can override these settings and configure them as you see fit.</span>
                    <span>These changes don't go into affect unless you click "Save" above.</span>
                </div>
            </PopupHelp>
            {#if isOverrideMode}
                <Button variant="outline" size="sm" onclick={onRemoveOverride}>Remove Override</Button>
            {:else}
                <Button variant="default" size="sm" onclick={onSetInitialOverride}>Enable Override</Button>
            {/if}
        </div>
    </div>
</div>
