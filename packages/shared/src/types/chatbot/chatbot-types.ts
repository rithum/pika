//TODO: make sure to turn on model invocation logging in aws

import type { FunctionDefinition, Trace } from '@aws-sdk/client-bedrock-agent-runtime';

export type CompanyType = 'retailer' | 'supplier';

/**
 * Data persisted by Bedrock Agent for each session, set
 * by calling the `initSession` function for a lambda
 * action group.
 */
export interface SessionData {
    /** Unique identifier for the session */
    sessionId: string;
    /** The company id for the session */
    companyId: string;
    /** Type of company participating in the session */
    companyType: CompanyType;
    /** Current date in ISO 8601 format */
    date: string;
    /** The agent id for the session */
    agentId: string;
}

/**
 * Represents a chat session between a user and an agent.  A session is a sequential
 * collection of messages between a user and an agent.  The most recent message is
 * lastMessageId.
 */
export interface ChatSession<T extends RecordOrUndef = undefined> {
    /** Unique identifier for this chat session */
    sessionId: string;
    /** Unique identifier of the user participating in the session */
    userId: string;
    /** Identifier for the agent alias being used */
    agentAliasId: string;
    /** Identifier for the specific agent instance */
    agentId: string;
    /** Identifier for the chat app */
    chatAppId: string;
    /** Unique identifier for the user's identity */
    identityId: string;
    /** Title or name of the chat session */
    title?: string;
    /** ID of the most recent message in the session */
    lastMessageId?: string;
    /** Additional session-specific attributes */
    sessionAttributes: SessionDataWithChatUserCustomDataSpreadIn<T>;
    /** Cost of processing input tokens in USD */
    inputCost?: number;
    /** Number of tokens processed in input messages */
    inputTokens?: number;
    /** Cost of generating output tokens in USD */
    outputCost?: number;
    /** Number of tokens generated in output messages */
    outputTokens?: number;
    /** Total cost of the session (input + output) in USD */
    totalCost?: number;
    /** ISO 8601 formatted timestamp of when the session was created */
    createDate: string;
    /** ISO 8601 formatted timestamp of the last session update */
    lastUpdate: string;

    /** Expiration date of the message in Unix seconds */
    exp_date_unix_seconds?: number;
}

/**
 * Additional attributes specific to a chat session.  This plus ChatUser.customData spreads into the sessionAttributes on a session using the SessionDataWithChatUserCustomDataSpreadIn type.
 */
export interface SessionAttributes {
    /** First name of the user participating in the session */
    firstName?: string;
    /** Last name of the user participating in the session */
    lastName?: string;
    /** Timezone of the session in IANA format */
    timezone?: string;
    //TODO: @clint do we need this still?
    /** A session token that can be used to identify the session.  This is used to identify the session in the database. */
    token?: string;

    //TODO: @clint do we need sessionID still in this?

    /** The user's ID */
    userId: string;
    //TODO: this seems stupid, commented out.
    // /** The ID of the session */
    // sessionId: string;
    /** The ID of the chat app */
    chatAppId: string;
    /** The ID of the agent */
    agentId: string;
    /** The current date in ISO 8601 format */
    currentDate: string;
}

/** Session attributes with spread type T if T is an object.  T is the type of ChatUser.customData.  If T is undefined, then SessionAttributes is returned. */
export type SessionDataWithChatUserCustomDataSpreadIn<T extends RecordOrUndef = undefined> = T extends object ? SessionAttributes & T : SessionAttributes;

/** This is used when creating a new chat session initially, the token will be generated. */
export type SessionAttributesWithoutToken<T extends RecordOrUndef = undefined> = Omit<SessionDataWithChatUserCustomDataSpreadIn<T>, 'token'>;

/** This is used when creating a new chat session initially, the omitted fields are generated. */
export type ChatSessionForCreate<T extends RecordOrUndef = undefined> = Omit<ChatSession<T>, 'sessionId' | 'createDate' | 'lastUpdate' | 'sessionAttributes'> & {
    sessionAttributes: SessionAttributesWithoutToken<T>;
};

export const MessageSource = ['user', 'assistant'] as const;
export type MessageSource = (typeof MessageSource)[number];

/**
 * Represents a message in a chat session, containing metadata about the message
 * and its usage statistics.
 */
export interface ChatMessage {
    /** Unique identifier of the user who sent/received the message */
    userId: string;
    /** Unique identifier for the chat session this message belongs to */
    sessionId: string;
    /** Unique identifier for this specific message */
    messageId: string;
    /** The message content */
    message: string;
    /** Indicates whether the message originated from a user or the assistant */
    source: MessageSource;
    /** The AI model used to generate the response (if from bot) */
    model?: string;
    /** ISO 8601 formatted timestamp of when the message was created */
    timestamp: string;
    /** Usage statistics for this message */
    usage?: ChatMessageUsage;
    /** Array of AWS Bedrock traces containing detailed information about the model's execution */
    traces?: Trace[];
    /** Duration of the message in milliseconds */
    executionDuration?: number;
    /** Additional data to be stored in the message.  Currently used to store any errors that may have occurred during agent invocation*/
    additionalData?: string;

    /** Files associated with the message */
    files?: ChatMessageFile[];

    /** Expiration date of the message in Unix seconds */
    exp_date_unix_seconds?: number;

    /** Verification Classifications */
    verifications?: {
        main: VerifyResponseClassification;
        correction?: VerifyResponseClassification;
    };
}

export interface ChatMessageForRendering extends ChatMessage {
    segments: MessageSegment[];
    isStreaming?: boolean;
}

/** Supported file storage locations */
export const ChatMessageFileLocationType = ['s3'] as const;
export type ChatMessageFileLocationType = (typeof ChatMessageFileLocationType)[number];

/** Supported file use cases */
export const ChatMessageFileUseCase = [
    /** This means the file will be read by the LLM and it will be used to answer the user's question. */
    'chat',
    /**
     * We will append the following to the user's message before we give it to the LLM:
     *
     * (if the  file is of type ChatMessageFileS3)
     * Available S3 files: s3://<s3-bucket-name>/<s3-key>
     *
     * You can be certain the <s3-bucket-name> will always be this value from SSM `/stack/chatbot/${this.stage}/s3/upload_bucket_name` so you
     * can add permissions to allow your lambda tool to have read access to the uploaded files.
     */
    'pass-through',
    /**
     * This means that the LLM will write and execute Python code to analyze the contents of the file to answer the user's question.
     */
    'analytics'
] as const;
export type ChatMessageFileUseCase = (typeof ChatMessageFileUseCase)[number];

/** Base properties for message files */
export interface ChatMessageFileBase {
    /**
     * Unique identifier for the file
     *
     * In the case of S3 files, this is `s3://<s3-bucket-name>/<s3-key>`
     */
    fileId: string;
    /** The name of the file for display purposes */
    fileName: string;
    /** The size of the file in bytes */
    size: number;
    /** The last modified date of the file in milliseconds since epoch */
    lastModified: number;
    /** The type of the file */
    type: string;
    /** Type of file */
    locationType: ChatMessageFileLocationType;
    /** The use case for the file. Defaults to `pass-through` if not provided. */
    useCase?: ChatMessageFileUseCase;
}

/** S3-stored message file */
export interface ChatMessageFileS3 extends ChatMessageFileBase {
    locationType: 's3';
    s3Bucket: string;
    s3Key: string;
}

