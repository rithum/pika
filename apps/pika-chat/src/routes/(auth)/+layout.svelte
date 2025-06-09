<script lang="ts">
    import { page } from '$app/state';
    import type { AppState } from '$client/app/app.state.svelte';
    import { setContext, type Snippet } from 'svelte';
    import AppSettings from '$client/app/settings/app-settings.svelte';
    import { Toaster } from '$lib/components/ui/sonner';

    interface Props {
        data: {
            appState: AppState;
        };
        children?: Snippet<[]>;
    }

    const { data, children }: Props = $props();
    const { appState } = data;

    let unlisten: (() => void) | undefined;

    // Initialize the app state with the page object now that we have it
    appState.page = page;
    setContext('appState', appState);

    $effect(() => {
        initialize();
    });

    async function initialize() {
        const crypto: Crypto = window.crypto;
        if (!crypto) {
            throw new Error('Crypto is not available');
        }
        if (!crypto.getRandomValues) {
            throw new Error('Crypto.getRandomValues is not available');
        }

        // await appState.initializeIdentity(crypto);
    }

    function onUnload() {
        if (unlisten) {
            unlisten();
        }
    }

    const handleKeydown = (e: KeyboardEvent) => {
        appState.checkForHotKey(e);
    };
</script>

<svelte:window onunload={onUnload} onkeydown={handleKeydown} />

{@render children?.()}


<AppSettings />

<Toaster position="top-center" richColors closeButton />