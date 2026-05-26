import type { AuthenticatedUser, RecordOrUndef, SimpleOption } from 'pika-shared/types/chatbot/chatbot-types';
import {
    getValuesForEntityAutoComplete as _getEntityAutoComplete,
    getValuesForEntityList as _getEntityList
} from '$lib/custom/account-data-source';

/**
 * Get the values for an auto complete input component in the admin UI.  This is used if you have turned on
 * the entity feature and siteAdmin feature and within it the sessionInsights feature.
 *
 * When you turn on siteAdmin.entity.enabled, the admin UI will show a new section in the chat app
 * configuration called "Entity Access Control" that can be set for internal and external users separately.  The
 * admin user can then search for entities whose users are to be given exclusive access to the chat app, meaning that
 * only users associated with those entities will be able to access the chat app.
 *
 * When you turn on siteAdmin.entity.enabled and siteAdmin.sessionInsights.enabled, the admin UI will allow for the display
 * and filtering of entities in the session insights UI.  The admin user can then search for entities whose users are
 * to be displayed in the session insights UI (of course, assuming you have enabled session insights in the site features).
 *
 * Implement getValuesForEntityAutoComplete in lib/custom/account-data-source.ts.
 *
 * @param valueProvidedByUser The value provided by the user (the value typed by the user in the picker to query on)
 * @param user The logged in user
 * @param chatAppId The chat app whose entity access control is being configured (won't be there in some cases)
 * @returns
 */
export async function getValuesForEntityAutoComplete(
    valueProvidedByUser: string,
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatAppId?: string
): Promise<SimpleOption[] | undefined> {
    return _getEntityAutoComplete(valueProvidedByUser, user, chatAppId);
}

/**
 * Get the values for a list of entities by ID in the admin UI.  This is used if you have turned on
 * the entity feature and siteAdmin feature and within it the sessionInsights feature.
 *
 * Implement getValuesForEntityList in lib/custom/account-data-source.ts.
 *
 * @param entityIds The list of entity IDs to get the values for
 * @param user The logged in user
 * @param chatAppId The chat app whose entity access control is being configured (won't be there in some cases)
 * @returns
 */
export async function getValuesForEntityList(
    entityIds: string[],
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatAppId?: string
): Promise<SimpleOption[] | undefined> {
    return _getEntityList(entityIds, user, chatAppId);
}