/** Union type for all message file types */
export type ChatMessageFile = ChatMessageFileS3;

/**
 * This is used when creating a new chat message, the messageId and timestamp are generated.
 */
export type ChatMessageForCreate = Omit<ChatMessage, 'messageId' | 'timestamp'>;

export const UserTypes = ['internal-user', 'external-user'] as const;
export type UserType = (typeof UserTypes)[number];

// A type to differentiate known Pika roles
type PikaRoleType<T, B> = T & { __pika: B };

// Define known Pika roles
export const PikaUserRoles = [
    // A content admin may choose any user in the system and view his chat sessions and messages
    'pika:content-admin',

    // A site admin may modify access settings for chat apps and assign roles to users
    'pika:site-admin'
] as const;
export type PikaUserRole = PikaRoleType<(typeof PikaUserRoles)[number], 'PikaUserRole'>;

// User-defined roles can be any string, but PikaUserRole is special
export type UserRole = PikaUserRole | (string & { __pika?: never });

export type RecordOrUndef = Record<string, string | undefined> | undefined;

/**
 * Represents a user in the chat system with their associated features and preferences.
 * This is saved in the chat user database.
 *
 * T is the type of customData you want to store in the user object, such as accountId, accountName, accountType, etc. This
 * data will be available to agent tools but not to the agent itself.
 */
export interface ChatUser<T extends RecordOrUndef = undefined> {
    /** Unique identifier for the user */
    userId: string;
    /** First name of the user */
    firstName?: string;
    /** Last name of the user */
    lastName?: string;
    /** Custom user data to associate with the user.  For example, accountId, accountName, accountType, etc. */
    customData?: T;
    /**
     * If the user is a content admin, this will be set to the user they are viewing content for.
     * This is used to allow content admins to view chat sessions and messages for all users for debugging purposes.
     *
     * The key is the chatAppId and the value is the user they are viewing content for.
     */
    viewingContentFor?: Record<string, ChatUserLite>;
    /**
     * This will be set by the pika infrastructure when we find a user that is allowed to use the user override data
     * feature and actually has used the webapp user override data dialog to choose what values to override.
     *
     * This allows for the user to override `customData` specific to a chat app.
     *
     * It is never persisted to the database, it is saved server side in a secure cookie.
     *
     * The key is the chatAppId and the value is the override data for that chat app.
     */
    overrideData?: Record<string, T>;
    /** ISO 8601 formatted timestamp of when the user was created */
    createDate?: string;
    /** ISO 8601 formatted timestamp of when the user was last updated */
    lastUpdate?: string;
    /** Some chat apps and features are only accessible to internal users.  This is used to determine if the user is internal or external. */
    userType?: UserType;
    /** The only role supported right now is 'pika:content-admin'.  Pika Content Admin users are allowed to view chat sessions and messages for all users to help with debugging. */
    roles?: (PikaUserRole | string)[];
    /** Map of feature types to their corresponding feature configurations */
    features: {
        [K in FeatureType]: K extends 'instruction' ? InstructionFeature : K extends 'history' ? HistoryFeature : never;
    };
}

export interface ChatUserLite {
    userId: string;
    firstName?: string;
    lastName?: string;
}

/**
 * This includes auth information that is not stored in the chat user database.
 * It is not provided to clients and is used server side.
 *
 * Auth data is data your app needs such as access tokens, refresh tokens, etc.
 *
 * T is the type you want to store in the authData field, if any.  This is not stored in the database.
 * U is the type of customData you want to store in the user object.
 */
export interface AuthenticatedUser<T extends RecordOrUndef = undefined, U extends RecordOrUndef = undefined> extends ChatUser<U> {
    authData?: T;
}

/**
 * This is a simplified version of AuthenticatedUser that is used for auth headers.
 * Note that type T may be the type "undefined" indicating that there is no custom user data.
 * The custom user data comes from the ChatUser.customData field provided by the auth provider.
 *
 * Not that JSON.stringify(SimpleAuthenticatedUser) must not be more than 2k in size or you risk
 * getting an erorr when we try to put it in a JWT token and send it as an http header.
 */
export interface SimpleAuthenticatedUser<T extends RecordOrUndef = undefined> {
    userId: string;
    customUserData?: T;
}

/**
 * These are features that are turned on at the site level in the <root>/pika-config.ts file and that may then
 * be overridden by individual chat apps.
 *
 * This is a short hand to store the computation that went into determining if a given user is allowed
 * to use the various features of pika.  It is not persisted to the database or in cookies.  We use it
 */
export interface ChatAppOverridableFeatures {
    /**
     *
     * If true then the verify response feature is enabled.
     *
     * With this feature enabled, Pika will attempt to identify the veracity of the response from the LLM to a
     * user message.  @see <root>/docs/developer/verify-response-feature.md
     *
     * The logic for turning this on or off is a merging of the site level setting and the chat app level setting.
     */
    verifyResponse: {
        /** If false, we don't verify responses at all. */
        enabled: boolean;
        /** If not defined, we don't auto-reprompt the user's question. */
        autoRepromptThreshold?: VerifyResponseClassification;
    };

    /**
     * If enabled, then the traces feature is enabled. If enabled, then the front end will show the traces from
     * the LLM in the chat app except for the detailed traces for the given user.  The detailed traces are only
     * shown to the user if the detailedTraces feature is also enabled for the given user.
     *
     * The logic for turning this on or off is a merging of the site level setting and the chat app level setting.
     *
     * @see <root>/docs/developer/traces-feature.md
     */
    traces: {
        enabled: boolean;
        detailedTraces: boolean;
    };

    /**
     * The disclaimer notice to show to the user.  This is used to inform the user that the chat is not
     * a substitute for human customer support and that the company is not liable for problems caused by
     * relying solely on the chat.
     */
    chatDisclaimerNotice: string | undefined;

    /**
     * If true, then the logout feature is enabled.  If enabled, then the user will see a logout menu item
     * in the chat app.  If the user clicks the logout menu item, then the user will be logged out and
     * redirected.
     */
    logout: {
        enabled: boolean;
        menuItemTitle: string;
        dialogTitle: string;
        dialogDescription: string;
    };

    /**
     * If websiteEnabled is true, users with pika:site-admin role will be able to access the site admin features.
     */
    siteAdmin: {
        websiteEnabled: boolean;
    };
}

export type ChatAppOverridableFeaturesForConverseFn = Omit<ChatAppOverridableFeatures, 'chatDisclaimerNotice' | 'traces' | 'logout'>;

/**
 * By default, content rules exclude anything not explicitly included.
 */
export interface UserChatAppRule {
    /**
     * The user types allowed to access the content this rule is applied to.
     *
     * If you support both internal and external users and internal/external chat apps then you should
     * create two ChatAppContentRule objects, one for internal users and one for external users.
     */
    userTypes?: UserType[];

    /**
     * The user types allowed to access the chat apps this rule is applied to.
     *
     * If you support both internal and external users and internal/external chat apps then you should
     * create two ChatAppContentRule objects, one for internal users and one for external users.
     */
    chatAppUserTypes?: UserType[];
}

/** Array of available feature types in the system */
export const FeatureTypeArr = ['instruction', 'history'] as const;
/** Type representing the available feature types */
export type FeatureType = (typeof FeatureTypeArr)[number];

/** Union type of all possible feature configurations */
export type ChatUserFeature = InstructionFeature | HistoryFeature;

/**
 * Base interface for all feature configurations
 */
