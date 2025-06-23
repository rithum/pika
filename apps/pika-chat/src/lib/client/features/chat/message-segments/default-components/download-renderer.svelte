<script lang="ts">
    import type { AppState } from '$client/app/app.state.svelte';
    import { Button } from '$lib/components/ui/button';
    import { Download } from '$lib/icons/lucide';
    import { ChatAppState } from '../../chat-app.state.svelte';
    import type { ProcessedTagSegment } from '../segment-types';

    interface Props {
        segment: ProcessedTagSegment;
        appState: AppState;
        chatAppState: ChatAppState;
    }

    let { segment, chatAppState }: Props = $props();

    // Extract raw content from the segment
    let rawTagContent = $derived(segment.rawContent);

    let error = $state<string | undefined>();
    let downloadData = $state<{ s3Key: string; title?: string } | undefined>();

    // Show placeholder during streaming
    let showPlaceholder = $derived(segment.streamingStatus === 'streaming');

    $effect(() => {
        if (showPlaceholder) return; // Don't parse while streaming
        
        try {
            // console.log('rawTagContent', rawTagContent);
            const parsed = JSON.parse(rawTagContent);
            // console.log('parsed', parsed);
            if (!parsed.s3Key) {
                error = 'Missing s3Key in download data';
                return;
            }
            downloadData = parsed;
            error = undefined;
        } catch (e) {
            console.error('Failed to parse download JSON', e);
            error = e instanceof Error ? e.message : 'Failed to parse download data';
        }
    });

    function getDisplayTitle(s3Key: string, title?: string) {
        if (title) return title;

        // Extract filename from s3Key
        const parts = s3Key.split('/');
        const filename = parts[parts.length - 1];
        return filename || s3Key;
    }

    function handleDownload() {
        if (downloadData) {
            chatAppState.downloadFile(downloadData.s3Key);
        }
    }
</script>

<div class="download-container my-3">
    {#if showPlaceholder}
        <div class="animate-pulse bg-gray-100 rounded-lg p-3 text-gray-500 text-sm">
            Loading download...
        </div>
    {:else if error}
        <div class="bg-red-50 border-red-200 rounded-lg p-3 text-red-700">
            <p class="font-semibold text-sm">Download Error</p>
            <p class="text-xs">{error}</p>
        </div>
    {:else if downloadData}
        <Button onclick={handleDownload} title="Click to download file">
            <Download class="w-4 h-4" />
            <span class="truncate max-w-xs">
                {getDisplayTitle(downloadData.s3Key, downloadData.title)}
            </span>
        </Button>
    {:else}
        <div class="animate-pulse bg-gray-100 rounded-lg p-3 text-gray-500 text-sm">
            Loading download...
        </div>
    {/if}
</div> 