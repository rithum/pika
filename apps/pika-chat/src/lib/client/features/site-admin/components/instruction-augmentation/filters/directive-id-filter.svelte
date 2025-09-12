<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import { Button } from '$ui/shadcn/button';

    import { Input } from '$ui/shadcn/input';
    import { getContext } from 'svelte';

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const iaState = siteAdmin.instructionAugmentation;
    let directiveId = $state('');

    let disabled = $derived(!directiveId.trim());

    function addDirectiveId() {
        let changed = false;
        if (directiveId.trim()) {
            if (iaState.searchQuery.directiveIds) {
                if (!iaState.searchQuery.directiveIds.includes(directiveId.trim())) {
                    iaState.searchQuery.directiveIds.push(directiveId.trim());
                    changed = true;
                }
            } else {
                iaState.searchQuery.directiveIds = [directiveId.trim()];
                changed = true;
            }
            directiveId = '';
        }
        if (changed) {
            iaState.searchQuery.scopes = undefined;
        }
    }
</script>

<div class="flex flex-col gap-1 mr-4 pr-2">
    <div class="flex items-center gap-2 w-full">
        <PopupHelp popoverClasses="text-xs w-auto p-1"
            >Show semantic directives with the selected directive ID</PopupHelp
        >
        <Input id="title" bind:value={directiveId} placeholder="Add a filter for directive ID..." />
        <Button variant="outline" size="sm" class="h-8" onclick={addDirectiveId} {disabled}>Add</Button>
    </div>
</div>
