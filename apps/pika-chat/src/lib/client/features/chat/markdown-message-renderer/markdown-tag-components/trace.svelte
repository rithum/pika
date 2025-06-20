<script lang="ts">
    import { AppState } from '$client/app/app.state.svelte';
    import type { ChatMessage } from '@pika/shared/types/chatbot/chatbot-types';
    import { ChatAppState } from '../../chat-app.state.svelte';
    import { onMount } from 'svelte';

    interface Props {
        id: string;
        rawTagContent: string;
        appState: AppState;
        chatAppState: ChatAppState;
        message: ChatMessage
    }

    let { rawTagContent, chatAppState: chat, message, id }: Props = $props();


    onMount(()=>{
        console.log("Mount Trace", message.messageId, id)
        if (!message.traces?.some(t=>t["uiId"] == id)){
            let trace = JSON.parse(rawTagContent);
            trace.uiId = id;
            message.traces!.push(trace)
        }
    })


</script>

