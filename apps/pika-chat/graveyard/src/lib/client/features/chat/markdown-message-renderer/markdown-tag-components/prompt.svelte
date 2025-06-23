<script lang="ts">
    import { AppState } from '$client/app/app.state.svelte';
    import { Button } from '$lib/components/ui/button';
    import { MessageSquare } from '$lib/icons/lucide';
    import { ChatAppState } from '../../chat-app.state.svelte';

    interface Props {
        rawTagContent: string;
        appState: AppState;
        chatAppState: ChatAppState;
    }

    let { rawTagContent, chatAppState: chat }: Props = $props();

    function handleClick() {
        chat.chatInput = rawTagContent;
        chat.sendMessage();
    }
</script>

<Button
    onclick={handleClick}
    class="mb-2 mt-2 inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
    title="Click to use this prompt"
>
    <MessageSquare class="w-4 h-4" />
    {rawTagContent}
</Button>
