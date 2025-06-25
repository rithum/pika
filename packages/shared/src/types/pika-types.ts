import { PikaUserRole, UserType } from './chatbot/chatbot-types';

export interface PikaConfig {
    pika: PikaStack;
    pikaChat: BaseStackConfig;
    weather?: BaseStackConfig;

    /** Features that are turned on/configured site-wide. */
    siteFeatures?: SiteFeatures;
}

export interface SiteFeatures {
    homePageLinksToChatApps?: HomePageLinksToChatAppsSiteFeature;
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

/**
 * By default, content rules exclude anything not explicitly included.
 */
export interface UserChatAppRule {
    /**
     * The user types allowed to access the content this rule is applied to.  Use `*` for all user types.
     *
     * If you support both internal and external users and internal/external chat apps then you should
     * create two ChatAppContentRule objects, one for internal users and one for external users.
     */
    userTypes?: UserType[];

    /**
     * The user types allowed to access the chat apps this rule is applied to.  Use `*` for all user types.
     *
     * If you support both internal and external users and internal/external chat apps then you should
     * create two ChatAppContentRule objects, one for internal users and one for external users.
     */
    chatAppUserTypes?: UserType[];

    /** The user roles allowed to access the content this rule is applied to.  Use `*` for all roles. */
    userRoles?: PikaUserRole[];

    /**
     * The chat apps to include on the home page with these user roles.
     *
     * If not provided, then the user roles allowed in the chat app will be used.
     */
    chatAppUserRoles?: PikaUserRole[];

    /** Explicitly included chat apps.  Use `*` for all chat apps.*/
    chatAppIdsToInclude?: string[];

    /** Explicitly excluded chat apps.  `*` will not be allowed since all chat apps are excluded by default. */
    chatAppIdsToExclude?: string[];
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
