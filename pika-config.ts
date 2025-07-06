import { VerifyResponseClassification } from '@pika/shared/types/chatbot/chatbot-types';
import type { PikaConfig } from './packages/shared/src/types/pika-types';

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
        userDataOverrides: {
            enabled: true,
            promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing: ['accountId', 'accountType']
        },
        contentAdmin: {
            enabled: true
        },
        traces: {
            enabled: true,
            detailedTraces: {
                enabled: true,
                userTypes: ['internal-user']
            }
        },
        chatDisclaimerNotice: {
            notice: "This AI-powered chat is here to help, but it may not always be accurate. For urgent or complex issues, please contact customer support. The company isn't liable for problems caused by relying solely on this chat."
        },
        verifyResponse: {
            enabled: true,
            autoRepromptThreshold: VerifyResponseClassification.AccurateWithUnstatedAssumptions // This is letter C
        }
    }
};
