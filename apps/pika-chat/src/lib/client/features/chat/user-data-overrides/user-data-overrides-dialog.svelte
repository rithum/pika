<script lang="ts">
    import type { ChatAppState } from '$lib/client/features/chat/chat-app.state.svelte';
    import { Button } from '$lib/components/ui/button';
    import * as Dialog from '$lib/components/ui/dialog';
    import { getContext } from 'svelte';
    import CustomDataOverridesUi from './custom-data-overrides-ui.svelte';
    import { untrack } from 'svelte';

    const chat = getContext<ChatAppState>('chatAppState');
    let isValid: string | boolean = $state(false);
    let customComp = $state<CustomDataOverridesUi>() as CustomDataOverridesUi;
    let dataChanged = $state(false);
    let saving = $derived(chat.userDataOverrideOperationInProgress['saveUserOverrideData']);
    let clearing = $derived(chat.userDataOverrideOperationInProgress['clearUserOverrideData']);
    let showSuccessMessage = $state(false);

    $effect(() => {
        chat.sendUserOverrideDataCommand({
            chatAppId: chat.chatApp.chatAppId,
            command: 'getInitialDialogData',
        });
    });

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

    async function getValuesForAutoComplete(componentName: string, valueProvidedByUser: string) {
        // This will cause the valuesForAutoCompleteForUserOverrideDialog to be updated
        await chat.sendUserOverrideDataCommand({
            chatAppId: chat.chatApp.chatAppId,
            command: 'getValuesForAutoComplete',
            componentName,
            valueProvidedByUser,
        });
    }

    async function saveUserOverrideData() {
        // This will cause the userOverrideData to be updated
        await chat.sendUserOverrideDataCommand({
            chatAppId: chat.chatApp.chatAppId,
            command: 'saveUserOverrideData',
            data: await customComp.getDataToPostToServer(),
        });

        customComp.reset();
        showSuccessMessage = true;
    }

    async function clearUserOverrideData() {
        //TODO: add error handling
        // This will cause the userOverrideData to be removed
        await chat.sendUserOverrideDataCommand({
            chatAppId: chat.chatApp.chatAppId,
            command: 'clearUserOverrideData',
        });

        chat.valuesForAutoCompleteForUserOverrideDialog = {};
        showSuccessMessage = true;
    }
</script>

{#if chat.userDataOverrideSettings.enabled}
    <Dialog.Root bind:open={chat.userDataOverrideDialogOpen}>
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
                    <Dialog.Title>Override User Data</Dialog.Title>
                    <Dialog.Description>
                        Override user data values to use with this chat app. This override will persist until you login
                        again or clear the override.
                    </Dialog.Description>
                </Dialog.Header>
                <div class="p-6 max-w-3xl mx-auto w-full">
                    <!-- This is your custom UI component that will be rendered here -->
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
                </div>
                <div class="flex gap-2">
                    <div class="flex gap-2 items-center">
                        <Button disabled={saving} variant="outline" onclick={clearUserOverrideData}
                            >Clear Override Data</Button
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
                        <Button disabled={saving || !isValid || !dataChanged} onclick={saveUserOverrideData}
                            >Save</Button
                        >
                        <Button disabled={saving || !dataChanged} variant="outline" onclick={() => customComp.reset()}
                            >Reset</Button
                        >
                        <Button
                            disabled={saving}
                            variant="outline"
                            onclick={() => (chat.userDataOverrideDialogOpen = false)}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            {/if}
        </Dialog.Content>
    </Dialog.Root>
{/if}
