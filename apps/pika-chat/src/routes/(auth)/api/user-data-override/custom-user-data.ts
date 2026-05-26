import type { AuthenticatedUser, ChatApp, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import {
    getInitialDataForUserDataOverrideDialog as _getInitialData,
    getValuesForUserDataAutoComplete as _getAutoComplete,
    userOverrideDataPostedFromDialog as _mapOverrideData
} from '$lib/custom/account-data-source';

/**
 * Get the initial data for the user data override dialog.  This is the data that will be displayed in the dialog when the user
 * clicks the user data override button.  Lets say you want to have a company picker in the user data override dialog.  You would
 * return the list of companies from your database here and then in your custom UI component you would display a picker.
 *
 * Note that any existing override data is on the user object passed in on the `overrideData` field (key is chatAppId, value is
 * the override data for that chat app).
 *
 * Implement getInitialDataForUserDataOverrideDialog in lib/custom/account-data-source.ts.
 *
 * @param user The currently logged in user
 * @param chatApp The chat app that the user is overriding the user for
 * @returns The initial data for the user data override dialog to render your custom UI component, if any
 */
export async function getInitialDataForUserDataOverrideDialog(
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatApp: ChatApp
): Promise<unknown | undefined> {
    return _getInitialData(user, chatApp);
}

/**
 * Get the values for an auto complete input component.  Perhaps you have a company picker auto complete input in
 * the user data override dialog and you want to let the internal user select a company from a list of companies.
 * This would let you do a query using the `valueProvidedByUser` to get the values for the auto complete input.
 *
 * You can have multiple auto complete inputs in the same dialog, so you will need to pass the component name to
 * this method so you can return the correct values for the correct auto complete input.
 *
 * Note that any existing override data is on the user object passed in on the `overrideData` field (key is chatAppId, value is
 * the override data for that chat app).
 *
 * Implement getValuesForUserDataAutoComplete in lib/custom/account-data-source.ts.
 *
 * @param componentName The component to get the values for (this allows you to have multiple pickers in the same dialog)
 * @param valueProvidedByUser The value provided by the user (the value typed by the user in the picker to query on)
 * @param user The logged in user
 * @param chatApp The chat app that the user is overriding the user for
 * @returns
 */
export async function getValuesForAutoComplete(
    componentName: string,
    valueProvidedByUser: string,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatApp: ChatApp
): Promise<unknown[] | undefined> {
    return _getAutoComplete(componentName, valueProvidedByUser, user, chatApp);
}

/**
 * Set the override data into the chat user before we use it when calling the chat API or when invoking the agent.
 * Note, we don't save the override data in the database, we only use it when calling the chat API or when invoking the agent, storing
 * it in a cookie. Remember that we send the user object all over the place, so if it gets too big, it could cause a problem.
 * All of your custom user data should be stored in `AuthenticatedUser.customData` and should not be more than 1 kilobyte in size.
 *
 * Note that any existing override data is on the user object passed in on the `overrideData` field (key is chatAppId, value is
 * the override data for that chat app).
 *
 * Implement userOverrideDataPostedFromDialog in lib/custom/account-data-source.ts.
 *
 * @param user The user we are acting on behalf of.
 * @param chatApp The chat app that the user is overriding the user for
 * @param overrideData The override data posted from the user data override dialog from your custom UI component.
 * @returns The complete bag of ChatUser.customData that we will use when calling the chat API or when invoking the agent.
 */
export async function userOverrideDataPostedFromDialog(
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatApp: ChatApp,
    overrideData: unknown | undefined
): Promise<RecordOrUndef> {
    return _mapOverrideData(user, chatApp, overrideData);
}
