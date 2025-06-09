import { AppState } from '$client/app/app.state.svelte';
import type { ChatUser } from '@pika/shared/types/chatbot/chatbot-types';
import type { LoadEvent } from '@sveltejs/kit';

export async function load({ fetch, data }: LoadEvent) {
    // Create the single instance of the app state that we share across all routes
    // We need do this here so a) it's created before anything else and b) it has
    // the special svelte kit tricked out fetch function

    const appState = new AppState(fetch, data as ChatUser);
    return {
        appState,
    };
}
