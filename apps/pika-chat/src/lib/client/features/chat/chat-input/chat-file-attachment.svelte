<script lang="ts">
    import { ArrowUp, Plus, X, LoaderCircle, File } from '$lib/icons/lucide';
    import * as Sidebar from '$comps/ui/sidebar/index.js';
    import type { AppState } from '$client/app/app.state.svelte';
    import { getContext, type Snippet } from 'svelte';
    import { Slideout, SlideoutContent, SlideoutPanel, SlideoutProvider } from '$comps/ui-pika/slideout';
    import type { UploadInstance } from '../../upload/upload-instance.svelte';

    interface Props {
        fileInstance: UploadInstance;
        removeFile: (s3Key: string) => void;
    }

    const { fileInstance, removeFile }: Props = $props();

    function getProgressCircle(progress: number) {
        // Create an SVG circle that fills according to the progress
        // The circle will be filled from 0 to progress%
        const r = 8; // radius
        const c = 10; // center
        const circumference = 2 * Math.PI * r;
        const dashOffset = circumference * (1 - progress / 100);

        return `
            <svg width="20" height="20" viewBox="0 0 20 20">
                <circle 
                    cx="${c}" 
                    cy="${c}" 
                    r="${r}" 
                    fill="none" 
                    stroke="#e2e8f0" 
                    stroke-width="2"
                />
                <circle 
                    cx="${c}" 
                    cy="${c}" 
                    r="${r}" 
                    fill="none" 
                    stroke="#3b82f6" 
                    stroke-width="2"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${dashOffset}"
                    transform="rotate(-90 ${c} ${c})"
                />
            </svg>
        `;
    }
</script>

<div
    class="flex items-center rounded-md overflow-hidden bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm max-w-fit {fileInstance
        .status.status === 'error'
        ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
        : ''}"
>
    <!-- File icon or loading circle -->
    <div class="flex items-center justify-center w-9 h-full bg-blue-400 dark:bg-blue-500 text-white">
        {#if fileInstance.status.status === 'uploading'}
            <!-- Progress circle -->
            <div class="w-5 h-5 relative">
                {@html getProgressCircle(fileInstance.status.progress)}
            </div>
        {:else}
            <!-- File icon -->
            <File style="width: 1.5rem; height: 1.5rem;" />
        {/if}
    </div>

    <!-- File info -->
    <div class="px-2 py-1 flex flex-col justify-center">
        <div class="font-medium text-xs truncate max-w-[100px]" title={fileInstance.fileName}>
            {fileInstance.fileName}
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Document</div>
    </div>

    <!-- Remove button -->
    <div class="px-1">
        <button
            class="h-6 w-6 p-0 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center"
            onclick={() => removeFile(fileInstance.s3Key)}
        >
            <X style="width: 1rem; height: 1rem;" />
        </button>
    </div>
</div>
