<script lang="ts">
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import type { ChatAppState } from '$lib/client/features/chat/chat-app.state.svelte';
    import AdminActionDialog from '../admin-action-dialog/admin-action-dialog.svelte';
    import { getContext } from 'svelte';
    import ContentAdminUi from './content-admin-ui.svelte';

    const appState = getContext<AppState>('appState');
    const chat = getContext<ChatAppState>('chatAppState');
    const identity = appState.identity;

    let isValid: string | boolean = $state(false);
    let uiComponent = $state<ContentAdminUi>() as ContentAdminUi;
    let dataChanged = $state(false);
    let saving = $derived(chat.contentAdminOperationInProgress['viewContentForUser']);
    let clearing = $derived(chat.contentAdminOperationInProgress['stopViewingContentForUser']);

    async function getValuesForAutoComplete(valueProvidedByUser: string) {
        // This will cause the valuesForAutoCompleteForContentAdminDialog to be updated
        await chat.sendContentAdminCommand({
            chatAppId: chat.chatApp.chatAppId,
            command: 'getValuesForAutoComplete',
            valueProvidedByUser,
        });
    }

    // suppressErrorToast=true: AdminActionDialog's runAction is the single error toaster.
    async function viewContentForUser() {
        await chat.sendContentAdminCommand(
            {
                chatAppId: chat.chatApp.chatAppId,
                command: 'viewContentForUser',
                user: await uiComponent.getDataToPostToServer(),
            },
            true
        );
        // Reached only on success; a throw above is caught by runAction (no reset, no success screen).
        uiComponent.reset();
    }

    async function stopViewingContentForUser() {
        await chat.sendContentAdminCommand(
            {
                chatAppId: chat.chatApp.chatAppId,
                command: 'stopViewingContentForUser',
            },
            true
        );
        chat.valuesForAutoCompleteForContentAdminDialog = [];
    }
</script>

{#if chat.userIsContentAdmin}
    <AdminActionDialog
        bind:open={chat.contentAdminDialogOpen}
        title="Content Admin"
        {saving}
        secondaryInProgress={clearing}
        onSave={viewContentForUser}
        saveDisabled={saving || !isValid || !dataChanged}
        saveErrorMessage="Failed to view content for that user. Please try again."
        secondaryLabel="Stop Viewing as User"
        onSecondary={stopViewingContentForUser}
        secondaryDisabled={saving}
        secondaryErrorMessage="Failed to stop viewing as user. Please try again."
        onReset={() => uiComponent.reset()}
        resetDisabled={saving || !dataChanged}
        bodyClass="p-6 pt-3 max-w-lg mx-auto w-full"
    >
        {#snippet description()}
            Select user whose chat sessions and messages you want to view for this chat app (in effect until
            select Stop Viewing as User button or when logout). <br /><br />View only: you won't be able to
            create new chat sessions or messages for this user.<br /><br />
            If you are allowed to override user data, you won't be able to do that while viewing content for
            another user.
        {/snippet}
        {#snippet children()}
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
        {/snippet}
    </AdminActionDialog>
{/if}
