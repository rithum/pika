<script lang="ts">
    import { Trash2 } from '$icons/lucide';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import { formatDateTime } from '$lib/utils';
    import { Button } from '$ui/shadcn/button';
    import * as Dialog from '$ui/shadcn/dialog';
    import * as Table from '$ui/shadcn/table';
    import cloneDeep from 'lodash.clonedeep';
    import { getContext } from 'svelte';

    interface Props {
        open: boolean;
    }
    let { open = $bindable() }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const sessionInsights = siteAdmin.sessionInsights;
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
        <Dialog.Title>Saved Searches</Dialog.Title>
        {#if sessionInsights.savedSearches.length === 0}
            <div class="text-sm text-muted-foreground">
                No saved searches found. Select the <b>Save Current Search</b> menu item to create a saved search.
            </div>
        {:else}
            <div class="flex max-h-[500px] overflow-y-auto">
                <div class="flex flex-col gap-2 border-2 border-gray-200 rounded-md w-full">
                    {#each sessionInsights.savedSearches as search}
                        <div class="pb-2 w-full">
                            <Table.Root>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.Head></Table.Head>
                                        <Table.Head>Name</Table.Head>
                                        <Table.Head>Date Created</Table.Head>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    <Table.Row>
                                        <Table.Cell class="font-medium">
                                            <div class="flex gap-2 items-center">
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    onclick={() => {
                                                        sessionInsights.searchQuery = cloneDeep(search.searchParams);
                                                        sessionInsights.savedSearchInUse = cloneDeep(search);
                                                        open = false;
                                                    }}
                                                >
                                                    Apply
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    onclick={async () => {
                                                        await sessionInsights.deleteSavedSearch(search);
                                                        open = false;
                                                    }}
                                                >
                                                    <Trash2 class="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </Table.Cell>
                                        <Table.Cell>{search.name}</Table.Cell>
                                        <Table.Cell class="text-sm text-muted-foreground"
                                            >{formatDateTime(search.createdAt)}</Table.Cell
                                        >
                                    </Table.Row>
                                </Table.Body>
                            </Table.Root>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
        <Dialog.Footer>
            <Button
                variant="outline"
                onclick={() => {
                    open = false;
                }}>Close</Button
            >
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
