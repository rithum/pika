<script lang="ts">
    import { Badge } from '$lib/components/ui/badge';
    import { ScrollArea } from '$lib/components/ui/scroll-area';
    import type { ChatApp } from '@pika/shared/types/chatbot/chatbot-types';

    interface Props {
        chatApps: ChatApp[];
        selectedChatApp: ChatApp | null;
        onSelectChatApp: (chatApp: ChatApp) => void;
    }

    let { chatApps, selectedChatApp, onSelectChatApp }: Props = $props();
</script>

<!-- Left Sidebar - Chat Apps List -->
<div class="w-80 border-r bg-muted/20">
    <ScrollArea class="h-[calc(100vh-12rem)]">
        <div class="p-2">
            {#each chatApps as chatApp (chatApp.chatAppId)}
                <button
                    class="w-full p-3 text-left rounded-lg hover:bg-muted/50 transition-colors {selectedChatApp?.chatAppId ===
                    chatApp.chatAppId
                        ? 'bg-muted'
                        : ''}"
                    onclick={() => onSelectChatApp(chatApp)}
                >
                    <div class="flex items-start justify-between">
                        <div class="min-w-0 flex-1">
                            <h3 class="font-medium truncate">{chatApp.title}</h3>
                            <p class="text-sm text-muted-foreground line-clamp-2">{chatApp.description}</p>
                            <div class="mt-2 flex items-center gap-2">
                                <Badge variant={chatApp.enabled ? 'default' : 'destructive'} class="text-xs">
                                    {chatApp.enabled ? 'Enabled' : 'Disabled'}
                                </Badge>
                                {#if chatApp.override}
                                    <Badge variant="secondary" class="text-xs">Override</Badge>
                                {/if}
                            </div>
                        </div>
                    </div>
                </button>
            {/each}
        </div>
    </ScrollArea>
</div>
