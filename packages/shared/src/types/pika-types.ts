import type { ChatDisclaimerNoticeFeature, LogoutFeature, TracesFeature, UserChatAppRule, UserType, VerifyResponseFeature } from './chatbot/chatbot-types';

export interface PikaConfig {
    pika: PikaStack;
    pikaChat: BaseStackConfig;
    weather?: BaseStackConfig;

    /** Features that are turned on/configured site-wide. */
    siteFeatures?: SiteFeatures;
}

/**
 * Features that are turned on/configured site-wide.  They are configured in the <root>/pika-config.ts file.
 */
export interface SiteFeatures {
    /** Configure whether chat apps are shown on the home page. */
    homePage?: HomePageSiteFeature;

    /** Configure whether users can override their user data. */
    userDataOverrides?: UserDataOverridesSiteFeature;

    /** Configure whether a content admin can view chat sessions and messages. */
    contentAdmin?: ContentAdminSiteFeature;

    /** Configure whether traces are shown in the chat app as "reasoning traces". */
    traces?: TracesFeature;

    /** Configure whether a disclaimer notice is shown in the chat app. */
    chatDisclaimerNotice?: ChatDisclaimerNoticeFeature;

    /** Configure whether the response from the LLM is verified and auto-reprompted if needed. */
    verifyResponse?: VerifyResponseFeature;

    /** Configure whether the user can logout of the chat app. */
    logout?: LogoutFeature;
}

/**
 * A content admin is a user that can use the UI to select any user of the system and view their chat
 * sessions and messages in each for the purpose of debugging and troubleshooting.  By default,
 * this feature is turned off.  To turn it on, you must set the `enabled` property to `true`.
 *
 * Further, you will have to go into the DynamoDB table named `chat-users-${your-stack-name}` and
 * add the `pika:content-admin` role to the user.
 */
export interface ContentAdminSiteFeature {
    enabled: boolean;
}

/**
 * When turned on, the front end will allow users to override user values set by the auth provider
 * in `ChatUser.customData`.  For example, perhaps an internal user needs the ability to choose an account
 * to act as.  This feature then allows them to set the accountId perhaps on `ChatUser.customData.accountId`.
 * using a UI component that you the developer will provide.  @see <root>/docs/developer/user-overrides
 */
export interface UserDataOverridesSiteFeature {
    /** Whether to enable the user overrides feature. */
    enabled: boolean;

    /**
     * The user types that are allowed to use the user overrides feature.  If not provided, defaults to `['internal-user']`
     * meaning that if the feature is enabled, only internal users will be able to use it.
     */
    userTypes?: UserType[];

    /**
     * The title of the menu item that will be displayed to authorized users that when clicked will
     * open the dialog allowing them to override user data.  Defaults to "Override User Data".
     */
    menuItemTitle?: string;

    /**
     * The title of the dialog that will be displayed when the user clicks the menu item.  Defaults to "Override User Data".
     */
    dialogTitle?: string;

    /**
     * The description that appears benath the title in the dialog window. Defaults to
     * "Override user data values to use with this chat app.  This override will persist until you
     * login again or clear the override."
     */
    dialogDescription?: string;

    /**
     * The description that appears benath the title in the dialog window when the user needs to provide data overrides.
     * Defaults to the same as dialogDescription.  Use this to say something like, "You need to provide data overrides to use this chat app."
     */
    dialogDescriptionWhenUserNeedsToProvideDataOverrides?: string;

    /**
     * Whether to prompt the user if their user object's customData object is missing any of the custom user
     * data attributes that are required for the chat app.  If any of these attributes is missing and the user
     * is allowed to use the user data overrides feature, the user will be prompted to enter the missing attributes
     * when they open the chat app.  If not provided, defaults to false.
     *
     * So, when they open a chat app and they are allowed to use the user data overrides feature, and
     * any of these attributes are missing on the users's customData attribute provided by the auth provider
     * then the user will be prompted to enter the missing attributes and will not be able to use the chat app
     * until they have provided the data overrides that presumably will be used to fill in the missing attributes.
     *
     * Note, you can use dot notation to specify nested attributes.  For example, if you want to prompt the user
     * if the user object's customData object is missing the attribute "address.street", you can specify
     * "address.street" in the array.  The root of the attibute path is the user.customData object itself.
     *
     * So, if your customData object was this and you needed to prompt the user if the companyName or companyId
     * attributes were missing, you would specify "companyName" or "companyId" in the array.
     *
     * ```ts
     * export interface MyCustomUserData {
     *     companyName: string;
     *     companyId: string;
     * }
     * ```
     *
     * The prompt will be shown if the data is missing each time they come to chat app and if they dismiss the prompt,
     * the prompt will be shown if they try to submit a message to the agent instead of sending the message.
     */
    promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing?: string[];
}

/** Used in front end to pass settings from server to client. */
export type UserDataOverrideSettings = Omit<UserDataOverridesSiteFeature, 'userTypes' | 'promptUserIfAnyOfTheseCustomUserDataAttributesAreMissing'> & {
    userNeedsToProvideDataOverrides: boolean;
};

export interface HomePageSiteFeature {
    /**
     * The title of the home page.  If not provided, the default title will be used.  This is used
     * to describe the home page to the user and in navigation.
     */
    homePageTitle?: string;

    /**
     * The welcome message to display on the home page.  If not provided, the default welcome message will be used.
     * This is used to describe the home page to the user and in navigation.
     */
    welcomeMessage?: string;

    //TODO: add icon support

    /**
     * Whether to have the chat app home page show links to registered chat apps. If none of the
     * userChatAppRules match the user, then the user will not see any links to chat apps on the home page.
     */
    linksToChatApps?: HomePageLinksToChatAppsSiteFeature;
}

/**
 * Whether to have the chat app home page show links to registered chat apps. If none of the
 * userChatAppRules match the user, then the user will not see any links to chat apps on the home page.
 *
 * This is a site-wide feature and is not associated with a specific chat app.  You define this config
 * in the chat app config in <root>/pik-config.json
 */
export interface HomePageLinksToChatAppsSiteFeature {
    /**
     * Which users are able to get links to which chat apps on the home page.  You must have at least one rule to enable this feature.
     *
     * ```ts
     * {
     *     siteFeatures: {
     *         homePageLinksToChatApps: {
     *             userChatAppRules: [
     *                 // External users can only see links to external chat apps
     *                 {
     *                     userTypes: ['external-user'],
     *                     chatAppUserTypes: ['external-user']
     *                 },
     *                 // Internal users can see links to internal and external chat apps
     *                 {
     *                     userTypes: ['internal-user'],
     *                     chatAppUserTypes: ['internal-user', 'external-user']
     *                 }
     *             ]
     *         }
     *     }
     * }
     * ```
     */
    userChatAppRules: UserChatAppRule[];
}

export interface BaseStackConfig {
    projNameL: string; // All lowercase no stage name e.g. pika
    projNameKebabCase: string; // Kebab case no stage name e.g. pika
    projNameTitleCase: string; // Title case no stage name e.g. Pika
    projNameCamel: string; // Camel case no stage name e.g. pika
    projNameHuman: string; // Human readable no stage name e.g. Pika
}

export interface PikaStack extends BaseStackConfig {
    viteConfig?: {
        server?: ViteServerConfig;
        preview?: VitePreviewConfig;
    };
}

export interface ViteServerConfig {
    host?: string;
    port?: number;
    strictPort?: boolean;
    https?: {
        key: string; // Path to key file
        cert: string; // Path to cert file
    };
}

export interface VitePreviewConfig {
    host?: string;
    port?: number;
    strictPort?: boolean;
}
