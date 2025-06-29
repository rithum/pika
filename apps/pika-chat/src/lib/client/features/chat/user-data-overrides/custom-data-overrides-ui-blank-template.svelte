<!--
  This is the custom ui component that will be rendered in the dialog so your users can override the user data.

  It is a blank template for you to get started.  There is a more complete implementation in custom-data-overrides-ui.svelte.

  You will want to override that file with your own implementation.  This is here so you can see a blank version without
  all the complexity of a real implementation.

  You can delete this file once you you don't need it anymore.
-->
<script lang="ts">
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

    // Here's how you can tell if you are doing a search for the autocomplete (if you even need one).  You can similarly
    // tell if other operations are in progress if you need to.
    //let loading = $derived(userDataOverrideOperationInProgress['getValuesForAutoComplete']);

    /**
     * This method is required and will be called by the dialog when the user clicks the reset button
     * or when the dialog is reopened so you can reset any state you need to.
     */
    export function reset() {
        // TODO: Reset any other state here
        dataChanged = false;
        isValid = false;
    }

    /**
     * This will be called by the dialog when the user clicks the save button.  It will return the data that will be
     * passed to the `userOverrideDataPostedFromDialog` method in `src/routes/(auth)/api/user-data-override/custom-user-data.ts`
     * (yours to implement if you need it).
     */
    export async function getDataToPostToServer(): Promise<unknown | undefined> {
        //TODO: return the data you want to post to the server that will be passed to the `userOverrideDataPostedFromDialog`
        // method in `src/routes/(auth)/api/user-data-override/custom-user-data.ts` (yours to implement if you need it).
        return undefined;
    }
</script>

<!-- TODO: Put your UI here so users can provide the user override data.-->
