import type { ChatApp, ChatUser, UserType } from '@pika/shared/types/chatbot/chatbot-types';
import type { UserChatAppRule } from '@pika/shared/types/chatbot/chatbot-types';

/**
 *
 * @param userType The users who is either internal or external user.
 * @param rules The rules to figure out which chat apps the user can access.
 * @param chatApps
 */
export function getMatchingChatApps(userType: UserType, rules: UserChatAppRule[], chatApps: ChatApp[]): ChatApp[] {
    // Filter out test and disabled chat apps
    const validChatApps = chatApps.filter((chatApp) => {
        return chatApp.enabled && !chatApp.test;
    });

    // Apply user type and rules filtering
    const matchingChatApps: ChatApp[] = [];

    for (const chatApp of validChatApps) {
        // Default userTypesAllowed to ['internal-user'] if not specified
        const allowedUserTypes = chatApp.userTypesAllowed || ['internal-user'];

        // Check if any rule allows this chat app for the current user type
        let isAllowed = false;

        for (const rule of rules) {
            // Check if this rule applies to the current user type
            if (rule.userTypes && !rule.userTypes.includes(userType)) {
                continue;
            }

            // Check if the chat app's allowed user types match the rule's chat app user types
            if (rule.chatAppUserTypes) {
                const hasMatchingUserType = allowedUserTypes.some((allowedType) => rule.chatAppUserTypes!.includes(allowedType));

                if (!hasMatchingUserType) {
                    continue;
                }
            }

            // Check explicit exclusions first
            if (rule.chatAppIdsToExclude && rule.chatAppIdsToExclude.includes(chatApp.chatAppId)) {
                isAllowed = false;
                break;
            }

            // Check explicit inclusions
            if (rule.chatAppIdsToInclude) {
                if (rule.chatAppIdsToInclude.includes('*') || rule.chatAppIdsToInclude.includes(chatApp.chatAppId)) {
                    isAllowed = true;
                }
            } else {
                // If no explicit inclusions specified, allow based on user type matching
                isAllowed = true;
            }

            // TODO: Implement userRoles filtering
            // TODO: Implement chatAppUserRoles filtering

            // If we found a matching rule, no need to check further rules
            if (isAllowed) {
                break;
            }
        }

        if (isAllowed) {
            matchingChatApps.push(chatApp);
        }
    }

    return matchingChatApps;
}