export interface ChatUserFeatureBase {
    /** Type identifier for the feature */
    type: FeatureType;
}

/**
 * Configuration for instruction-based features
 */
export interface InstructionFeature extends ChatUserFeatureBase {
    type: 'instruction';
    /** The optional additional instructions for the agent */
    instruction: string;
}

/**
 * Configuration for history-based features
 */
export interface HistoryFeature extends ChatUserFeatureBase {
    type: 'history';
    /** Whether history feature is enabled */
    history: boolean;
}

/**
 * Contains usage statistics for a chat message, including token counts and associated costs.
 */
export interface ChatMessageUsage {
    /** Cost of processing the input tokens in USD */
    inputCost: number;
    /** Number of tokens in the input message */
    inputTokens: number;
    /** Cost of generating the output tokens in USD */
    outputCost: number;
    /** Number of tokens in the output message */
    outputTokens: number;
    /** Total cost of processing this message (input + output) in USD */
    totalCost: number;
}

export interface BaseRequestData {
    userId: string;
    sessionId?: string;
    chatAppId?: string;
    agentId?: string;
    agentAliasId?: string;
    companyId?: string;
    companyType?: CompanyType;
    timezone?: string;
}

export interface ConverseRequest extends BaseRequestData {
    message: string;

    /**
     * The features that are enabled for the user making the request for the chat app this request is tied to.
     */
    features: ChatAppOverridableFeaturesForConverseFn;

    files?: ChatMessageFile[];

    /**
     * This it the agentID from the agent definition dynamodb table.
     * It allows us to dynamically change the agent used for the conversation.
     */
    agentId: string;
}

export interface ChatTitleUpdateRequest extends BaseRequestData {
    /** If provided, this will be used as the title for the session */
    title?: string;
    /** The question that was asked in case we need to use bedrock to generate a title */
    userQuestionAsked?: string;
    /** The response that was generated in case we need to use bedrock to generate a title */
    answerToQuestionFromAgent?: string;
}

export interface ChatUserResponse<T extends RecordOrUndef = undefined> {
    success: boolean;
    user: ChatUser<T> | undefined;
    error?: string;
}

export interface ChatUserSearchResponse {
    success: boolean;
    users: ChatUserLite[];
    error?: string;
}

export interface ChatUserAddOrUpdateResponse<T extends RecordOrUndef = undefined> {
    success: boolean;
    user: ChatUser<T>;
    error?: string;
}

export interface ChatMessageResponse {
    success: boolean;
    message: ChatMessage;
    error?: string;
}

export interface ChatMessagesResponse {
    success: boolean;
    messages: ChatMessage[];
    error?: string;
}

export interface ChatSessionResponse {
    success: boolean;
    session: ChatSession;
    error?: string;
}

export interface ChatSessionsResponse {
    success: boolean;
    sessions: ChatSession[];
    error?: string;
}

// Agent Definition System Types

/**
 * Access control rule for agents and tools
 */
export interface AccessRule {
    /** Condition expression for access control (e.g., "user.scope IN ['admin', 'user'] AND account.type = 'retailer'") */
    condition?: string;
    /** Effect of the rule - allow or deny access */
    effect: 'allow' | 'deny';
    /** Order/priority for rule evaluation (lower numbers evaluated first) */
    order?: number;
    /** Optional description of the rule */
    description?: string;
}

/**
 * Rollout policy configuration for agent definitions
 */
export interface RolloutPolicy {
    /** List of beta account IDs that can access this agent */
    betaAccounts?: string[];
    /** List of AWS regions where this agent is available */
    regionRestrictions?: string[];
    /** Tool overrides mapping old tool IDs to new tool IDs */
    toolOverrides?: Record<string, string>;
}

/**
 * Agent definition representing an LLM agent configuration
 */
export interface AgentDefinition {
    /** Unique agent identifier (e.g., 'weather-bot') */
    agentId: string;
    /** System prompt template (can be a handlebars template with placeholders like {{user.email}}) */
    basePrompt: string;
    /** List of access control rules with conditions.  If not provided, the agent will be accessible to all users. */
    accessRules?: AccessRule[];
    /** Optional Lambda ARN for augmenting prompt/session context (future feature) */
    runtimeAdapter?: string;
    /** Rollout gating configuration per account/org/region.  If not provided, the agent will be accessible to all users. */
    rolloutPolicy?: RolloutPolicy;
    /** Cache configuration for testing and debugging, used in lambdas that create LRU caches for agent definitions */
    dontCacheThis?: boolean;
    /** List of tool definitions that this agent uses */
    toolIds: string[];
    /** A list of knowledge bases that are associated with this agent. */
    knowledgeBases?: KnowledgeBase[];
    /** Agent definition version */
    version: number;
    /** User who created the definition */
    createdBy: string;
    /** Last editor user */
    lastModifiedBy: string;
    /** ISO 8601 formatted timestamp of creation */
    createdAt: string;
    /** ISO 8601 formatted timestamp of last update */
    updatedAt: string;

    /** If true, this is a test agent that will get deleted after 1 day.  This is used for testing. */
    test?: boolean;
}

export type UpdateableAgentDefinitionFields = Extract<
    keyof AgentDefinition,
    'basePrompt' | 'toolIds' | 'accessRules' | 'runtimeAdapter' | 'rolloutPolicy' | 'dontCacheThis' | 'knowledgeBases'
>;

export type AgentDefinitionForUpdate = Partial<Omit<AgentDefinition, 'version' | 'createdAt' | 'createdBy' | 'updatedAt' | 'lastModifiedBy' | 'test'>> & {
    agentId: string;
};

export type AgentDefinitionForCreate = Omit<AgentDefinition, 'version' | 'createdAt' | 'updatedAt'> & {
    agentId?: AgentDefinition['agentId'];
};

/**
 * This allows you to do an idempotent create or update of an agent and its tools. You can create or modify
 * and its tools.  If you specify tools then we will intelligently create or update the tools.  If you don't
 * specify tools then we will just create the agent.
 *
 * If you use this you must provide an agentId so we can match up what's there already with what is being provided.
 * If you provide tools then you must provide a toolId for each tool so we can match up what's there already with what is being provided.
 * You may either provide agent.toolIds or tools but not both.
 */
export interface AgentDataRequest {
    /**
     * Agent must have an ID provided or we will throw an exception since we can't match up what's there already
     * with what is being provided in the custom resource in an idempotent way.
     */
    agent: AgentDefinitionForIdempotentCreateOrUpdate;

    /**
     * If you are creating one of these objects through the CloudFormation custom resource, then you should set this
     * to be something that is tied to the stack that did the creation/update and we ask that you prepend it with 'cloudformation/'
     * so we understand it was created/updated by cloudformation as in 'cloudformation/my-stack-name'.
     */
    userId: string;

    /**
     * Tools must have an ID provided or we will throw an exception since we can't match up what's there already
     * with what is being provided in the custom resource in an idempotent way.
     */
    tools?: ToolDefinitionForIdempotentCreateOrUpdate[];
}

/**
 * In the AgentDataReqest.tools we find that we need to pass in the arn of the lambda function that is the tool.
 * However, at build time you may not have the arn of the lambda function.  So, in the Agent custom resource
 * we allow you to pass in a map of toolId to lambdaArn.  Then, the custom resource lambda will use this map
 * to replace the lambdaArn with the actual arn of the lambda function.
 *
 * THe key is the toolID and the value is the lambdaArn.
 */
