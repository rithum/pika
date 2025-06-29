<script lang="ts">
    import Combobox from '$lib/components/ui-pika/combobox/combobox.svelte';
    import type { ChatUserLite, ContentAdminCommand } from '@pika/shared/types/chatbot/chatbot-types';

    interface Props {
        isValid: boolean | string;
        initialDataFromServer: ChatUserLite | undefined;
        disabled: boolean;
        getValuesForAutoComplete: (valueProvidedByUser: string) => Promise<void>;
        valuesForAutoComplete: ChatUserLite[] | undefined;
        operationInProgress: Record<ContentAdminCommand, boolean>;
        dataChanged: boolean;
    }

    let {
        isValid = $bindable(),
        dataChanged = $bindable(),
        initialDataFromServer,
        getValuesForAutoComplete,
        valuesForAutoComplete,
        operationInProgress,
        disabled,
    }: Props = $props();

    let loading = $derived(operationInProgress['getValuesForAutoComplete']);
    let originalUserFromServer = $derived(initialDataFromServer);
    let selectedUser = $derived(initialDataFromServer);

    const valuesAsUsers = $derived.by(() => {
        return (valuesForAutoComplete ?? []) as ChatUserLite[];
    });

    export function reset() {
        selectedUser = originalUserFromServer;
        dataChanged = false;
        isValid = false;
    }

    export async function getDataToPostToServer(): Promise<ChatUserLite> {
        if (!selectedUser) {
            throw new Error('No user selected');
        }

        return selectedUser;
    }

    function valueChanged(value: ChatUserLite) {
        selectedUser = value;

        const hasChanged = (() => {
            if (!initialDataFromServer && !selectedUser) {
                return false;
            }

            if (!initialDataFromServer || !selectedUser) {
                return true;
            }

            return initialDataFromServer.userId !== selectedUser.userId;
        })();

        dataChanged = hasChanged;

        if (selectedUser) {
            isValid = true;
        }
    }

    async function onSearchValueChanged(value: string) {
        // This will cause the valuesForAutoComplete property to be updated with the new values.
        await getValuesForAutoComplete(value);
    }
</script>

<div class="text-sm text-muted-foreground">View content for:</div>

<Combobox
    value={selectedUser}
    mapping={{
        value: (value) => value.userId,
        label: (value) => value.userId,
    }}
    options={valuesAsUsers}
    onValueChanged={valueChanged}
    {onSearchValueChanged}
    {loading}
    optionTypeName="user"
    optionTypeNamePlural="users"
    widthClasses="w-[320px]"
    minCharactersForSearch={3}
    {disabled}
/>
