<!--
  This is the custom ui component that will be rendered in the dialog so your users can override the user data.

  It is yours to modify as you see fit.  Read the comments, they show you what you need to do.
-->
<script lang="ts">
    import type { ComboboxOption } from '$lib/components/ui-pika/combobox/combobox-types';
    import Combobox from '$lib/components/ui-pika/combobox/combobox.svelte';
    import type { UserOverrideDataCommand } from '@pika/shared/types/chatbot/chatbot-types';

    /**
     * You must have these props in order for the dialog to be able to interact with your ui component correctly.
     */
    interface Props {
        /**
         * Set this to true if the user data is valid, false if it is not, or a string if it's not valid
         * with an error message you want the dialog itself to show above the ui component. The dialog will bind to this
         * and show the error message if it's not valid.
         */
        isValid: boolean | string;

        /**
         * The initial data from the server that will be used to populate the ui component.
         * You define the server method to fetch any data you need in
         * `src/routes/(auth)/api/user-data-override/custom-user-data.ts` (yours to implement if you need it).
         */
        initialDataFromServer: unknown | undefined;

        /**
         * If true, you should disable all the inputs in your ui component.
         */
        disabled: boolean;

        /**
         * You call this method if you have an auto complete input in your ui component which means you will have
         * implemented the `getValuesForAutoComplete` method in `src/routes/(auth)/api/user-data-override/custom-user-data.ts`
         * (yours to implement if you need it).  Calling this causes the server side getValuesForAutoComplete method  you
         * defined to be called. Don't call this method if you don't need an auto complete input.
         *
         * When you call this method, we will update the `valuesForAutoComplete` property with the data returned from the server.
         * Bind to this property in your ui component so you can display the values in your auto complete input.
         */
        getValuesForAutoComplete: (componentName: string, valueProvidedByUser: string) => Promise<void>;

        /**
         * This is the data that will be returned from the server side `getValuesForAutoComplete` method.
         * The outer key is the component name and the inner key is the value provided by the user. So..
         * `{ "company": [ { "value": "123", "label": "Company 123" } ] }` meaning the company autocomplete input
         * has a single entry with a value of 123 and a label of Company 123.
         */
        valuesForAutoComplete: Record<string, unknown[] | undefined>;

        /**
         * So you can show a loading indicator when an operation is in progress if you want to.
         */
        userDataOverrideOperationInProgress: Record<UserOverrideDataCommand, boolean>;

        /**
         * You bind to this value and set it when the data does/doesn't change so the dialog knows to enable the save button.
         */
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

    // This is just here so you know how to get the chat app state should you need it.  Be careful, you probably don't need
    // it and if you don't know what you are doing, you could break the chat app.
    // const chat = getContext<ChatAppState>('chatAppState');

    let loading = $derived(userDataOverrideOperationInProgress['getValuesForAutoComplete']);

    let originalAccountFromServer = $derived(initialDataFromServer as Account | undefined);

    //TODO: delete this once you make this component your own
    // Note, taking advantage of a svelte 5 feature where you can temporarily assign a value to a derived value,
    // which we do when they select an account from the combobox, and then it will be set back to the derived value
    // when the server updates initialDataFromServer.
    let selectedAccount = $derived(initialDataFromServer as Account | undefined);

    //TODO: delete this once you make this component your own
    const valuesAsAccounts = $derived.by(() => {
        // We only have a single combobox in this example, so we can just return the values for the account component
        return (valuesForAutoComplete?.['accountComponent'] ?? []) as Account[];
    });

    const valuesAsComboboxOptions = $derived.by(() => {
        return valuesAsAccounts.map((account) => ({
            value: account.accountId,
            label: account.details.accountName,
            secondaryLabel: account.details.accountType,
        })) as ComboboxOption[];
    });

    /**
     * This method is required and will be called by the dialog when the user clicks the reset button
     * or when the dialog is reopened so you can reset any state you need to.
     */
    export function reset() {
        //TODO: replace all this with    whatever you need, it's all just demo placeholder code.
        // Reset any other state here
        selectedAccount = originalAccountFromServer;
        dataChanged = false;
        isValid = false;
    }

    export async function getDataToPostToServer(): Promise<unknown | undefined> {
        //TODO: replace all this with whatever you need, it's all just demo placeholder code.
        // Return the data you want to post to the server that will be passed to the `userOverrideDataPostedFromDialog`
        // method in `src/routes/(auth)/api/user-data-override/custom-user-data.ts` (yours to implement if you need it).
        return selectedAccount;
    }

    //TODO: delete this once you make this component your own
    interface Account {
        accountId: string;
        details: {
            accountName: string;
            accountType: 'standard' | 'premium';
        };
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