export type ToolIdToLambdaArnMap = Record<string, string>;

export interface AgentAndTools {
    agent: AgentDefinition;
    tools?: ToolDefinition[];
}

export interface AgentDataResponse {
    success: boolean;
    error?: string;
    agent: AgentDefinition;
    tools?: ToolDefinition[];
}

export interface ChatAppDataResponse {
    success: boolean;
    error?: string;
    chatApp: ChatApp;
}

export type AgentDefinitionForIdempotentCreateOrUpdate = Omit<AgentDefinition, 'toolIds' | 'version' | 'createdAt' | 'updatedAt' | 'lastModifiedBy' | 'createdBy'> & {
    toolIds?: string[];
};
/**
 * Execution type for tool definitions.  Right now, only lambda is supported.
 */
export type ExecutionType = 'lambda' | 'http' | 'inline';

/**
 * Lifecycle status for tool definitions
 */
export type LifecycleStatus = 'enabled' | 'disabled' | 'retired';

/**
 * Lifecycle management configuration for tools
 */
export interface ToolLifecycle {
    /** Current status of the tool */
    status: LifecycleStatus;
    /** Optional deprecation date in ISO 8601 format */
    deprecationDate?: string;
    /** Optional migration path to newer tool version */
    migrationPath?: string;
}

/**
 * JSON Schema definition
 */
// export interface JsonSchema {
//     type: string;
//     properties?: Record<string, any>;
//     required?: string[];
//     [key: string]: any;
// }

/**
 * Bedrock function schema definition
 */
// export interface BedrockFunctionSchema {
//     name: string;
//     description: string;
//     parameters: JsonSchema;
// }

/**
 * Tool definition representing a callable function/service
 */
export interface ToolDefinition {
    /** Unique tool name/version (e.g., 'weather-basic@1') */
    toolId: string;
    /** Friendly display name */
    displayName: string;
    /** Must not have spaces and no punctuation except _ and - :  ([0-9a-zA-Z][_-]?){1,100} */
    name: string;
    /** Description for LLM consumption. MUST BE LESS THAN 500 CHARACTERS */
    description: string;
    /** Type of execution (lambda, http, inline) */
    executionType: ExecutionType;
    /** Timeout in seconds (default: 30) */
    executionTimeout?: number;
    /**
     * If executionType is 'lambda', this is the required ARN of the Lambda function.
     * Note that the Lambda function must have an 'agent-tool' tag set to 'true'.
     */
    lambdaArn?: string;
    /**
     * List of agent frameworks that this tool supports
     *
     * If you choose to support bedrock, you must provide a functionSchema.
     */
    supportedAgentFrameworks: AgentFramework[];
    /** Bedrock-specific function schema (auto-generated or provided) */
    functionSchema?: FunctionDefinition[];
    /** Tag map for filtering and categorization */
    tags?: Record<string, string>;
    /** Lifecycle management configuration */
    lifecycle?: ToolLifecycle;
    /** Tool version */
    version: number;
    /** List of access control rules */
    accessRules?: AccessRule[];
    /** User who created the tool */
    createdBy: string;
    /** User who last modified the tool */
    lastModifiedBy: string;
    /** ISO 8601 formatted timestamp of creation */
    createdAt: string;
    /** ISO 8601 formatted timestamp of last update */
    updatedAt: string;

    /** If true, this is a test tool that will get deleted after 1 day.  This is used for testing. */
    test?: boolean;
}

export type UpdateableToolDefinitionFields = Extract<
    keyof ToolDefinition,
    | 'name'
    | 'displayName'
    | 'description'
    | 'executionType'
    | 'executionTimeout'
    | 'lambdaArn'
    | 'supportedAgentFrameworks'
    | 'functionSchema'
    | 'tags'
    | 'lifecycle'
    | 'accessRules'
>;

export type ToolDefinitionForCreate = Omit<ToolDefinition, 'version' | 'createdAt' | 'updatedAt' | 'lastModifiedBy' | 'createdBy'> & {
    toolId?: ToolDefinition['toolId'];
};

export type ToolDefinitionForIdempotentCreateOrUpdate = Omit<ToolDefinition, 'version' | 'createdAt' | 'updatedAt' | 'lastModifiedBy' | 'createdBy'> & {
    lambdaArn: string;
    functionSchema: FunctionDefinition[];
    supportedAgentFrameworks: ['bedrock'];
};

export type ToolDefinitionForUpdate = Partial<Omit<ToolDefinition, 'version' | 'createdAt' | 'createdBy' | 'updatedAt' | 'lastModifiedBy'>> & {
    toolId: string;
};

export type AgentFramework = 'bedrock';

export interface CreateAgentRequest {
    agent: AgentDefinitionForCreate;
    existingToolsToAssociate?: string[];
    newToolsToCreate?: ToolDefinitionForCreate[];
    userId: string;
}

export interface UpdateAgentRequest {
    agent: AgentDefinitionForUpdate;
    userId: string;
}

export interface CreateToolRequest {
    tool: ToolDefinitionForCreate;
    userId: string;
}
export interface GetChatAppsByRulesRequest {
    /** We use this to lookup the user and their userType. */
    userId: string;

    /** If this request is to figure out which chat apps to show on the home page, then this will be present. */
    homePageFilterRules?: UserChatAppRule[];

    /** If provided, then we will only return this one chat app and then only if the user is allowed to access it. */
    chatAppId?: string;

    /**
     * If true, then we will return the list of apps that the user is allowed to see on the home page.
     * Note that this could be different than the list of apps that the user is allowed to access
     * if they don't want to show a given app on the home page.
     */
    chatAppsForHomePage?: boolean;

    /**
     * We sometimes need to know if a user's associated "entity" (account or company) is allowed to access a chat app.
     * This is the path to the custom data field that is used to match against the entity.  Of course,
     * your AuthProvider will need to implement this method to return the path to the custom data field and this
     * assumes that your users actually have a customData field and are associated with an entity like an account or company.
     * that you might want to match against.
     *
     * For example, if a user is associated with an account and has `customData.accountId` then this might be 'accountId'.
     */
    customDataFieldPathToMatchUsersEntity?: string;
}

export interface GetChatAppsByRulesResponse {
    success: boolean;
    chatApps: ChatApp[];
    error?: string;
}

export interface UpdateToolRequest {
    tool: ToolDefinitionForUpdate;
    userId: string;
}

export interface SearchToolsRequest {
    toolIds: string[];
    userId: string;
}

export interface CreateChatAppRequest {
    chatApp: ChatAppForCreate;
    userId: string;
}

export interface UpdateChatAppRequest {
    chatApp: ChatAppForUpdate;
    userId: string;
}

export interface CreateOrUpdateChatAppOverrideRequest {
    override: ChatAppOverrideForCreateOrUpdate;
    userId: string;
}

export interface CreateOrUpdateChatAppOverrideResponse {
    success: boolean;
    chatAppOverride: ChatAppOverride;
}

export interface DeleteChatAppOverrideResponse {
    success: boolean;
}

export interface DeleteChatAppOverrideRequest {}

export type ChatAppMode = 'standalone' | 'embedded';

/**
 * This extends AccessRules so you can enable/disable the chat app for certain users.
 */
export interface ChatApp extends AccessRules {
    /**
     * Unique ID for the chat. Only - and _ allowed.  Will
     * be used in URL to access the chatbot so keep that in mind
     */
    chatAppId: string;

