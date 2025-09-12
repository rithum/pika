<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { getContext } from 'svelte';
    import Scope from './scope.svelte';
    import DirectiveId from './directive-id.svelte';

    const appState = getContext<AppState>('appState');
    const iaState = appState.siteAdmin.instructionAugmentation;

    let haveFiltersApplied = $derived.by(() => {
        return (
            (iaState.searchQuery.scopes && iaState.searchQuery.scopes.length > 0) ||
            (iaState.searchQuery.directiveIds && iaState.searchQuery.directiveIds.length > 0)
        );
    });
</script>

{#if haveFiltersApplied}
    <div class="flex items-center gap-2 flex-wrap min-h-8">
        {#each iaState.searchQuery.directiveIds || [] as directiveId, index}
            {#if index > 0}
                <span class="text-muted-foreground">or</span>
            {/if}
            <DirectiveId
                {directiveId}
                mode="chip"
                onclick={() => {
                    if (iaState.searchQuery.directiveIds) {
                        iaState.searchQuery.directiveIds = iaState.searchQuery.directiveIds.filter(
                            (s) => s !== directiveId
                        );
                    }
                }}
            />
        {/each}

        {#each iaState.searchQuery.scopes || [] as scope, index}
            {#if index > 0}
                <span class="text-muted-foreground">or</span>
            {/if}
            <Scope
                {scope}
                mode="chip"
                onclick={() => {
                    if (iaState.searchQuery.scopes) {
                        iaState.searchQuery.scopes = iaState.searchQuery.scopes.filter(
                            (s) => s.scopeType !== scope.scopeType || s.scopeValue !== scope.scopeValue
                        );
                    }
                }}
            />
        {/each}
    </div>
{/if}
