<script lang="ts">
    import type { ChatAppState } from '$lib/client/features/chat/chat-app.state.svelte';
    import AdminActionDialog from '../admin-action-dialog/admin-action-dialog.svelte';
    import { getContext } from 'svelte';
    import CustomDataOverridesUi from './custom-data-overrides-ui.svelte';

    const chat = getContext<ChatAppState>('chatAppState');
    let isValid: string | boolean = $state(false);
    let customComp = $state<CustomDataOverridesUi>() as CustomDataOverridesUi;
    let dataChanged = $state(false);
    let saving = $derived(chat.userDataOverrideOperationInProgress['saveUserOverrideData']);
    let clearing = $derived(chat.userDataOverrideOperationInProgress['clearUserOverrideData']);

    $effect(() => {
        chat.sendUserOverrideDataCommand({
            chatAppId: chat.chatApp.chatAppId,
            command: 'getInitialDialogData',
        });
    });

    async function getValuesForAutoComplete(componentName: string, valueProvidedByUser: string) {
        // This will cause the valuesForAutoCompleteForUserOverrideDialog to be updated
        await chat.sendUserOverrideDataCommand({
            chatAppId: chat.chatApp.chatAppId,
            command: 'getValuesForAutoComplete',
            componentName,
            valueProvidedByUser,
        });
    }

    // suppressErrorToast=true: AdminActionDialog's runAction is the single error toaster.
    async function saveUserOverrideData() {
        await chat.sendUserOverrideDataCommand(
            {
                chatAppId: chat.chatApp.chatAppId,
                command: 'saveUserOverrideData',
                data: await customComp.getDataToPostToServer(),
            },
            true
        );
        // Reached only on success; a throw above is caught by runAction (no reset, no success screen).
        customComp.reset();
    }

    async function clearUserOverrideData() {
        await chat.sendUserOverrideDataCommand(
            {
                chatAppId: chat.chatApp.chatAppId,
                command: 'clearUserOverrideData',
            },
            true
        );
        chat.valuesForAutoCompleteForUserOverrideDialog = {};
    }
</script>

{#if chat.userDataOverrideSettings.enabled}
    <AdminActionDialog
        bind:open={chat.userDataOverrideDialogOpen}
        title="Override User Data"
        {saving}
        secondaryInProgress={clearing}
        onSave={saveUserOverrideData}
        saveDisabled={saving || !isValid || !dataChanged}
        saveErrorMessage="Failed to save the override data. Please try again."
        secondaryLabel="Clear Override Data"
        onSecondary={clearUserOverrideData}
        secondaryDisabled={saving}
        secondaryErrorMessage="Failed to clear the override data. Please try again."
        onReset={() => customComp.reset()}
        resetDisabled={saving || !dataChanged}
        bodyClass="p-6 max-w-3xl mx-auto w-full"
    >
        {#snippet description()}
            Override user data values to use with this chat app. This override will persist until you login
            again or clear the override.
        {/snippet}
        {#snippet children()}
            <CustomDataOverridesUi
                bind:this={customComp}
                bind:isValid
                bind:dataChanged
                disabled={saving || clearing}
                initialDataFromServer={chat.initialDataForUserOverrideDialog}
                valuesForAutoComplete={chat.valuesForAutoCompleteForUserOverrideDialog}
                {getValuesForAutoComplete}
                userDataOverrideOperationInProgress={chat.userDataOverrideOperationInProgress}
            />
        {/snippet}
    </AdminActionDialog>
{/if}