    /**
     * The modes that this chat app supports.  If not provided, then all modes are supported.
     * `standalone` means that the chat app can be displayed standalone in a website
     * not embedded in another website as an iframe.  `embedded` means that the chat app
     * is embedded in another website as an iframe.
     */
    modesSupported?: ChatAppMode[];

    /**
     * Set to true when actively developing so changes are reflected immediately.
     * Various lambdas will cache this data for some minutes (usually 5).
     */
    dontCacheThis?: boolean;

    /**
     * The title of the chat app, a human readable name.  This is the title that will be displayed in the title bar of the chat app when
     * in standalone mode.
     */
    title: string;

    /**
     * A description of the chat app.  This is used to describe the chat app to the user and in navigation.
     * Required.  Must be less than 300 characters (not currently enforced but will be in the future).
     */
    description: string;

    /**
     * The ID of the agent that should be invoked for this chat app (e.g. 'weather-agent').
     * Must be the agentId of an agent that exists in the agent definition table.
     */
    agentId: string;

    /**
     * Optional way to override the original access control settings provided when the
     * chat app was deployed.  This is not stored on the actual chat app record in the
     * chat-app table.  If not provided, falls back to the access control settings set
     * by the chat app when it was deployed.
     *
     * This ChatAppOverride data is stored in a separate record in the chat-app table
     * where the chatAppId is `${chatAppId}:override`.  It is stored
     * separately so the list of included entities can grow quite large if needed.
     *
     * When you retrieve a ChatApp using the APIs, this will be populated for you if
     * an override record exists.
     *
     * This is useful so we can modify access control settings without having to redeploy the
     * chat app itself.
     */
    override?: ChatAppOverride;

    /** Any feature not explicitly defined and turned on is turned off by default. */
    features?: Partial<Record<FeatureIdType, ChatAppFeature>>;

    /** ISO 8601 formatted timestamp of when the session was created */
    createDate: string;

    /** ISO 8601 formatted timestamp of the last chat app update */
    lastUpdate: string;

    /** If true, this is a test chat app that will get deleted after 1 day.  This is used for testing. */
    test?: boolean;
}

export interface ChatAppLite {
    /**
     * Unique ID for the chat. Only - and _ allowed.  Will
     * be used in URL to access the chatbot so keep that in mind
     */
    chatAppId: string;

    /**
     * The title of the chat app, a human readable name.  This is the title that will be displayed in the title bar of the chat app when
     * in standalone mode.
     */
    title: string;

    /**
     * A description of the chat app.  This is used to describe the chat app to the user and in navigation.
     * Required.  Must be less than 300 characters (not currently enforced but will be in the future).
     */
    description: string;

    /**
     * The ID of the agent that should be invoked for this chat app (e.g. 'weather-agent').
     * Must be the agentId of an agent that exists in the agent definition table.
     */
    agentId: string;

    /**
     * The user types that are allowed to access this chat app.  If not provided, then all user types are allowed.
     */
    userTypes?: UserType[];
}

export interface KnowledgeBase {
    /** A unique identifier for the knowledge base  */
    id: string;

    /** The agent frameworks that this knowledge base supports */
    supportedAgentFrameworks: AgentFramework[];

    /** A description of the knowledge base */
    description: string;
}

export type UpdateableChatAppFields = Extract<
    keyof ChatApp,
    'dontCacheThis' | 'title' | 'description' | 'agentId' | 'features' | 'enabled' | 'userTypes' | 'userRoles' | 'modesSupported'
>;

export type ChatAppForCreate = Omit<ChatApp, 'createDate' | 'lastUpdate'>;

export type ChatAppForUpdate = Partial<Omit<ChatApp, 'createDate' | 'lastUpdate'>>;

export type ChatAppForIdempotentCreateOrUpdate = Omit<ChatApp, 'createDate' | 'lastUpdate'>;

/**
 * This allows you to do an idempotent create or update of a chat app.
 *
 * If you use this you must provide a chatAppId so we can match up what's there already with what is being provided.
 */
export interface ChatAppDataRequest {
    /**
     * ChatApp must have an ID provided or we will throw an exception since we can't match up what's there already
     * with what is being provided in the custom resource in an idempotent way.
     */
    chatApp: ChatAppForIdempotentCreateOrUpdate;

    /**
     * If you are creating one of these objects through the CloudFormation custom resource, then you should set this
     * to be something that is tied to the stack that did the creation/update and we ask that you prepend it with 'cloudformation/'
     * so we understand it was created/updated by cloudformation as in 'cloudformation/my-stack-name'.
     */
    userId: string;
}

export type ChatAppFeature =
    | FileUploadFeature
    | SuggestionsFeature
    | PromptInputFieldLabelFeature
    | UiCustomizationFeature
    | VerifyResponseFeatureForChatApp
    | TracesFeatureForChatApp;

export interface Feature {
    /**
     * Must be unique, only alphanumeric and -  _  allowed, may not start with a number
     *
     * This is used to identify the feature in the database.
     */
    featureId: FeatureIdType;

    /** Whether the feature is on or off for the chat app in question. Most features are off by default, see the specific feature for details. */
    enabled: boolean;
}

export const FeatureIdList = ['fileUpload', 'promptInputFieldLabel', 'suggestions', 'uiCustomization', 'verifyResponse', 'traces', 'chatDisclaimerNotice', 'logout'] as const;
export type FeatureIdType = (typeof FeatureIdList)[number];

export const EndToEndFeatureIdList = ['verifyResponse', 'traces'] as const;
export type EndToEndFeatureIdType = (typeof EndToEndFeatureIdList)[number];

/**
 * Whether a feature is enabled by default or not.
 */
export const DEFAULT_FEATURE_ENABLED_VALUE: Record<FeatureIdType, boolean> = {
    fileUpload: false,
    promptInputFieldLabel: true,
    suggestions: false,
    uiCustomization: false,
    verifyResponse: false,
    traces: false,
    chatDisclaimerNotice: false,
    logout: false
};

export const FEATURE_NAMES: Record<FeatureIdType, string> = {
    fileUpload: 'File Upload',
    promptInputFieldLabel: 'Prompt Input Field Label',
    suggestions: 'Suggestions',
    uiCustomization: 'UI Customization',
    verifyResponse: 'Verify Response',
    traces: 'Traces',
    chatDisclaimerNotice: 'Chat Disclaimer Notice',
    logout: 'Logout'
};

export interface SiteAdminFeature {
    websiteEnabled: boolean;

    /** Ignored if websiteEnabled is false. */
    supportUserEntityAccessControl?: {
        /**
         * If you turn this on then we expect that you will provide
         */
        enabled: boolean;

        /** The placeholder text for the search input: e.g. "Search for an account...". Defaults to "Search for an entity..." */
        searchPlaceholderText?: string;

        /** The display name for a single entity: e.g. "Account". Defaults to "Entity" */
        entityDisplayNameSingular?: string;

        /** The display name for a plural of entities: e.g. "Accounts". Defaults to "Entities" */
        entityDisplayNamePlural?: string;
    };
}

/**
 * Why make this a feature?  Some enterprises that allow their internal users to act on behalf of other
 * users and accounts for the purpose of debugging and troubleshooting.  So, if the user is logged in as
 * one account, they can click a menu item to logout and then log in as another account.  The base case
 * for external users is to likely not have this feature as they are piggy backing on auth from
 * another enterprise site or system.
 */
