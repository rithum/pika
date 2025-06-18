//TODO: make sure to turn on model invocation logging in aws

import type { Trace } from './bedrock';
import type { FunctionDefinition } from '@aws-sdk/client-bedrock-agent-runtime';

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
export interface ChatSession {
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
    sessionAttributes: SessionAttributes;
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
 * Additional attributes specific to a chat session
 */
export interface SessionAttributes {
    /** Token for the session, comprised of hash of session id, company id, and user id */
    token: string;
    /** Unique identifier for the company associated with the session */
    companyId: string;
    /** Type of company participating in the session */
    companyType: CompanyType;
    /** First name of the user participating in the session */
    firstName: string;
    /** Last name of the user participating in the session */
    lastName: string;
    /** Timezone of the session in IANA format */
    timezone?: string;
}

/** This is used when creating a new chat session initially, the token will be generated. */
export type SessionAttributesWithoutToken = Omit<SessionAttributes, 'token'>;

/** This is used when creating a new chat session initially, the omitted fields are generated. */
export type ChatSessionForCreate = Omit<ChatSession, 'sessionId' | 'createDate' | 'lastUpdate' | 'sessionAttributes'> & {
    sessionAttributes: SessionAttributesWithoutToken;
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

/**
 * Represents a user in the chat system with their associated features and preferences.
 * This is saved in the chat user database.
 */
export interface ChatUser {
    /** Unique identifier for the user */
    userId: string;
    /** Email address of the user */
    email: string;
    /** First name of the user */
    firstName: string;
    /** Last name of the user */
    lastName: string;
    /** Unique identifier for the company associated with the user */
    companyId: string;
    /** Name of the company associated with the user */
    companyName: string;
    /** Type of company associated with the user */
    companyType: CompanyType;
    /** ISO 8601 formatted timestamp of when the user was created */
    createDate?: string;
    /** ISO 8601 formatted timestamp of when the user was last updated */
    lastUpdate?: string;
    /** Map of feature types to their corresponding feature configurations */
    features: {
        [K in FeatureType]: K extends 'instruction' ? InstructionFeature : K extends 'history' ? HistoryFeature : never;
    };
}

/**
 * This includes auth information that is not stored in the chat user database.
 * It is not provided to clients and is used server side.
 *
 * Auth data is data your app needs such as access tokens, refresh tokens, etc.
 */
export interface AuthenticatedUser<T> extends ChatUser {
    authData: T;
}

/**
 * This is a simplified version of AuthenticatedUser that is used for auth headers.
 * Note that type T may be the type "undefined" indicating that there is no auth data.
 */
export interface SimpleAuthenticatedUser<T> {
    userId: string;
    authData: T;
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

export interface ChatUserResponse {
    success: boolean;
    user: ChatUser | undefined;
    error?: string;
}

export interface ChatUserAddOrUpdateResponse {
    success: boolean;
    user: ChatUser;
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

export type ChatAppMode = 'fullpage' | 'embedded';

export interface ChatApp {
    /**
     * Unique ID for the chat. Only - and _ allowed.  Will
     * be used in URL to access the chatbot so keep that in mind
     */
    chatAppId: string;

    /**
     * Use fullpage for a full page chat app.  Use embedded for a chat app that is embedded in another web page,
     * appearing as a floating window on top.
     */
    mode: ChatAppMode;

    /**
     * Set to true when actively developing so changes are reflected immediately.
     * Various lambdas will cache this data for some minutes (usually 5).
     */
    dontCacheThis?: boolean;

    /**
     * The title of the chat app, a human readable name.  This is the title that will be displayed in the title bar of the chat app when
     * in fullpage mode.
     */
    title: string;

    /**
     * The ID of the agent that should be invoked for this chat app (e.g. 'weather-agent').
     * Must be the agentId of an agent that exists in the agent definition table.
     */
    agentId: string;

    /** Any feature not explicitly defined and turned on is turned off by default. */
    features?: Partial<Record<FeatureIdType, ChatAppFeature>>;

    /** Whether the chat app is enabled or not.  If false, then the chat app will not be accessible. */
    enabled: boolean;

    /** ISO 8601 formatted timestamp of when the session was created */
    createDate: string;

    /** ISO 8601 formatted timestamp of the last chat app update */
    lastUpdate: string;

    /** If true, this is a test chat app that will get deleted after 1 day.  This is used for testing. */
    test?: boolean;
}

export interface KnowledgeBase {
    /** A unique identifier for the knowledge base  */
    id: string;

    /** The agent frameworks that this knowledge base supports */
    supportedAgentFrameworks: AgentFramework[];

    /** A description of the knowledge base */
    description: string;
}

export type UpdateableChatAppFields = Extract<keyof ChatApp, 'mode' | 'dontCacheThis' | 'title' | 'agentId' | 'features' | 'enabled'>;

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

export type ChatAppFeature = FileUploadFeature | SuggestionsFeature | PromptInputFieldLabelFeature | UiCustomizationFeature;

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

export const FeatureIdList = ['fileUpload', 'promptInputFieldLabel', 'suggestions', 'uiCustomization'] as const;
export type FeatureIdType = (typeof FeatureIdList)[number];

/**
 * Whether a feature is enabled by default or not.
 */
export const DEFAULT_FEATURE_ENABLED_VALUE: Record<FeatureIdType, boolean> = {
    fileUpload: false,
    promptInputFieldLabel: true,
    suggestions: false,
    uiCustomization: false
};

export const FEATURE_NAMES: Record<FeatureIdType, string> = {
    fileUpload: 'File Upload',
    promptInputFieldLabel: 'Prompt Input Field Label',
    suggestions: 'Suggestions',
    uiCustomization: 'UI Customization'
};

/**
 * Whether to support UI customization in the chat app.  If true, then the chat app will support UI customization.
 */
export interface UiCustomizationFeature extends Feature {
    featureId: 'uiCustomization';

    /** Whether to show the chat history as left nav in full page mode.  Defaults to true. */
    showChatHistoryInFullPageMode?: boolean;

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
