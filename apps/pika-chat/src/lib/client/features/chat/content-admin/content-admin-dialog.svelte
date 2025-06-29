<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { ChatAppState } from '$lib/client/features/chat/chat-app.state.svelte';
    import { Button } from '$lib/components/ui/button';
    import * as Dialog from '$lib/components/ui/dialog';
    import { getContext, untrack } from 'svelte';
    import ContentAdminUi from './content-admin-ui.svelte';

    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');
    const identity = appState.identity;

    let isValid: string | boolean = $state(false);
    let uiComponent = $state<ContentAdminUi>() as ContentAdminUi;
    let dataChanged = $state(false);
    let saving = $derived(chat.contentAdminOperationInProgress['viewContentForUser']);
    let clearing = $derived(chat.contentAdminOperationInProgress['stopViewingContentForUser']);
    let showSuccessMessage = $state(false);

    //TODO: this is a hack to work around a bug  where the body element is not having
    // pointer-events: none removed when the dialog is closed.
    $effect(() => {
        return () => {
            // Force cleanup when component unmounts
            untrack(() => {
                document.body.style.pointerEvents = '';
            });
        };
    });

    async function getValuesForAutoComplete(valueProvidedByUser: string) {
        // This will cause the valuesForAutoCompleteForContentAdminDialog to be updated
        await chat.sendContentAdminCommand({
            chatAppId: chat.chatApp.chatAppId,
            command: 'getValuesForAutoComplete',
            valueProvidedByUser,
        });
    }

    async function viewContentForUser() {
        await chat.sendContentAdminCommand({
            chatAppId: chat.chatApp.chatAppId,
            command: 'viewContentForUser',
            user: await uiComponent.getDataToPostToServer(),
        });

        uiComponent.reset();
        showSuccessMessage = true;
    }

    async function stopViewingContentForUser() {
        //TODO: add error handling
        await chat.sendContentAdminCommand({
            chatAppId: chat.chatApp.chatAppId,
            command: 'stopViewingContentForUser',
        });

        chat.valuesForAutoCompleteForContentAdminDialog = [];
        showSuccessMessage = true;
    }
</script>

{#if chat.userIsContentAdmin}
    <Dialog.Root bind:open={chat.contentAdminDialogOpen}>
        <Dialog.Content>
            {#if showSuccessMessage}
                <Dialog.Header>
                    <Dialog.Title>Success</Dialog.Title>
                    <div class="pt-4 pb-4 text-sm text-muted-foreground">
                        Please refresh the page for this to take effect.
                    </div>
                    <Button onclick={() => window.location.reload()}>Refresh</Button>
                </Dialog.Header>
            {:else}
                <Dialog.Header>
                    <Dialog.Title>Content Admin</Dialog.Title>
                    <Dialog.Description>
                        Select user whose chat sessions and messages you want to view for this chat app (in effect until
                        select Stop Viewing as User button or when logout). <br /><br />View only: you won't be able to
                        create new chat sessions or messages for this user.<br /><br />
                        If you are allowed to override user data, you won't be able to do that while viewing content for
                        another user.
                    </Dialog.Description>
                </Dialog.Header>
                <div class="p-6 pt-3 max-w-3xl mx-auto w-full">
                    <!-- This is your custom UI component that will be rendered here -->
                    <ContentAdminUi
                        bind:this={uiComponent}
                        bind:isValid
                        bind:dataChanged
                        disabled={saving || clearing}
                        initialDataFromServer={identity.user.viewingContentFor?.[chat.chatApp.chatAppId]}
                        valuesForAutoComplete={chat.valuesForAutoCompleteForContentAdminDialog}
                        {getValuesForAutoComplete}
                        operationInProgress={chat.contentAdminOperationInProgress}
                    />
                </div>
                <div class="flex gap-2">
                    <div class="flex gap-2 items-center">
                        <Button disabled={saving} variant="outline" onclick={stopViewingContentForUser}
                            >Stop Viewing as User</Button
                        >
                        {#if clearing}
                            <span
                                class="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
                            ></span>
                        {/if}
                    </div>
                    <div class="flex justify-end gap-2 flex-1 items-center">
                        {#if saving}
                            <span
                                class="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
                            ></span>
                        {/if}
                        <Button disabled={saving || !isValid || !dataChanged} onclick={viewContentForUser}>Save</Button>
                        <Button disabled={saving || !dataChanged} variant="outline" onclick={() => uiComponent.reset()}
                            >Reset</Button
                        >
                        <Button
                            disabled={saving}
                            variant="outline"
                            onclick={() => (chat.contentAdminDialogOpen = false)}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            {/if}
        </Dialog.Content>
    </Dialog.Root>
{/if}
