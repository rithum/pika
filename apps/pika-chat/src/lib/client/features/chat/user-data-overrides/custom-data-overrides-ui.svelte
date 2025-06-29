<!--
  This is a simple implementation of the custom data overrides ui.  See the blank template for just the bare bones
  of what you need to do with complete instructions.
-->
<script lang="ts">
    import Combobox from '$lib/components/ui-pika/combobox/combobox.svelte';
    import type { UserOverrideDataCommand } from '@pika/shared/types/chatbot/chatbot-types';

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
    let originalAccountFromServer = $derived(initialDataFromServer as Account | undefined);

    let selectedAccount = $derived(initialDataFromServer as Account | undefined);

    const valuesAsAccounts = $derived.by(() => {
        // We only have a single combobox in this example, so we can just return the values for the account component
        return (valuesForAutoComplete?.['accountComponent'] ?? []) as Account[];
    });

    export function reset() {
        selectedAccount = originalAccountFromServer;
        dataChanged = false;
        isValid = false;
    }

    export async function getDataToPostToServer(): Promise<unknown | undefined> {
        return selectedAccount;
    }

    function valueChanged(value: Account) {
        selectedAccount = value;

        // Are initialDataFromServer and selectedAccount different?
        // Smart comparison for account data
        const hasChanged = (() => {
            // Cast to correct type for comparison
            const initialAccount = initialDataFromServer as typeof selectedAccount;

            // Both undefined - no change
            if (!initialAccount && !selectedAccount) {
                return false;
            }

            // One is undefined, other isn't - changed
            if (!initialAccount || !selectedAccount) {
                return true;
            }

            // Both exist - compare properties
            return (
                initialAccount.accountId !== selectedAccount.accountId ||
                initialAccount.details.accountName !== selectedAccount.details.accountName ||
                initialAccount.details.accountType !== selectedAccount.details.accountType
            );
        })();

        dataChanged = hasChanged;

        if (selectedAccount) {
            // Our only validation is that there is a selected account.
            isValid = true;
        }
    }

    async function onSearchValueChanged(value: string) {
        // This will cause the valuesForAutoComplete property to be updated with the new values.
        await getValuesForAutoComplete('accountComponent', value);
    }

    interface Account {
        accountId: string;
        details: {
            accountName: string;
            accountType: 'standard' | 'premium';
        };
    }
</script>

<div class="text-sm text-muted-foreground">Answer questions on behalf of:</div>

<Combobox
    value={selectedAccount}
    mapping={{
        value: (value) => value.accountId,
        label: (value) => value.details.accountName,
        secondaryLabel: (value) => value.details.accountType,
    }}
    options={valuesAsAccounts}
    onValueChanged={valueChanged}
    {onSearchValueChanged}
    {loading}
    optionTypeName="account"
    optionTypeNamePlural="accounts"
    widthClasses="w-[320px]"
    showValueInListEntries={true}
    minCharactersForSearch={1}
    {disabled}
/>