export interface LogoutFeature extends AccessRules {
    /**
     * The title of the menu item that will be displayed to authorized users that when clicked will
     * log them out of the chat app.  Defaults to "Logout".
     */
    menuItemTitle?: string;

    /**
     * The title of the dialog that will be displayed when the user clicks the menu item.  Defaults to "Logout".
     */
    dialogTitle?: string;

    /**
     * The description that appears benath the title in the dialog window. Defaults to
     * "Are you sure you want to logout?"
     */
    dialogDescription?: string;
}

export interface LogoutFeatureForChatApp extends LogoutFeature, Feature {
    featureId: 'logout';
}

/**
 * If a notice is provided, Pika will display a disclaimer notice to the user.
 *
 * This feature must be enabled at the site level and then individual chat apps can choose to override
 * the notice text.
 */
export interface ChatDisclaimerNoticeFeature {
    /** The notice text to display to the user.  If not provided, no notice is displayed. */
    notice: string;
}

export interface ChatDisclaimerNoticeFeatureForChatApp extends ChatDisclaimerNoticeFeature, Feature {
    featureId: 'chatDisclaimerNotice';
}

/**
 * When turned on, Pika will attempt to identify the veracity of the response from the LLM to a user message.
 *
 * This feature must be enabled at the site level and then individual chat apps can choose to turn it off
 * if they do not want it on.  So, to function you must go to pika-config.ts and enable the feature.
 *
 * Further, individual chat apps can choose to override which users are allowed to use the feature.
 *
 * Note that enabling this will have no effect if the feature is not enabled at the site level first (@see pika-config.ts)
 * You can only choose to disable the feature at the chat app level if it is enabled at the site level.
 *
 * @see <root>/docs/developer/verify-response-feature.md
 */
export interface VerifyResponseFeature extends AccessRules {
    /**
     * The threshold for which response classifications will trigger an auto-reprompt to the LLM to correct the answer.
     *
     * If not defined, we will not automatically reprompt the user's question to the LLM to correct the answer.
     *
     * The classificationsa are currenly A, B, C and F with F being terrible and A being really really good.
     *
     * So, if you set this to F then the Pika will only automatically send the user's question back to the LLM to correct the answer
     * if the response verification is F.  If you set it to B then it would do so on B, C and F.
     *
     * Note you cannot set this to A since it is not retryable.
     *
     * Recommended default: 'C'
     */
    autoRepromptThreshold?: RetryableVerifyResponseClassification;
}

export interface VerifyResponseFeatureForChatApp extends VerifyResponseFeature, Feature {
    featureId: 'verifyResponse';
}

/**
 * When turned on, Pika will show the traces from the LLM in the chat app.  There are three primary types of traces:
 * - Orchestration traces: these show the fundamental reasoning process of the LLM
 * - Failure traces: these show the reason the LLM failed to answer the user's question
 * - Parameter traces: these show the actual parameters passed from the LLM to the tools it invoked
 *
 * By default, when you turn on the traces feature, detailed traces (meaning the parameter traces) are not shown
 * because they show a lot of detail about how the LLM is working. You must explicitly turn on the detailed traces
 * feature to show them.
 *
 * Individual chat apps can choose to override which users are allowed to use the feature.  This is done
 * by setting the detailedTraces property to an AccessRules object.  @see <root>/docs/developer/traces-feature.md
 *
 * Note that enabling this will have no effect if the feature is not enabled at the site level first (@see pika-config.ts)
 * You can only choose to disable the feature at the chat app level if it is enabled at the site level.
 */
export interface TracesFeature extends AccessRules {
    /**
     * If not provided, then the detailed traces are not shown.  If provided, then the detailed traces are shown
     * to the user if the user is allowed to use the detailed traces feature.
     */
    detailedTraces?: AccessRules;
}

export interface TracesFeatureForChatApp extends TracesFeature, Feature {
    featureId: 'traces';
}

/**
 * Whether to support UI customization in the chat app.  If true, then the chat app will support UI customization.
 */
export interface UiCustomizationFeature extends Feature {
    featureId: 'uiCustomization';

    /** Whether to show the chat history as left nav in full page mode.  Defaults to true. */
    showChatHistoryInStandaloneMode?: boolean;

    /** Whether to show the user region in the left nav in full page mode.  Defaults to true. */
    showUserRegionInLeftNav?: boolean;
}

/**
 * Whether to support suggestions in the chat app.  If true, then the chat app will support suggestions.
 * If false, then the chat app will not support suggestions.
 *
 * Default is false.
 */
export interface SuggestionsFeature extends Feature {
    featureId: 'suggestions';

    /**
     * A list of suggestions that will be displayed to the user relevant to the chat app.
     * Will be stored gzipped hex encoded in db.  Gzipped compressed value may not be more than 100kb.
     */
    suggestions: string[];

    /**
     * The maximum number of suggestions to show.  Defaults to 5.
     */
    maxToShow?: number;

    /**
     * Whether to randomize the suggestions.  Defaults to false.
     */
    randomize?: boolean;

    /**
     * If randomize is true, then this is the number of messages after which to randomize the suggestions.
     * This allws a certain number of suggestions to always show followed by random suggestions.  Defaults to 0.
     */
    randomizeAfter?: number;
}

/**
 * Whether the chat app supports uploading files and attaching them to the chat.
 */
export interface FileUploadFeature extends Feature {
    featureId: 'fileUpload';

    /** If you put `*` can upload any file.  Example: ['text/csv'].  This must have a value or it is an error. */
    mimeTypesAllowed: string[];
}

/**
 * Whether to show a label above the prompt input field and what value to show.  When you first come to the chat app,
 * all you see is a large prompt input field, allowing the user to start a new conversation. This feature allows you
 * to show a label above the prompt input field as you see in other chat apps.
 *
 * This feature is on by default.
 */
export interface PromptInputFieldLabelFeature extends Feature {
    featureId: 'promptInputFieldLabel';

    /** Whether to hide the label above the prompt input field.  Defaults to false. */
    hidePromptInputFieldLabel?: boolean;

    /** Defaults to "Ready to chat".  The label to show above the prompt input field. */
    promptInputFieldLabel?: string;
}

export type SegmentType = 'text' | 'tag';

/**
 * Represents the status of content being streamed into a segment.
 */
export type StreamingStatus =
    /**
     * Initial tag start detected (e.g., "<ta") but not enough characters to determine the full tag name.
     * Indicates partial progress in tag parsing and requires more content to identify the tag.
     */
    | 'incomplete'
    /**
     * Actively receiving streaming content into the associated segment.
     * More data is expected and the segment is not yet complete.
     */
    | 'streaming'
    /**
     * Streaming of content into this segment is finished and no more data will be added.
     */
    | 'completed'
    /**
     * An error occurred while streaming content into this segment. Content may be incomplete or corrupted.
     */
    | 'error';

export interface MessageSegmentBase {
    /** The position of the segment in the message */
    id: number;
    segmentType: SegmentType;
    rawContent: string;
    streamingStatus: StreamingStatus;
    rendererType?: string;
}

export interface TagMessageSegment extends MessageSegmentBase {
    segmentType: 'tag';
    tag: string;
    attributes?: Record<string, string>;
}

export interface TextMessageSegment extends MessageSegmentBase {
    segmentType: 'text';
}

export type MessageSegment = TagMessageSegment | TextMessageSegment;

