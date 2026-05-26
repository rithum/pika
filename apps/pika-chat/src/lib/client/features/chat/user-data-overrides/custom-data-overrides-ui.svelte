<!--
  Account-picker implementation for the user data override dialog.
  Combobox field accessors and change-detection live in lib/custom/account-mapping.ts
  so consumers can replace them to match their entity data shape.
-->
<script lang="ts">
    import { comboboxMapping, accountsAreDifferent } from '$lib/custom/account-mapping';
    import type { UserOverrideDataCommand } from 'pika-shared/types/chatbot/chatbot-types';
    import Combobox from 'pika-ux/pika/combobox/combobox.svelte';

    interface Props {
        isValid: boolean | string;
        initialDataFromServer: unknown | undefined;
        disabled: boolean;
        getValuesForAutoComplete: (componentName: string, valueProvidedByUser: string) => Promise<void>;
        valuesForAutoComplete: Record<string, unknown[] | undefined>;
        userDataOverrideOperationInProgress: Record<UserOverrideDataCommand, boolean>;
        dataChanged: boolean;
    }

    let {
        isValid = $bindable(),
        dataChanged = $bindable(),
        initialDataFromServer,
        getValuesForAutoComplete,
        valuesForAutoComplete,
        userDataOverrideOperationInProgress,
        disabled,
    }: Props = $props();

    let loading = $derived(userDataOverrideOperationInProgress['getValuesForAutoComplete']);
    let selectedAccount = $derived(initialDataFromServer);

    const valuesAsItems = $derived(valuesForAutoComplete?.['accountComponent'] ?? []);

    export function reset() {
        selectedAccount = initialDataFromServer;
        dataChanged = false;
        isValid = false;
    }

    export async function getDataToPostToServer(): Promise<unknown | undefined> {
        return selectedAccount;
    }

    function valueChanged(value: unknown) {
        selectedAccount = value;
        dataChanged = accountsAreDifferent(initialDataFromServer, value);
        if (selectedAccount) isValid = true;
    }

    async function onSearchValueChanged(value: string) {
        await getValuesForAutoComplete('accountComponent', value);
    }
</script>

<div class="text-sm text-muted-foreground">Answer questions on behalf of:</div>

<Combobox
    value={selectedAccount}
    mapping={comboboxMapping}
    options={valuesAsItems}
    onValueChanged={valueChanged}
    {onSearchValueChanged}
    {loading}
    optionTypeName="account"
    optionTypeNamePlural="accounts"
    wrapperClasses="w-[320px]"
    popupWidthClasses="w-[320px]"
    showValueInListEntries={true}
    minCharactersForSearch={1}
    {disabled}
/>
