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
            showChatHistoryInStandaloneMode: true,
            customTheme: {
                // Set to true to enable custom theming. A sample theme is ready at the path below - try it!
                enabled: false,
                // Path relative to apps/pika-chat/
                themeConfigPath: 'src/lib/custom/theme-config'
            }
        },
        sessionInsights: {
            enabled: true
        },
        tags: {
            enabled: true
            // Tag visibility is now controlled at the tag definition level via:
            // - TagDefinition.chatAppId: 'chat-app-global' = available to all chat apps
            // - TagDefinition.chatAppId: 'weather' = available only to 'weather' chat app
            // - TagDefinition.status: 'enabled' | 'disabled' | 'retired' = lifecycle state
        },
        agentInstructionAssistance: {
            enabled: true
        },
        instructionAugmentation: {
            enabled: true,
            type: 'llm-semantic-directive-search'
        },
        userMemory: {
            enabled: true,
            maxMemoryRecordsPerPrompt: 25,
            maxKMatchesPerStrategy: 5
        }
    },
    // Tags applied to all AWS resources in your CDK stacks.  Feel free to completely customize this to your needs.
    stackTags: {
        // Common tags applied to both Pika service and Pika Chat stacks
        common: {
            app: 'pika',
            env: '{stage}'
        },
        // Tags specific to the Pika service stack (backend)
        pikaServiceTags: {
            service: '{pika.projNameKebabCase}',
            tier: 'backend'
        },
        // Tags specific to the Pika Chat stack (frontend)
        pikaChatTags: {
            service: '{pikaChat.projNameKebabCase}',
            tier: 'frontend'
        },
        // Component tag names for granular cost tracking - creates 'component' tag on each resource
        // with resource-specific values like 'Claude4SonnetInferenceProfile', 'ConverseLambda', etc.
        componentTagNames: ['component']
        // Additional examples of dynamic placeholders:
        // 'DeployedAt': '{timestamp}',                   // Current timestamp in ISO 8601 format
        // 'AccountId': '{accountId}',                    // AWS account ID
        // 'Region': '{region}',                          // AWS region
        // 'ServiceName': '{pika.projNameHuman}',         // Human-readable Pika project name
        // 'Application': '{pikaChat.projNameHuman}'      // Human-readable Pika Chat project name
    }
};