export type SiteAdminRequest =
    | GetInitialDataRequest
    | RefreshChatAppRequest
    | CreateOrUpdateChatAppOverrideRequest
    | DeleteChatAppOverrideRequest
    | GetValuesForEntityAutoCompleteRequest;

export const SiteAdminCommand = ['getInitialData', 'refreshChatApp', 'createOrUpdateChatAppOverride', 'deleteChatAppOverride', 'getValuesForEntityAutoComplete'] as const;
export type SiteAdminCommand = (typeof SiteAdminCommand)[number];

export interface SiteAdminCommandRequestBase {
    command: SiteAdminCommand;
}

export interface GetValuesForEntityAutoCompleteRequest extends SiteAdminCommandRequestBase {
    command: 'getValuesForEntityAutoComplete';
    type: 'internal-user' | 'external-user';
    valueProvidedByUser: string;
    chatAppId: string;
}

export interface GetInitialDataRequest extends SiteAdminCommandRequestBase {
    command: 'getInitialData';
}

export interface RefreshChatAppRequest extends SiteAdminCommandRequestBase {
    command: 'refreshChatApp';
    chatAppId: string;
}

export interface CreateOrUpdateChatAppOverrideRequest extends SiteAdminCommandRequestBase {
    command: 'createOrUpdateChatAppOverride';
    chatAppId: string;
    override: ChatAppOverrideForCreateOrUpdate;
}

export interface DeleteChatAppOverrideRequest extends SiteAdminCommandRequestBase {
    command: 'deleteChatAppOverride';
    chatAppId: string;
}

export type SiteAdminResponse =
    | GetInitialDataResponse
    | RefreshChatAppResponse
    | CreateOrUpdateChatAppOverrideResponse
    | DeleteChatAppOverrideResponse
    | GetValuesForEntityAutoCompleteResponse;

export interface SiteAdminCommandResponseBase {
    success: boolean;
    error?: string;
}

export interface GetValuesForEntityAutoCompleteResponse extends SiteAdminCommandResponseBase {
    data: SimpleOption[] | undefined;
}

export interface GetInitialDataResponse extends SiteAdminCommandResponseBase {
    chatApps: ChatApp[];
    siteFeatures: SiteFeatures;
}

export interface RefreshChatAppResponse extends SiteAdminCommandResponseBase {
    chatApp: ChatApp;
}

export interface CreateOrUpdateChatAppOverrideResponse extends SiteAdminCommandResponseBase {
    chatAppOverride: ChatAppOverride;
}

export interface DeleteChatAppOverrideResponse extends SiteAdminCommandResponseBase {}

export type ContentAdminRequest = ViewContentForUserRequest | StopViewingContentForUserRequest | GetValuesForContentAdminAutoCompleteRequest;
export type ContentAdminResponse = ViewContentForUserResponse | StopViewingContentForUserResponse | GetValuesForContentAdminAutoCompleteResponse;

export const ContentAdminCommand = ['viewContentForUser', 'stopViewingContentForUser', 'getValuesForAutoComplete'] as const;
export type ContentAdminCommand = (typeof ContentAdminCommand)[number];

export interface ContentAdminCommandRequestBase {
    command: ContentAdminCommand;
    chatAppId: string;
}

export interface ViewContentForUserRequest extends ContentAdminCommandRequestBase {
    command: 'viewContentForUser';
    user: ChatUserLite;
    chatAppId: string;
}

export interface StopViewingContentForUserRequest extends ContentAdminCommandRequestBase {
    command: 'stopViewingContentForUser';
}

export interface GetValuesForContentAdminAutoCompleteRequest extends ContentAdminCommandRequestBase {
    command: 'getValuesForAutoComplete';
    valueProvidedByUser: string;
}

export interface ContentAdminCommandResponseBase {
    success: boolean;
    error?: string;
}

export interface GetValuesForContentAdminAutoCompleteResponse extends ContentAdminCommandResponseBase {
    data: ChatUserLite[] | undefined;
}

export interface ViewContentForUserResponse extends ContentAdminCommandResponseBase {
    data: ChatUserLite | undefined;
}

export interface StopViewingContentForUserResponse extends ContentAdminCommandResponseBase {}

export interface GetViewingContentForUserResponse extends ContentAdminCommandResponseBase {
    data: ChatUserLite[] | undefined;
}

export const UserOverrideDataCommand = ['getInitialDialogData', 'getValuesForAutoComplete', 'saveUserOverrideData', 'clearUserOverrideData'] as const;
export type UserOverrideDataCommand = (typeof UserOverrideDataCommand)[number];

export type UserOverrideDataCommandRequest = GetInitialDialogDataRequest | GetValuesForAutoCompleteRequest | SaveUserOverrideDataRequest | ClearUserOverrideDataRequest;
export type UserOverrideDataCommandResponse = GetInitialDialogDataResponse | GetValuesForAutoCompleteResponse | SaveUserOverrideDataResponse | ClearUserOverrideDataResponse;

export interface UserOverrideDataCommandRequestBase {
    command: UserOverrideDataCommand;
    chatAppId: string;
}

export interface GetInitialDialogDataRequest extends UserOverrideDataCommandRequestBase {
    command: 'getInitialDialogData';
}

export interface GetValuesForAutoCompleteRequest extends UserOverrideDataCommandRequestBase {
    command: 'getValuesForAutoComplete';
    componentName: string;
    valueProvidedByUser: string;
}

export interface SaveUserOverrideDataRequest extends UserOverrideDataCommandRequestBase {
    command: 'saveUserOverrideData';
    data: unknown | undefined;
}

export interface ClearUserOverrideDataRequest extends UserOverrideDataCommandRequestBase {
    command: 'clearUserOverrideData';
}

export interface UserOverrideDataCommandResponseBase {
    success: boolean;
    error?: string;
}

export interface GetInitialDialogDataResponse extends UserOverrideDataCommandResponseBase {
    data: unknown | undefined;
}

export interface GetValuesForAutoCompleteResponse extends UserOverrideDataCommandResponseBase {
    data: unknown[] | undefined;
}

export interface SaveUserOverrideDataResponse extends UserOverrideDataCommandResponseBase {
    data: RecordOrUndef;
}

export interface ClearUserOverrideDataResponse extends UserOverrideDataCommandResponseBase {}

/**
 * This is the type used to persist the user data override data to a cookie if provided.
 */
export interface UserOverrideData {
    /** The outer key is the chatAppId and the inner key is the user data override data. */
    data: Record<string, RecordOrUndef>;
}

export interface ContentAdminData {
    /** The outer key is the chatAppId and the inner key is the user data override data. */
    data: Record<string, ChatUserLite>;
}

/**
 * A base interface for features that can be turned on/off for certain users.
 */
export interface AccessRules {
    /** Whether the feature is turned on at all.  If false, then the feature is turned off for all users regardless of the userTypes and userRoles settings. */
    enabled: boolean;

    /**
     * The user types that are allowed to use the feature.  If neither this nor userRole are provided,
     * then the feature is turned on for all users.
     */
    userTypes?: UserType[];

    /**
     * The user roles that are allowed to use the feature.  If neither this nor userTypes are provided,
     * then the feature is turned on for all users.
     */
    userRoles?: PikaUserRole[];

    /**
     * The logic to apply the userTypes and userRoles settings.  If not provided, defaults to `and`
     * meaning that the user must be in the userTypes array and have the userRoles to use the feature.
     */
    applyRulesAs?: ApplyRulesAs;
}

