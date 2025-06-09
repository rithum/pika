<script lang="ts">
    import { page } from '$app/state';
    import type { AppState } from '$client/app/app.state.svelte';
    import ChatHome from '$client/features/chat/chat-app-main/chat-app-main.svelte';
    import { getContext } from 'svelte';

    const appState = getContext<AppState>('appState');
</script>

<div class="flex flex-col items-center justify-center min-h-screen p-8">
    Welcome to the chatbot app. Nagivate to the URL of the chat app you want to use.
</div>
