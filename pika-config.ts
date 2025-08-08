import type { PikaConfig } from './packages/shared/src/types/chatbot/chatbot-types';

export const pikaConfig: PikaConfig = {
    pika: {
        projNameL: 'pika',
        projNameKebabCase: 'pika',
        projNameTitleCase: 'Pika',
        projNameCamel: 'pika',
        projNameHuman: 'Pika'
    },
    pikaChat: {
        projNameL: 'pikachat',
        projNameKebabCase: 'pika-chat',
        projNameTitleCase: 'PikaChat',
        projNameCamel: 'pikaChat',
        projNameHuman: 'Pika Chat'
    },
    weather: {
        projNameL: 'weather',
        projNameKebabCase: 'weather',
        projNameTitleCase: 'Weather',
        projNameCamel: 'weather',
        projNameHuman: 'Weather'
    },
    siteFeatures: {
        homePage: {
            homePageTitle: 'Pika Chat Apps',
            welcomeMessage: 'Welcome to the Pika Chat Apps home page!',
            linksToChatApps: {
                // By default, only internal users are able to see links on the home page to chat apps
                userChatAppRules: [
                    {
                        userTypes: ['internal-user'],
                        chatAppUserTypes: ['internal-user', 'external-user']
                    }
                ]
            }
        },
        entity: {
            enabled: true,
            attributeName: 'accountId',
            tableColumnHeaderTitle: 'Account ID',
            displayNameSingular: 'Account',
            displayNamePlural: 'Accounts',
            searchPlaceholderText: 'Search for an account...'
        },
        userDataOverrides: {
            enabled: true,
            promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing: ['accountId', 'accountType']
        },
        contentAdmin: {
            enabled: true
        },
        traces: {
            enabled: true,
            userTypes: ['internal-user'],
            detailedTraces: {
                enabled: true,
                userTypes: ['internal-user']
            }
        },
        chatDisclaimerNotice: {
            enabled: true,
            notice: "This AI-powered chat is here to help, but it may not always be accurate. For urgent or complex issues, please contact customer support. The company isn't liable for problems caused by relying solely on this chat."
        },
        verifyResponse: {
            enabled: true,
            autoRepromptThreshold: 'C', // Accurate with unstated assumptions
            userTypes: ['internal-user']
        },
        logout: {
            enabled: true,
            userTypes: ['internal-user']
        },
        siteAdmin: {
            websiteEnabled: true,
            supportUserEntityAccessControl: {
                enabled: true
            },
            supportSpecificUserAccessControl: {
                enabled: true
            },
            sessionInsights: {
                enabled: true
            }
        },
        fileUpload: {
            enabled: true,
            mimeTypesAllowed: ['text/*']
        },
        suggestions: {
            enabled: true,
            suggestions: [], // Must be set by chat apps
            maxToShow: 5, // Should be overridden by chat apps
            randomize: false, // Should be overridden by chat apps
            randomizeAfter: 0 // Should be overridden by chat apps
        },
        promptInputFieldLabel: {
            enabled: true,
            promptInputFieldLabel: 'Ready to chat'
        },
        uiCustomization: {
            enabled: true,
            showUserRegionInLeftNav: false,
            showChatHistoryInStandaloneMode: true
        },
        sessionInsights: {
            enabled: true
        }
    }
};
