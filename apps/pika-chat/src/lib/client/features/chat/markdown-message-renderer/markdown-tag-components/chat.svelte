<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import { ChatAppState } from '../../chat-app.state.svelte';

    interface Props {
        rawTagContent: string;
        appState: AppState;
        chatAppState: ChatAppState;
    }

    let { rawTagContent, appState }: Props = $props();

    // This is a placeholder component
    // You can expand this based on your specific chat subcomponent needs
</script>

<div class="chat-subcomponent my-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
    <div class="flex items-start space-x-3">
        <div class="flex-shrink-0">
            <svg
                class="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                ></path>
            </svg>
        </div>
        <div class="flex-1">
            <p class="text-sm text-blue-900">{rawTagContent}</p>
        </div>
    </div>
</div>

<style>
    .chat-subcomponent {
        /* Add any specific styling for chat components */
    }
</style>
