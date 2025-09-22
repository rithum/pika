<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { Button } from '$ui/shadcn/button';
    import * as Dialog from '$ui/shadcn/dialog';
    import { Input } from '$ui/shadcn/input';
    import { Label } from '$ui/shadcn/label';
    import { getContext } from 'svelte';

    interface Props {
        open: boolean;
    }
    let { open = $bindable() }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const sessionInsights = siteAdmin.sessionInsights;

    let name = $state('');

    $effect(() => {
        name = sessionInsights.savedSearchInUse?.name ?? '';
    });
</script>

<Dialog.Root
    bind:open
    onOpenChange={() => {
        if (!open) {
            open = false;
        }
    }}
>
    <Dialog.Content>
        <Dialog.Title>Save Current Search</Dialog.Title>
        <div class="flex flex-col gap-2">
            <Label class="text-sm text-muted-foreground"
                >Give your search a name. If the name is already in use, the saved search will be updated.</Label
            >
            <Input bind:value={name} required class="w-full h-10" placeholder="Name your saved search" />
        </div>
        <Dialog.Footer>
            <Button
                variant="default"
                disabled={sessionInsights.savingSavedSearch || !name || name.trim() === ''}
                onclick={async () => {
                    await sessionInsights.saveSearch(name.trim());
                    open = false;
                }}>Save</Button
            >
            <Button
                variant="outline"
                onclick={() => {
                    open = false;
                }}>Cancel</Button
            >
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
