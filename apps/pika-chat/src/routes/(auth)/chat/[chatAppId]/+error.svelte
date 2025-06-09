<script lang="ts">
    import { page } from '$app/state';
    import { Button } from '$lib/components/ui/button';

    let chatAppId = $derived(page.params.chatAppId);
    let is404 = $derived(page.status === 404);

    function goBack() {
        history.back();
    }
</script>

{#if is404}
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
        <div class="max-w-md bg-white shadow-lg rounded-lg p-8 text-center">
            <div class="mb-6">
                <div class="text-6xl text-gray-400 mb-4">404</div>
                <h1 class="text-2xl font-semibold text-gray-900 mb-2">Chat App Not Found</h1>
                <p class="text-gray-600 mb-4">
                    The chat app <span class="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{chatAppId}</span> does not
                    exist or is no longer available.
                </p>
            </div>
            <div class="space-y-3">
                <Button onclick={goBack}>Go Back</Button>
            </div>
        </div>
    </div>
{:else}
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
        <div class="text-center">
            <h1 class="text-4xl font-bold text-gray-900 mb-4">{page.status} {page.error?.message}</h1>
            <Button onclick={goBack}>Go Back</Button>
        </div>
    </div>
{/if}
