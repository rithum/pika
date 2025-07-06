import type { ChatApp, ChatUser, UserType, PikaUserRole } from '@pika/shared/types/chatbot/chatbot-types';
import type { UserChatAppRule } from '@pika/shared/types/chatbot/chatbot-types';

/**
 *
 * @param userType The user who is either internal or external user.
 * @param userRoles The user's roles (optional).
 * @param rules The rules to figure out which chat apps the user can access.
 * @param chatApps
 */
export function getMatchingChatApps(userType: UserType, userRoles: (PikaUserRole | string)[] | undefined, rules: UserChatAppRule[], chatApps: ChatApp[]): ChatApp[] {
    // Filter out test and disabled chat apps
    const validChatApps = chatApps.filter((chatApp) => {
        return chatApp.enabled && !chatApp.test;
    });

    // Apply user type and rules filtering
    const matchingChatApps: ChatApp[] = [];

    for (const chatApp of validChatApps) {
        // Default userTypesAllowed to ['internal-user'] if not specified
        const allowedUserTypes = chatApp.userTypes || ['internal-user'];

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

            // Check user roles filtering
            if (rule.userRoles && userRoles) {
                const hasMatchingUserRole = userRoles.some((userRole) => rule.userRoles!.includes(userRole as any));
                if (!hasMatchingUserRole) {
                    continue;
                }
            }

            // Check chat app user roles filtering
            if (rule.chatAppUserRoles && chatApp.userRoles) {
                const hasMatchingChatAppUserRole = rule.chatAppUserRoles.some((ruleRole) => chatApp.userRoles!.includes(ruleRole as any));
                if (!hasMatchingChatAppUserRole) {
                    continue;
                }
            }

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
