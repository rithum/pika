<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import ChatHome from '$client/features/chat/chat-app-main/chat-app-main.svelte';
    import ChatLayout from '$client/features/chat/layout/chat-layout.svelte';
    import { getContext, setContext } from 'svelte';
    import type { PageData } from './$types';
    import { ComponentRegistry } from '$lib/client/features/chat/message-segments/component-registry';

    const { data }: { data: PageData } = $props();

    const chatApp = data.chatApp;
    const appState = getContext<AppState>('appState');
    const chatAppState = appState.addChatApp(
        chatApp,
        ComponentRegistry.create(),
        data.userDataOverrideSettings,
        data.userIsContentAdmin,
        data.features
    );

    setContext('chatAppState', chatAppState);

    // Load the chat sessions for the chat app
    chatAppState.refreshChatSessions();
</script>

<ChatLayout>
    <ChatHome />
</ChatLayout>