/**
 * For rules that apply to multiple settings, this is the logic to apply the settings.
 */
export type ApplyRulesAs = 'and' | 'or';

/**
 * The classifications of the response from the LLM. Used with the Verify Response feature.
 */
export const Accurate = 'A';

/**
 * The response is accurate but contains stated assumptions
 */
export const AccurateWithStatedAssumptions = 'B';

/**
 * The response is accurate but contains unstated assumptions
 */
export const AccurateWithUnstatedAssumptions = 'C';

/**
 * The response is inaccurate or contains made up information
 */
export const Inaccurate = 'F';

/**
 * The response was not classified
 */
export const Unclassified = 'U';

/**
 * Do not change the order of these.  The order is used to determine the severity of the classification.
 */
export const VerifyResponseClassifications = [Accurate, AccurateWithStatedAssumptions, AccurateWithUnstatedAssumptions, Inaccurate, Unclassified] as const;

/**
 * The classification of the response from the LLM. Used with the Verify Response feature.
 */
export type VerifyResponseClassification = (typeof VerifyResponseClassifications)[number];

/**
 * Do not change the order of these.  The order is used to determine the severity of the classification.
 */
export const RetryableVerifyResponseClassifications = [AccurateWithStatedAssumptions, AccurateWithUnstatedAssumptions, Inaccurate] as const;

/**
 * The classifications that can be retried by the agent.
 */
export type RetryableVerifyResponseClassification = (typeof RetryableVerifyResponseClassifications)[number];

/**
 * The result of the authentication process.
 *
 * If both authenticatedUser and redirectTo are present, we set cookie to indiate logged in and redirect to the URL specified.
 * If only authenticatedUser is present, we are authenticated and can continue with the request whatever the URL currently is.
 * If neither are present, we are not authenticated and we willredirect to the login page.
 */
export interface AuthenticateResult<T extends RecordOrUndef = undefined, U extends RecordOrUndef = undefined> {
    /** If present, we are authenticated and can continue with the request. */
    authenticatedUser?: AuthenticatedUser<T, U>;
    /** If present, we need to redirect to the URL specified. */
    redirectTo?: Response;
}

export interface CustomDataUiRepresentation {
    /** The name you want to show in the UI to represent this custom data: e.g. "Account Name" */
    title: string;
    /** The value you want to show in the UI to represent this custom data: e.g. "Acme, Inc." */
    value: string;
}

/**
 * This is the type that is stored in the chat-app table with a chatAppId of `${chatAppId}:override`.
 */
export interface ChatAppOverrideDdb extends ChatAppOverride {
    chatAppId: string;
}

/**
 * If present, this overrides all access settings on chatApp: userTypes, userRoles, applyRulesAs.
 *
 * It also allows you to override whether the chat app is shown on the home page.
 *
 * Each ChatApp itself controls whether it is accessible to internal or external users.  That may be overridden
 * here (stored in dynamodb table).  If userType has a value, it is used over whatever was provided in the ChatApp itself.
 *
 * These are stored in the chat-app table with a chatAppId of `${chatAppId}:override`.
 *
 * The order of precedence for these rules is:
 *
 * 1. enabled: If present, overrides the chatApp.enabled setting. If not enabled, no one can access the chat app.
 * 2. exclusiveUserIdAccessControl: If provided, only allow these userIds to access the chat app, whether internal or external, doesn't matter.  All other access rules are ignored.
 * 3. exlusive user typeaccess control
 *     exclusiveInternalAccessControl: If provided, only allow these entities to access the chat app for internal users.
 *     exclusiveExternalAccessControl: If provided, only allow these entities to access the chat app for external users.
 * 4. userTypes/userRoles/applyRulesAs: If provided, only allow these user types to access the chat app (internal-user and/or external-user), otherwise falls back to chatApp.userTypes.
 *
 * If none of these are provided, then the chat app's access settings saved when the chat app
 * was deployed will be used to determine access: userTypes, userRoles, applyRulesAs.
 */
export interface ChatAppOverride extends AccessRules {
    /**
     * Each forked instance of pika can provide their own custom data on a User object using the AuthProvider
     * they implement.  Each user can thus have custom data associated with him.  It is common for example for
     * a user to have an accountId or companyId associated with him by the AuthProvider and stored in the custom data.
     *
     * Let's say you want to control which external accounts or companies (the users associated with the account or company) that can access a chat app.
     * You would populate this list then with whatever is needed to identify the entities that are allowed to access the chat app.
     *
     * If you have even a single entry in this list, then the chat app will only be accessible to external users associated with those entities.
     *
     * The AuthProvider has a method that we will call to do the comparison of data from the user object and this list of entities.
     */
    exclusiveExternalAccessControl?: string[];

    /**
     * Each forked instance of pika can provide their own custom data on a User object using the AuthProvider
     * they implement.  Each user can thus have custom data associated with him.  It is common for example for
     * a user to have an accountId or companyId associated with him by the AuthProvider and stored in the custom data.
     *
     * Let's say you want to control which external accounts or companies (the users associated with the account or company) that can access a chat app.
     * You would populate this list then with whatever is needed to identify the entities that are allowed to access the chat app.
     *
     * If you have even a single entry in this list, then the chat app will only be accessible to internal users associated with those entities.
     *
     * The AuthProvider has a method that we will call to do the comparison of data from the user object and this list of entities.
     */
    exclusiveInternalAccessControl?: string[];

    /**
     * If provided, only allow these userIds to access the chat app, whether internal or external, doesn't matter.
     */
    exclusiveUserIdAccessControl?: string[];

    /**
     * If provided, this will govern whether the chat app is shown on the home page.  This overrides the config in the siteFeatures.homePage.linksToChatApps.userChatAppRules.
     * If not provided, we will fall back to the config in the siteFeatures.homePage.linksToChatApps.userChatAppRules..
     */
    homePageFilterRules?: UserChatAppRule[];

    /** Overrides the title of the chat app (human readable) */
    title?: string;

    /** Overrides the description */
    description?: string;

    /** Any feature not explicitly defined and turned on is turned off by default. */
    features?: Partial<Record<FeatureIdType, ChatAppFeature>>;

    /** If true, this app isn't cached in various server-side layers. */
    dontCacheThis?: boolean;

    /** ISO 8601 formatted timestamp of when the session was created */
    createDate?: string;

    /** ISO 8601 formatted timestamp of the last session update */
    lastUpdate?: string;

    /** The user who created this override */
    createdByUserId?: string;

    /** The user who last updated this override */
    updatedByUserId?: string;
}

export type ChatAppOverrideForCreateOrUpdate = Omit<ChatAppOverride, 'createDate' | 'lastUpdate' | 'createdByUserId' | 'updatedByUserId'>;

export type UpdateableChatAppOverrideFields = Extract<
    keyof ChatAppOverride,
    | 'enabled'
    | 'userTypes'
    | 'userRoles'
    | 'applyRulesAs'
    | 'exclusiveExternalAccessControl'
    | 'exclusiveInternalAccessControl'
    | 'exclusiveUserIdAccessControl'
    | 'showOnHomePage'
    | 'title'
    | 'description'
    | 'features'
    | 'dontCacheThis'
>;

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

    /** Configure whether the site admin website feature is enabled. */
    siteAdmin?: SiteAdminFeature;
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

export interface SimpleOption {
    value: string;
    label?: string;
    secondaryLabel?: string;
}
