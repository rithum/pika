/**
 * Chat User Auth Hook
 *
 * Extension point for customizing how the framework reconciles an authenticated
 * user's identity token with the stored ChatUser record in the database.
 *
 * This file is protected from pika sync — your changes will be preserved when
 * you update from upstream.
 */
import type { AuthenticatedUser, ChatUser, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Called during the ChatUser refresh and initial login flows to determine
 * whether roles should be taken directly from the authentication token rather
 * than merged with the values stored in the database.
 *
 * When this returns `true` the framework will:
 *   - Skip the `rolesChanged` check — roles from the token are treated as
 *     authoritative and will not trigger a cookie re-serialization on their own.
 *   - Use the token roles instead of the database roles when building the merged
 *     user object during a periodic refresh.
 *   - Skip `mergeAuthenticatedUserWithExistingChatUser` on initial login — the
 *     token identity is used as-is without pulling stored roles from the database.
 *   - Create the ChatUser record if it is missing during a refresh instead of
 *     clearing the session and forcing re-authentication.
 *
 * When this returns `false` (the default), the framework applies its standard
 * role-merge behavior: database roles take precedence and a missing ChatUser
 * during refresh triggers a forced re-login.
 *
 * @param _user - The authenticated user from the current session token
 * @returns `true` to treat the token as the authoritative source for roles
 */
export function shouldBypassChatUserRoleMerge(
    _user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>
): boolean {
    return false;
}

/**
 * Decides which roles are persisted on the stored ChatUser record for a user.
 * Default: the roles as given, which is pika's previous behavior.
 */
export function rolesForChatUserRecord(roles: string[] | undefined): string[] | undefined {
    return roles;
}

/**
 * Decides which roles the session carries after a periodic refresh.
 * Default: stored roles first, then session roles, which is pika's previous behavior.
 */
export function mergeStoredRolesIntoSession(sessionRoles: string[] | undefined, storedRoles: string[] | undefined): string[] | undefined {
    return storedRoles || sessionRoles;
}

/**
 * Decides which customData the session carries after a periodic refresh.
 * Default: the stored ChatUser customData, then the session's, which is pika's previous behavior.
 */
export function mergeChatUserCustomData(
    user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    chatUser: ChatUser<RecordOrUndef>
): RecordOrUndef {
    return chatUser.customData || user.customData;
}

/**
 * Returns customData to write back to the stored ChatUser record, or undefined to write nothing.
 * Default: undefined, which is pika's previous behavior.
 */
export function resolveChatUserAccountWriteBack(
    _user: AuthenticatedUser<RecordOrUndef, RecordOrUndef>,
    _chatUser: ChatUser<RecordOrUndef>
): RecordOrUndef | undefined {
    return undefined;
}
