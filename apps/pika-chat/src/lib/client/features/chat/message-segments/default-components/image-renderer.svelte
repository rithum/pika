<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import { ChatAppState } from '../../chat-app.state.svelte';
    import type { ProcessedTagSegment } from '../segment-types';

    interface Props {
        segment: ProcessedTagSegment;
        appState: AppState;
        chatAppState: ChatAppState;
    }

    let { segment }: Props = $props();

    // Extract raw content from the segment
    let rawTagContent = $derived(segment.rawContent);

    let imageError = $state(false);
    let isLoading = $state(true);

    // Show placeholder during streaming
    let showPlaceholder = $derived(segment.streamingStatus === 'streaming');

    function handleImageError() {
        imageError = true;
        isLoading = false;
    }

    function handleImageLoad() {
        isLoading = false;
    }
</script>

<div class="image-container my-4">
    {#if showPlaceholder}
        <div class="animate-pulse bg-gray-100 rounded-lg p-12 text-center text-gray-500">
            Loading image...
        </div>
    {:else if imageError}
        <div class="bg-gray-100 rounded-lg p-8 text-center text-gray-500">
            <svg
                class="w-12 h-12 mx-auto mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                ></path>
            </svg>
            <p class="text-sm">Failed to load image</p>
            <p class="text-xs mt-1 font-mono">{rawTagContent}</p>
        </div>
    {:else}
        <div class="relative inline-block rounded-lg overflow-hidden shadow-md">
            {@render loader(isLoading)}
            <img
                src={rawTagContent}
                alt="Content"
                class="max-w-full h-auto {isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300"
                onload={handleImageLoad}
                onerror={handleImageError}
            />
        </div>
    {/if}
</div>

{#snippet loader(showing: boolean)}
    {#if showing}
        <div class="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center">
            <svg class="w-8 h-8 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
            </svg>
        </div>
    {/if}
{/snippet}

<style>
    .image-container {
        text-align: center;
    }

    img {
        max-height: 600px;
        object-fit: contain;
    }
</style> 