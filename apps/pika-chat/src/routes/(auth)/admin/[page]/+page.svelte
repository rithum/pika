<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { getContext, type Component, type Snippet } from 'svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const currentPage = $derived(siteAdmin.nav.currentPage);
    let pageHeaderRight = $state<Snippet<[]> | undefined>(undefined);

    $effect(() => {
        const headerRight = pageHeaderRight;
        siteAdmin.setPageHeaderRight(headerRight);
    });
</script>

{#if currentPage?.pageComponent}
    <currentPage.pageComponent bind:pageHeaderRight />
{/if}
