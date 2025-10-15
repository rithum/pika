<script lang="ts">
    import Loader from '$icons/lucide/loader';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import { getContext } from 'svelte';

    interface Props {
        open: boolean;
    }
    let { open = $bindable() }: Props = $props();
    let appState = getContext<AppState>('appState');
    let sessionInsights = appState.siteAdmin.sessionInsights;

    /*
{#if showImageModal}
    <div class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
        <div class="relative bg-background rounded-md shadow-lg max-w-[90vw] max-h-[90vh] p-3">
            <div class="absolute top-2 right-2 flex gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    onclick={() => imageModalS3Url && sessionInsights.downloadAttachment(imageModalS3Url)}
                >
                    Download
                </Button>
                <Button size="sm" variant="ghost" onclick={closeImageModal}>Close</Button>
            </div>
            {#if imageModalSrc}
                <img src={imageModalSrc} alt={imageModalName} class="max-w-[85vw] max-h-[80vh] object-contain" />
            {/if}
        </div>
    </div>
{/if}
    */
</script>

<Dialog.Root bind:open>
    <Dialog.Content
        class="pl-1 pr-1 pb-1 pt-1 flex flex-col items-center justify-center bg-transparent z-1000 border-none"
        showCloseButton={false}
    >
        <div class="flex flex-col items-center justify-center w-full h-full">
            {#if sessionInsights.loadingImageLightbox}
                <div class="flex items-center justify-center w-[300px] h-[300px] border-2 border-gray-200 bg-gray-100">
                    <Loader class="w-4 h-4 animate-spin" />
                </div>
            {:else if sessionInsights.imageForLightbox}
                <Button
                    size="sm"
                    variant="default"
                    class="absolute top-2"
                    onclick={() =>
                        sessionInsights.imageForLightbox?.s3Url &&
                        sessionInsights.downloadAttachment(sessionInsights.imageForLightbox.s3Url)}
                >
                    Download
                </Button>
                <img
                    src={sessionInsights.imageForLightbox.src}
                    alt={sessionInsights.imageForLightbox.alt}
                    class="object-contain max-w-[90vw] max-h-[90vh] rounded-md border-2 border-gray-200"
                />
            {/if}
        </div>
    </Dialog.Content>
</Dialog.Root>
