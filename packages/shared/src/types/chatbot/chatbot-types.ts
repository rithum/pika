//TODO: make sure to turn on model invocation logging in aws

import type { AgentCollaboration, CollaboratorConfiguration, FunctionDefinition, RetrievalFilter, Trace } from '@aws-sdk/client-bedrock-agent-runtime';

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
    /**
     * Unique identifier for this chat session
     *
     * Note this is a time-based key so you can use it to lexicographically sort the sessions and to compare them
     * as in sessionId1 < sessionId2 if sessionId1 is before sessionId2.
     */
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

    /**
     * Last Message that has been analyzed by the system for insights, this lets us detect if the user came back to
     * the chat after the session is believed to be complete and added another message that we should analyze again.
     *
     * Note this is a time-based key so you can use it to lexicographically sort the messages and compare message IDs
     * as in messageId1 < messageId2 if messageId1 is before messageId2.
     *
     * If present and insightsS3Url is not present then this is a bug.
     *
     * If lastAnalyzedMessageId is not the same as lastMessageId then this means the user has added another message
     * to the session since we computed insights and we need to recompute them.
     */
    lastAnalyzedMessageId?: string;

    /**
     * If present, this is the url to the s3 object that contains the insights for the session.  If not present,
     * then the insights are not yet computed.  If this is present and lastAnalyzedMessageId is not present, then
     * this is a bug.
     *
     * The url to the s3 object in this form:
     *
     * s3://<bucket-name>/<session-id>/insights.json
     */
    insightsS3Url?: string;

    /**
     * Insights for the session computed after the session is believed to be complete.
     *
     * This is not persisted in dynamodb, it's only in S3 and then added to the chat session in opensearch.
     */
    insights?: SessionInsights;

    /**
     * Feedback for the session.
     *
     * This is persisted in a separate dynamodb table (chat-session-feedback)and then added to the chat session in opensearch.
     */
    feedback?: ChatSessionFeedback[];

    /**
     * Expiration date of the message in Unix seconds.  Internally used in dynamodb.  Don't expect that this will
     * be set as it never will be made available to apps.  That's why it's in snake case when nothing else is.
     */
    exp_date_unix_seconds?: number;

    /**
     * This is used to those sessions that we need to recompute the insights for.
     *
     * It will be set to NEEDS_INSIGHTS_ANALYSIS when we first create a session. Then we will have a lambda wake up
     * periodically and check if the session is ready to be analyzed (it's been some time since the last message was added).
     * We will then compute the insights and set lastAnalyzedMessageId and insightsS3Url.  We will not put the insights
     * on the session object as it is stored in dynamodb, too big.  It will go into opensearch on the session however.
     *
     * The actual computation will not be done until there is a messageId that is at last X old (message ID is really a
     * date UUID v7) where X is whatever we set (probably an hour or two).  This is to avoid recomputing the insights
     * for every message.
     *
     * Also, if we detect that the lastMessageId is not equal to lastAnalyzedMessageId then we will once again set
     * insight_status_partition_key to NEEDS_INSIGHTS_ANALYSIS so that we can recompute the insights after enough time
     * goes by since the new last message was added.
     *
     * We will unset this value once we have computed the insights and set lastAnalyzedMessageId and insightsS3Url.
     *
     * Note that the GSI that governs this will not include a session record unless NEEDS_INSIGHTS_ANALYSIS is set
     * (insightStatus is the partition key)and lastMessageId is set (the sort key).  There could be a short gap between
     * when the session is created and when the last message ID is added.  This should be fine.
     */
    insightStatus?: InsightStatusNeedsInsightsAnalysis | undefined;
}

/**
 * Convenience type for updating a session with the last analyzed message id and insights s3 url.
 *
 * Field update behavior:
 * - If a value is null: the field will be REMOVED from the database entirely (using DynamoDB REMOVE expression)
 * - If a value is undefined: the field will not be updated at all (field remains unchanged)
 * - If a value is present: the field will be SET to that value (using DynamoDB SET expression)
 *
 * Note: Setting insightStatus to null removes it from the sparse GSI since the field no longer exists.
 */
export interface ChatSessionLiteForUpdate {
    userId: string;
    sessionId: string;
    lastAnalyzedMessageId: string | undefined | null;
    insightStatus: InsightStatusNeedsInsightsAnalysis | undefined | null;
    insightsS3Url: string | undefined | null;
}

export interface ChatSessionFeedback {
    /** The session ID of the session that the feedback is about. */
    sessionId: string;
    /** This is a V7 UUID that is date sortable and comparable */
    feedbackId: string;
    /** The user ID of the user who flagged the session. */
    userId: string;
    /** The message ID of the session message that the feedback is about. */
    messageId?: string;
    /** Whether the flag was reported by a human or an AI. */
    reportedByHuman: boolean;
    /** Whether the feedback was created by the customer or the system. */
    createdByCustomer: boolean;
    /** The status of the feedback. */
    status: SessionFeedbackStatus;
    /** The severity of the feedback. */
    severity: SessionFeedbackSeverity;
    /** The type of the feedback. */
    type: SessionFeedbackType;
    /** A comment from the user who flagged the session. Limit to 1000 characters. */
    userComment?: string;
    /** Comments from the internal team. This is stored zipped in dynamodb.*/
    internalComments?: FeedbackInternalComment[];
    /** Attachments to the feedback. */
    attachments?: Attachment[];
    /** The date and time the feedback was created as a string in ISO 8601 format. */
    createdOn: string;
    /** The date and time the feedback was updated as a string in ISO 8601 format. */
    updatedOn: string;
    /** The date and time the feedback will expire as a unix timestamp in seconds. It's snake case because it's never going to be used by the app itself. */
    exp_date_unix_seconds?: number;
}

export interface Attachment {
    /**
     * The url to the s3 object in this form:
     *
     * s3://<bucket-name>/<session-id>/<attachment-id>.{extension}
     */
    s3Url: string;
    /** Name of the attachment. */
    name: string;
    /** MIME type of the attachment. */
    mimeType: string;
}

export const INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS = 'NEEDS_INSIGHTS_ANALYSIS';
export type InsightStatusNeedsInsightsAnalysis = typeof INSIGHT_STATUS_NEEDS_INSIGHTS_ANALYSIS;

export const SESSION_FEEDBACK_STATUS = ['open', 'in_review', 'resolved', 'closed'] as const;
export type SessionFeedbackStatus = (typeof SESSION_FEEDBACK_STATUS)[number];
export const SESSION_FEEDBACK_STATUS_VALUES: NameValuePair<SessionFeedbackStatus>[] = [
    { name: 'Open', value: 'open' },
    { name: 'In Review', value: 'in_review' },
    { name: 'Resolved', value: 'resolved' },
    { name: 'Closed', value: 'closed' }
];

export const SESSION_FEEDBACK_SEVERITY = ['low', 'medium', 'high', 'critical'] as const;
export type SessionFeedbackSeverity = (typeof SESSION_FEEDBACK_SEVERITY)[number];
export const SESSION_FEEDBACK_SEVERITY_VALUES: NameValuePair<SessionFeedbackSeverity>[] = [
    { name: 'Low', value: 'low' },
    { name: 'Medium', value: 'medium' },
    { name: 'High', value: 'high' },
    { name: 'Critical', value: 'critical' }
];

export const SESSION_FEEDBACK_TYPE = [
    'user_thumbs_up',
    'user_thumbs_down',
    'incorrect_information',
    'incomplete_information',
    'off_topic',
    'hallucination',
    'confusing_response',
    'outdated_information',
    'inappropriate_content',
    'privacy_concern',
    'harmful_content',
    'system_error',
    'timeout_occurred',
    'tool_failure',
    'poor_performance',
    'training_example',
    'context_awareness_issue',
    'goal_misalignment',
    'tool_capability_gap',
    'tool_performance_issue',
    'cost_issue',
    'high_complexity_session',
    'low_ai_confidence_level',
    'critical_issues_present',
    'user_dissatisfied',
    'user_question_to_chat_author',
    'other'
] as const;
export type SessionFeedbackType = (typeof SESSION_FEEDBACK_TYPE)[number];
export const SESSION_FEEDBACK_TYPE_VALUES: NameValueDescTriple<SessionFeedbackType>[] = [
    { name: 'Confusing Response', value: 'confusing_response', desc: 'Session was confusing' },
    { name: 'Context Awareness Issue', value: 'context_awareness_issue', desc: 'Session had context awareness issue' },
    { name: 'Cost Issue', value: 'cost_issue', desc: 'Session had cost issue' },
    { name: 'Critical Issues Present', value: 'critical_issues_present', desc: 'Session had critical issues present' },
    { name: 'Goal Misalignment', value: 'goal_misalignment', desc: 'Session had goal misalignment' },
    { name: 'Hallucination', value: 'hallucination', desc: 'Session contained hallucinations' },
    { name: 'Harmful Content', value: 'harmful_content', desc: 'Session contained harmful content' },
    { name: 'High Complexity Session', value: 'high_complexity_session', desc: 'Session was high complexity' },
    { name: 'Inappropriate Content', value: 'inappropriate_content', desc: 'Session contained inappropriate content' },
    { name: 'Incorrect Information', value: 'incorrect_information', desc: 'Session contained incorrect information' },
    { name: 'Incomplete Information', value: 'incomplete_information', desc: 'Session contained incomplete information' },
    { name: 'Low AI Confidence Level', value: 'low_ai_confidence_level', desc: 'Session had low AI confidence level' },
    { name: 'Off Topic', value: 'off_topic', desc: 'Session was off topic' },
    { name: 'Other', value: 'other', desc: 'Session had indeterminate issue' },
    { name: 'Outdated Information', value: 'outdated_information', desc: 'Session contained outdated information' },
    { name: 'Poor Performance', value: 'poor_performance', desc: 'Session experienced poor performance' },
    { name: 'Privacy Concern', value: 'privacy_concern', desc: 'Session contained privacy concern' },
    { name: 'System Error', value: 'system_error', desc: 'Session encountered system error' },
    { name: 'Timeout Occurred', value: 'timeout_occurred', desc: 'Session timed out' },
    { name: 'Tool Capability Gap', value: 'tool_capability_gap', desc: 'Session had tool capability gap' },
    { name: 'Tool Failure', value: 'tool_failure', desc: 'Session encountered tool failure' },
    { name: 'Tool Performance Issue', value: 'tool_performance_issue', desc: 'Session had tool performance issue' },
    { name: 'Training Example', value: 'training_example', desc: 'Session was training example' },
    { name: 'User Dissatisfied', value: 'user_dissatisfied', desc: 'User was dissatisfied with session.' },
    { name: 'User Question to Chat Author', value: 'user_question_to_chat_author', desc: 'User asked question not to AI but to chat app author' },
    { name: 'User Thumbs Down', value: 'user_thumbs_down', desc: 'User gave thumbs down to session' },
    { name: 'User Thumbs Up', value: 'user_thumbs_up', desc: 'User gave thumbs up to session' }
];

export type ChatSessionFeedbackForCreate = Omit<ChatSessionFeedback, 'createdOn' | 'updatedOn' | 'internalComments' | 'exp_date_unix_seconds'>;
export type ChatSessionFeedbackForUpdate = Omit<
    ChatSessionFeedback,
    'userId' | 'messageId' | 'reportedByHuman' | 'createdOn' | 'updatedOn' | 'exp_date_unix_seconds' | 'createdByCustomer'
>;

export const UPDATEABLE_FEEDBACK_FIELDS = ['status', 'severity', 'type', 'internalComments', 'userComment', 'attachments'] as const;
export type UpdateableFeedbackFields = (typeof UPDATEABLE_FEEDBACK_FIELDS)[number];

export interface FeedbackInternalComment {
    /** This is a V7 UUID that is date sortable and comparable */
    commentId: string;
    /** The user ID of the user who made the comment. */
    userId: string;
    /** The comment. */
    comment: string;
    /** The attachments to the comment. */
    attachments?: Attachment[];
    /** The date and time the comment was made as a string in ISO 8601 format. */
    createdOn: string;

    type: FeedbackInternalCommentType;

    status: FeedbackInternalCommentStatus;
}

export const FEEDBACK_INTERNAL_COMMENT_STATUS = ['open', 'closed'] as const;
export type FeedbackInternalCommentStatus = (typeof FEEDBACK_INTERNAL_COMMENT_STATUS)[number];
export const FEEDBACK_INTERNAL_COMMENT_STATUS_VALUES: NameValueDescTriple<FeedbackInternalCommentStatus>[] = [
    { name: 'Open', value: 'open', desc: 'The comment is open and is awaiting action.' },
    { name: 'Closed', value: 'closed', desc: 'The comment is closed and has been resolved.' }
];

export const FEEDBACK_INTERNAL_COMMENT_TYPE = [
    'comment',
    'customer_outreach_recommended',
    'customer_outreach_made',
    'technical_action_required',
    'technical_action_completed'
] as const;
export type FeedbackInternalCommentType = (typeof FEEDBACK_INTERNAL_COMMENT_TYPE)[number];
export const FEEDBACK_INTERNAL_COMMENT_TYPE_VALUES: NameValueDescTriple<FeedbackInternalCommentType>[] = [
    { name: 'Comment', value: 'comment', desc: 'A comment about the feedback.' },
    { name: 'Customer Outreach Recommended', value: 'customer_outreach_recommended', desc: 'A recommendation to reach out to the customer.' },
    { name: 'Customer Outreach Made', value: 'customer_outreach_made', desc: 'A record that an outreach was made to the customer.' },
    { name: 'Technical Action Required', value: 'technical_action_required', desc: 'A technical action is required to resolve the feedback.' },
    { name: 'Technical Action Completed', value: 'technical_action_completed', desc: 'A record that a technical action was completed to resolve the feedback.' }
];

export interface SessionInsights {
    model: string;
    /** The version of the insights algorithm that was used to compute the insights. */
    version: string;
    usage: SessionInsightUsage;
    scoring: SessionInsightScoring;
    detailMarkdown: string;
}

export interface SessionInsightUsage {
    inputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
    outputTokens: number;
}

export interface SessionInsightScoring {
    scores: {
        goalAchievement: {
            score: number;
            description: string;
        };
        userSatisfaction: {
            score: number;
            description: string;
        };
        aiPerformance: {
            accuracy: {
                score: number;
                description: string;
            };
            helpfulness: {
                score: number;
                description: string;
            };
            communication: {
                score: number;
                description: string;
            };
            efficiency: {
                score: number;
                description: string;
            };
            overall: {
                score: number;
                description: string;
            };
        };
        interactionQuality: {
            score: number;
            description: string;
        };
    };
    assessments: {
        userSentiment: SessionInsightUserSentiment;
        goalCompletionStatus: SessionInsightGoalCompletionStatus;
        satisfactionLevel: SessionInsightSatisfactionLevel;
        requiresFollowup: boolean;
        criticalIssuesPresent: boolean;
        escalationNeeded: boolean;
    };
    metrics: {
        sessionDurationEstimate: SessionInsightMetricsSessionDurationEstimate;
        complexityLevel: SessionInsightMetricsComplexityLevel;
        userEffortRequired: SessionInsightMetricsUserEffortRequired;
        aiConfidenceLevel: SessionInsightMetricsAiConfidenceLevel;
    };
}

export const SESSION_INSIGHT_USER_SENTIMENT = ['positive', 'neutral', 'negative'] as const;
export type SessionInsightUserSentiment = (typeof SESSION_INSIGHT_USER_SENTIMENT)[number];
export const SESSION_INSIGHT_USER_SENTIMENT_VALUES: NameValueDescTriple<SessionInsightUserSentiment>[] = [
    { name: 'Positive', value: 'positive', desc: 'The user is satisfied with the session.' },
    { name: 'Neutral', value: 'neutral', desc: 'The user is neutral about the session.' },
    { name: 'Negative', value: 'negative', desc: 'The user is dissatisfied with the session.' }
];

export const SESSION_INSIGHT_GOAL_COMPLETION_STATUS = ['completed', 'partially_completed', 'not_completed'] as const;
export type SessionInsightGoalCompletionStatus = (typeof SESSION_INSIGHT_GOAL_COMPLETION_STATUS)[number];
export const SESSION_INSIGHT_GOAL_COMPLETION_STATUS_VALUES: NameValueDescTriple<SessionInsightGoalCompletionStatus>[] = [
    { name: 'Completed', value: 'completed', desc: 'The agent achieved the goal.' },
    { name: 'Partially Completed', value: 'partially_completed', desc: 'The agent partially achieved the goal.' },
    { name: 'Not Completed', value: 'not_completed', desc: 'The agent did not achieve the goal.' }
];

export const SESSION_INSIGHT_SATISFACTION_LEVEL = ['satisfied', 'neutral', 'dissatisfied'] as const;
export type SessionInsightSatisfactionLevel = (typeof SESSION_INSIGHT_SATISFACTION_LEVEL)[number];
export const SESSION_INSIGHT_SATISFACTION_LEVEL_VALUES: NameValueDescTriple<SessionInsightSatisfactionLevel>[] = [
    { name: 'Satisfied', value: 'satisfied', desc: 'The user is satisfied with the overall session.' },
    { name: 'Neutral', value: 'neutral', desc: 'The user is neutral about the overall session.' },
    { name: 'Dissatisfied', value: 'dissatisfied', desc: 'The user is dissatisfied with the overall session.' }
];

export const SESSION_INSIGHT_METRICS_SESSION_DURATION_ESTIMATE = ['short', 'medium', 'long'] as const;
export type SessionInsightMetricsSessionDurationEstimate = (typeof SESSION_INSIGHT_METRICS_SESSION_DURATION_ESTIMATE)[number];
export const SESSION_INSIGHT_METRICS_SESSION_DURATION_ESTIMATE_VALUES: NameValueDescTriple<SessionInsightMetricsSessionDurationEstimate>[] = [
    { name: 'Short', value: 'short', desc: 'The session was short.' },
    { name: 'Medium', value: 'medium', desc: 'The session was medium.' },
    { name: 'Long', value: 'long', desc: 'The session was long.' }
];

export const SESSION_INSIGHT_METRICS_COMPLEXITY_LEVEL = ['low', 'medium', 'high'] as const;
export type SessionInsightMetricsComplexityLevel = (typeof SESSION_INSIGHT_METRICS_COMPLEXITY_LEVEL)[number];
export const SESSION_INSIGHT_METRICS_COMPLEXITY_LEVEL_VALUES: NameValueDescTriple<SessionInsightMetricsComplexityLevel>[] = [
    { name: 'Low', value: 'low', desc: 'The session was low complexity.' },
    { name: 'Medium', value: 'medium', desc: 'The session was medium complexity.' },
    { name: 'High', value: 'high', desc: 'The session was high complexity.' }
];

export const SESSION_INSIGHT_METRICS_USER_EFFORT_REQUIRED = ['low', 'medium', 'high'] as const;
export type SessionInsightMetricsUserEffortRequired = (typeof SESSION_INSIGHT_METRICS_USER_EFFORT_REQUIRED)[number];
export const SESSION_INSIGHT_METRICS_USER_EFFORT_REQUIRED_VALUES: NameValueDescTriple<SessionInsightMetricsUserEffortRequired>[] = [
    { name: 'Low', value: 'low', desc: 'The user required low effort to get the response they wanted.' },
    { name: 'Medium', value: 'medium', desc: 'The user required medium effort to get the response they wanted.' },
    { name: 'High', value: 'high', desc: 'The user required high effort to get the response they wanted.' }
];

export const SESSION_INSIGHT_METRICS_AI_CONFIDENCE_LEVEL = ['low', 'medium', 'high'] as const;
export type SessionInsightMetricsAiConfidenceLevel = (typeof SESSION_INSIGHT_METRICS_AI_CONFIDENCE_LEVEL)[number];
export const SESSION_INSIGHT_METRICS_AI_CONFIDENCE_LEVEL_VALUES: NameValueDescTriple<SessionInsightMetricsAiConfidenceLevel>[] = [
    { name: 'Low', value: 'low', desc: 'The AI was not confident in the response.' },
    { name: 'Medium', value: 'medium', desc: 'The AI was moderately confident in the response.' },
    { name: 'High', value: 'high', desc: 'The AI was highly confident in the response.' }
];

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
     * You can be certain the <s3-bucket-name> will always be this value from SSM `/stack/chatbot/${this.stage}/s3/pika_bucket_name` so you
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
    /** ISO 8601 timestamp of when ChatUser data was last refreshed from DynamoDB (the pikaframework sets this) */
    lastChatUserRefresh?: string;
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

    /** If no mime types, then the feature is diabled. */
    fileUpload: {
        mimeTypesAllowed: string[];
    };

    /** If no suggestions, then the feature is diabled. */
    suggestions: {
        suggestions: string[];
        randomize: boolean;
        randomizeAfter: number;
        maxToShow: number;
    };

    /** If no label, then the feature is diabled. */
    promptInputFieldLabel: {
        label: string | undefined;
    };

    uiCustomization: {
        showUserRegionInLeftNav: boolean;
        showChatHistoryInStandaloneMode: boolean;
    };

    tags?: TagsChatAppOverridableFeature;

    agentInstructionAssistance: AgentInstructionChatAppOverridableFeature;
}

export interface AgentInstructionChatAppOverridableFeature {
    enabled: boolean;
    includeOutputFormattingRequirements: boolean;
    includeInstructionsForTags: boolean;
    completeExampleInstructionEnabled: boolean;
    completeExampleInstructionLine?: string;
    jsonOnlyImperativeInstructionEnabled: boolean;
    jsonOnlyImperativeInstructionLine?: string;
}

export interface InstructionAssistanceConfig {
    outputFormattingRequirements: string;
    tagInstructions?: string;
    completeExampleInstructionLine: string;
    jsonOnlyImperativeInstructionLine: string;
}

export interface TagsChatAppOverridableFeature {
    tagsEnabled: TagDefinitionLite[];
}

export type ChatAppOverridableFeaturesForConverseFn = Omit<
    ChatAppOverridableFeatures,
    'chatDisclaimerNotice' | 'traces' | 'logout' | 'suggestions' | 'promptInputFieldLabel' | 'uiCustomization' | 'fileUpload'
>;

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

export interface ConverseRequestWithCommand {
    command: 'clearConverseLambdaCache';
    cacheType: ClearConverseLambdaCacheType;
    agentId?: string;
    userId: string;
}

export const ClearConverseLambdaCacheTypes = ['agent', 'tagDefinitions', 'instructionAssistanceConfig', 'all'] as const;
export type ClearConverseLambdaCacheType = (typeof ClearConverseLambdaCacheTypes)[number];

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

export interface AddChatSessionFeedbackRequest {
    /** Note you need to generate a feedbackId before calling this function as a V7 UUID. */
    feedback: ChatSessionFeedbackForCreate;
}

export interface AddChatSessionFeedbackAdminRequest {
    command: 'addChatSessionFeedback';
    /** Note you need to generate a feedbackId before calling this function as a V7 UUID. */
    feedback: ChatSessionFeedbackForCreate;
}

export interface UpdateChatSessionFeedbackAdminRequest {
    command: 'updateChatSessionFeedback';
    feedback: ChatSessionFeedbackForUpdate;
}

export interface SessionSearchAdminRequest {
    command: 'sessionSearch';
    search: SessionSearchRequest<RecordOrUndef>;
}

export interface GetAgentRequest {
    command: 'getAgent';
    agentId: string;
}

export interface GetAgentResponse {
    success: boolean;
    agent: AgentDefinition | undefined;
    error?: string;
}

export interface GetChatSessionFeedbackResponse {
    success: boolean;
    feedback: ChatSessionFeedback[];
    error?: string;
}

export interface AddChatSessionFeedbackResponse {
    success: boolean;
    feedback: ChatSessionFeedback;
    error?: string;
}

export interface UpdateChatSessionFeedbackRequest {
    feedback: ChatSessionFeedbackForUpdate;
}

export interface UpdateChatSessionFeedbackResponse {
    success: boolean;
    feedback: ChatSessionFeedback;
    error?: string;
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

export type UserPrefs = Record<string, unknown>;

export interface GetChatUserPrefsResponse {
    success: boolean;
    userId: string;
    prefs?: UserPrefs;
    error?: string;
}

export interface SetChatUserPrefsRequest {
    prefs: UserPrefs;

    /**
     * If true, we will first get the existing prefs for the user and then merge them with the new prefs.
     * If false, we will just set the new prefs and overwrite any existing prefs.
     * If you want to delete a pref when doing a partial update, then you should include the pref and set
     * its value expressly to null.  When not doing a partial updated, just omit the pref and it will be deleted.
     * To delete all prefs, send in an empty object when not doing a partial update.
     */
    partial?: boolean;
}

export interface SetChatUserPrefsResponse {
    success: boolean;
    userId: string;

    /** If successful, returns the new complete prefs object. */
    prefs?: UserPrefs;
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
    session: ChatSession<RecordOrUndef>;
    error?: string;
}

export interface ChatSessionsResponse {
    success: boolean;
    sessions: ChatSession<RecordOrUndef>[];
    error?: string;
}

/**
 * If you are already did a search and got back a scrollId, then on the next request all you need to do is provide the scrollId
 * and nothing else.  This will get you the next page of results.
 *
 * Otherwise...
 *
 * If you don't provide any search criteria, it just returns all sessions forever orderd by createDate descending unless
 * specified otherwise.
 *
 * If you provide customUserData, then we will filter results to just the sessions whose sessionAttributes includes
 * the attributes you specified in customUserData.  So if you provide customUserData.accountId = 'John', then we will filter
 * to just the sessions whose sessionAttributes.accountId = 'John'.
 *
 * We will and together all the search params you provide.  So if you provide userId and chatAppId, then we will filter
 * to just the sessions whose userId and chatAppId match the values you provided.
 *
 * The results will be paginated.  You may provide a page token to get the next page of results.
 *
 * TODO: the implementation should make sure that the backend query includes a matching sort: [{ startDate: 'desc' }, { sessionId: 'desc' }].
 */
export interface SessionSearchRequest<T extends RecordOrUndef = undefined> {
    /** Matches sessions whose userId matches the given value. */
    userId?: string;
    /** Matches sessions whose chatAppId matches the given value. */
    chatAppId?: string;
    /** Matches sessions whose sessionId matches the given value. */
    sessionId?: string;
    /**
     * This must either be an object or undefined.  If an object, then its type must be Record<string, string>.
     * We will then filter the sessions to only those whose sessionAttributes includes the attributes you specified in customUserData.
     * So if you provide customUserData.accountId = 'John', then we will filter to just the sessions whose sessionAttributes.accountId = 'John'.
     */
    customUserData?: T;

    /** Allows searching for sessions with a title that contains the given string. */
    titlePartial?: string;

    /**
     * Filter by date range.
     */
    dateFilter?: SessionSearchDateFilter;

    /** If true, then we will only return sessions that are flagged for human review and if false the converse. */
    flagged?: boolean;

    /** If provided, then we will only return sessions that have insights that match the given insights criteria. */
    insights?: InsightsSearchParams;

    /**
     * Used for deep pagination via search_after.
     * Provide the scrollId from the previous page response.
     * This contains the encoded query state including sort values.
     */
    scrollId?: string;

    /** If provided, we will only return sessions with feedback in one ofthe given status. */
    feedbackInStatus?: SessionFeedbackStatus[];

    /** If true, only return sessions with feedback reported by a human and if false, by a computer and undefined both */
    feedbackReportedByHuman?: boolean;

    /** If true, only return sessions with feedback created by the customer and if false, by the system and undefined both */
    feedbackCreatedByCustomer?: boolean;

    /** If provided, we will only return sessions with feedback with one of the given severities. */
    feedbackSeverity?: SessionFeedbackSeverity[];

    /** If provided, we will only return sessions with feedback with one of the given types. */
    feedbackType?: SessionFeedbackType[];

    /** If provided, we will only return sessions with feedback from the given user. */
    feedbackUserId?: string;

    /** If provided, we will only return sessions with feedback with one of the given internal comment types. */
    feedbackInternalCommentType?: FeedbackInternalCommentType[];

    /** If provided, we will only return sessions with feedback with one of the given internal comment statuses. */
    feedbackInternalCommentStatus?: FeedbackInternalCommentStatus[];

    /** If provided, we will only return sessions with feedback with one of the given internal comment user ids. */
    feedbackInternalCommentUserId?: string;

    /** If true, then we will include the insights in the response. */
    includeInsights?: boolean;

    /** If true, then we will include the feedback in the response. */
    includeFeedback?: boolean;

    /**
     * The fields to sort by. Determines the shape of pagination tokens.
     *
     * Defaults to [{ createDate: 'desc' }, { sessionId: 'desc' }].
     * Note that we tack on the sessionId to the end of the sort values
     * to make sure that we can get the next page of results correctly.
     * You don't need to provide the sessionId in the sortBy array, it will be added automatically
     * if it's not already there.
     */
    sortBy?: Array<{
        field: SessionSearchSortField;
        order: 'asc' | 'desc';
    }>;

    /**
     * Page size (defaulted by backend if not provided).
     */
    size?: number;
}

export const SESSION_SEARCH_SORT_FIELDS = ['createDate', 'lastUpdate', 'sessionId', 'inputTokens', 'outputTokens', 'totalCost', 'insightGoalAchievementScore'] as const;
export type SessionSearchSortField = (typeof SESSION_SEARCH_SORT_FIELDS)[number];
export const SESSION_SEARCH_SORT_FIELDS_VALUES: NameValuePair<SessionSearchSortField>[] = [
    { name: 'Create Date', value: 'createDate' },
    { name: 'Last Update', value: 'lastUpdate' },
    { name: 'Session ID', value: 'sessionId' },
    { name: 'Input Tokens', value: 'inputTokens' },
    { name: 'Output Tokens', value: 'outputTokens' },
    { name: 'Total Cost', value: 'totalCost' },
    { name: 'Insight Goal Achievement Score', value: 'insightGoalAchievementScore' }
];

export const SESSION_SEARCH_DATE_TYPES = ['created', 'updated', 'feedback'] as const;
export type SessionSearchDateType = (typeof SESSION_SEARCH_DATE_TYPES)[number];
export const SESSION_SEARCH_DATE_TYPES_VALUES: NameValuePair<SessionSearchDateType>[] = [
    { name: 'Create Date', value: 'created' },
    { name: 'Last Update', value: 'updated' },
    { name: 'Feedback Created', value: 'feedback' }
];

export interface SessionSearchDateFilter {
    dateType: SessionSearchDateType;
    startDate: string;
    endDate?: string;
}

export const SESSION_SEARCH_DATE_PRESETS = [
    '1-minute',
    '5-minutes',
    'last-hour',
    'last-day',
    'last-week',
    'last-month',
    'last-3months',
    'last-6-months',
    'last-year',
    'last-2-years'
] as const;
export type SessionSearchDatePreset = (typeof SESSION_SEARCH_DATE_PRESETS)[number];
export const SESSION_SEARCH_DATE_PRESETS_VALUES: NameValuePair<SessionSearchDatePreset>[] = [
    { name: '1 Minute', value: '1-minute' },
    { name: '5 Minutes', value: '5-minutes' },
    { name: 'Last Hour', value: 'last-hour' },
    { name: 'Last Day', value: 'last-day' },
    { name: 'Last Week', value: 'last-week' },
    { name: 'Last Month', value: 'last-month' },
    { name: 'Last 3 Months', value: 'last-3months' },
    { name: 'Last 6 Months', value: 'last-6-months' },
    { name: 'Last Year', value: 'last-year' },
    { name: 'Last 2 Years', value: 'last-2-years' }
];
export const SESSION_SEARCH_DATE_PRESETS_SHORT_VALUES: NameValuePair<SessionSearchDatePreset>[] = [
    { name: '1 Min', value: '1-minute' },
    { name: '5 Min', value: '5-minutes' },
    { name: 'Hour', value: 'last-hour' },
    { name: 'Day', value: 'last-day' },
    { name: 'Week', value: 'last-week' },
    { name: 'Month', value: 'last-month' },
    { name: '3 Mo', value: 'last-3months' },
    { name: '6 Mo', value: 'last-6-months' },
    { name: 'Year', value: 'last-year' },
    { name: '2 Yrs', value: 'last-2-years' }
];

/**
 * All of these are anded together.  You must at least provide hasInsights.
 */
export interface InsightsSearchParams {
    /** If true, then we will only return sessions that have insights and false returns sessions that don't have insights. */
    hasInsights: boolean;
    goalAchievementScore?: ScoreSearchParams;
    userSatisfactionScore?: ScoreSearchParams;
    aiPerformanceOverallScore?: ScoreSearchParams;
    aiPerformanceAccuracyScore?: ScoreSearchParams;
    aiPerformanceEfficiencyScore?: ScoreSearchParams;
    interactionQualityScore?: ScoreSearchParams;

    userSentiment?: SessionInsightUserSentiment[]; // Matches documents that have any of these values.
    goalCompletionStatus?: SessionInsightGoalCompletionStatus[]; // Matches documents that have any of these values.
    satisfactionLevel?: SessionInsightSatisfactionLevel[]; // Matches documents that have any of these values.
    sessionDurationEstimate?: SessionInsightMetricsSessionDurationEstimate[]; // Matches documents that have any of these values.
    complexityLevel?: SessionInsightMetricsComplexityLevel[]; // Matches documents that have any of these values.
    userEffortRequired?: SessionInsightMetricsUserEffortRequired[]; // Matches documents that have any of these values.
    aiConfidenceLevel?: SessionInsightMetricsAiConfidenceLevel[]; // Matches documents that have any of these values.
}

export interface ScoreSearchParams {
    score: number;
    operator: ScoreSearchOperator;
}

export const SCORE_SEARCH_OPERATORS = ['eq', 'gte', 'lte'] as const;
export type ScoreSearchOperator = (typeof SCORE_SEARCH_OPERATORS)[number];
export const SCORE_SEARCH_OPERATORS_VALUES: NameValuePair<ScoreSearchOperator>[] = [
    { name: '=', value: 'eq' },
    { name: '>=', value: 'gte' },
    { name: '<=', value: 'lte' }
];

export interface SessionSearchResponse<T extends RecordOrUndef = undefined> {
    success: boolean;
    sessions: ChatSession<T>[];
    error?: string;
    /**
     * If returned, then there are more pages of results.  On the next request, provide this scrollId and nothing else
     * and we will get you the next page of results.
     */
    scrollId?: string;

    /** For now, we will always return the total number of hits. */
    total: number;

    /** The page size that was used for this request. */
    pageSize: number;
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
    /** Foundation model to use for this agent. */
    foundationModel?: string;
    /** Foundation model to use for verifying the response of this agent. */
    verificationFoundationModel?: string;
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

    /** List of collaborator agent IDs that are used to orchestrate this agent. */
    collaborators?: {
        agentId: string;
        instruction: string;
        historyRelay: 'TO_COLLABORATOR' | 'TO_AGENT';
    }[];

    /** The collaboration type for this agent. */
    agentCollaboration?: AgentCollaboration;

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
    collaborators?: AgentDefinition[];
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
     * your must have enabled the entity feature in pika-config.ts and set the attributeName to the path to the custom data field
     * attribute name that contains the entity value.
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

    /**
     * This is the filter values that will be used to filter the knowledge base to restrict the set of
     * documents that are searched as part of the retrieve operation.
     *
     * When you have a file to ingest into the knowledge base in s3, you can include an accompanying metadata file
     * that defines metadata attributes and values applicable to the file.
     *
     * Note that each `value` in this filter may contain templated values like this:
     *
     * my-{name}-and-{company}
     *
     * If present, we will try to match the template attribute name to either a user top level attribute
     * name (one of userId, firstName, lastName) or an attribute within the user.customData object.  Note that the template value
     * may include dot notation to access a nested attribute.  For example, if the user has a customData object
     * with the following structure:
     *
     * {
     *  customData: {
     *      account: {
     *          id: '123'
     *      }
     *  }
     *
     * Then the template value 'my-{account.id}' would match the value 'my-123'.
     */
    filter?: RetrievalFilter;

    /**
     * The number of results to return from the knowledge base.  If not provided, the default is a smaller number,
     * probably 5.
     */
    numberOfResults?: number;
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

/**
 * These are the features that are available to be overridden by the chat app.
 */
export type ChatAppFeature =
    | FileUploadFeatureForChatApp
    | SuggestionsFeatureForChatApp
    | PromptInputFieldLabelFeatureForChatApp
    | UiCustomizationFeatureForChatApp
    | VerifyResponseFeatureForChatApp
    | TracesFeatureForChatApp
    | ChatDisclaimerNoticeFeatureForChatApp
    | LogoutFeatureForChatApp
    | SessionInsightsFeatureForChatApp
    | UserDataOverrideFeatureForChatApp
    | TagsFeatureForChatApp
    | AgentInstructionAssistanceFeatureForChatApp;

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

export const FeatureIdList = [
    'fileUpload',
    'promptInputFieldLabel',
    'suggestions',
    'uiCustomization',
    'verifyResponse',
    'traces',
    'chatDisclaimerNotice',
    'logout',
    'sessionInsights',
    'userDataOverrides',
    'tags',
    'agentInstructionAssistance'
] as const;
export type FeatureIdType = (typeof FeatureIdList)[number];

export const EndToEndFeatureIdList = ['verifyResponse', 'traces'] as const;
export type EndToEndFeatureIdType = (typeof EndToEndFeatureIdList)[number];

export const FEATURE_NAMES: Record<FeatureIdType, string> = {
    fileUpload: 'File Upload',
    promptInputFieldLabel: 'Prompt Input Field Label',
    suggestions: 'Suggestions',
    uiCustomization: 'UI Customization',
    verifyResponse: 'Verify Response',
    traces: 'Traces',
    chatDisclaimerNotice: 'Chat Disclaimer Notice',
    logout: 'Logout',
    sessionInsights: 'Session Insights',
    userDataOverrides: 'User Data Override',
    tags: 'Tags',
    agentInstructionAssistance: 'Agent Instruction Assistance'
};

export interface SiteAdminFeature {
    websiteEnabled: boolean;

    /** Ignored if websiteEnabled is false. */
    supportUserEntityAccessControl?: {
        /**
         * If you turn this on then we expect that you will provide
         */
        enabled: boolean;
    };

    /**
     * If turned on, any user with the pika:site-admin role will be able to view session insights
     * for any chat session in the admin website.  This is useful for debugging and troubleshooting.
     * This feature will not be enabled unless you have also first enabled the session insights feature
     * at the site level in pika-config.ts.  Note that the entity feature must be turned on
     * if you want to display and filter by entity in the session insights UI.
     */
    sessionInsights?: {
        enabled: boolean;
    };

    /**
     * Ignored if websiteEnabled is false.
     *
     * If turned on then you may restrict access to a chat app for only specified users.
     */
    supportSpecificUserAccessControl?: {
        enabled: boolean;
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
    enabled: boolean;

    /** The notice text to display to the user.  If not provided, no notice is displayed. */
    notice?: string;
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
export interface UiCustomizationFeature {
    enabled: boolean;

    /** Whether to show the chat history as left nav in full page mode.  Defaults to true. */
    showChatHistoryInStandaloneMode?: boolean;

    /** Whether to show the user region in the left nav in full page mode.  Defaults to true. */
    showUserRegionInLeftNav?: boolean;
}

export interface UiCustomizationFeatureForChatApp extends UiCustomizationFeature, Feature {
    featureId: 'uiCustomization';
}

/**
 * Whether to support suggestions in the chat app.  If true, then the chat app will support suggestions.
 * If false, then the chat app will not support suggestions.
 *
 * Default is false.
 */
export interface SuggestionsFeature {
    enabled: boolean;

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

export interface SuggestionsFeatureForChatApp extends SuggestionsFeature, Feature {
    featureId: 'suggestions';
}

/**
 * Whether the chat app supports uploading files and attaching them to the chat.
 */
export interface FileUploadFeature {
    enabled: boolean;

    /** If you put `*` can upload any file.  Example: ['text/csv'].  This must have a value or it is an error. */
    mimeTypesAllowed: string[];
}

export interface FileUploadFeatureForChatApp extends FileUploadFeature, Feature {
    featureId: 'fileUpload';
}

/**
 * Whether to show a label above the prompt input field and what value to show.  When you first come to the chat app,
 * all you see is a large prompt input field, allowing the user to start a new conversation. This feature allows you
 * to show a label above the prompt input field as you see in other chat apps.
 *
 * This feature is on by default.
 */
export interface PromptInputFieldLabelFeature {
    enabled: boolean;

    /** Defaults to "Ready to chat".  The label to show above the prompt input field. */
    promptInputFieldLabel?: string;
}

export interface PromptInputFieldLabelFeatureForChatApp extends PromptInputFieldLabelFeature, Feature {
    featureId: 'promptInputFieldLabel';
}

export interface AgentInstructionAssistanceFeatureForChatApp extends Feature, AgentInstructionAssistanceFeature {
    featureId: 'agentInstructionAssistance';
}

/**
 * The prompt instruction assistance feature is used to add a markdown section to the prompt that instructs the agent on how to format its response.
 *
 * The `includeInstructionsForTags` feature is used to inject the instructions for tags into the prompt at `{{tag-instructions}}` if found in the prompt.
 * If not found, then the instructions will be appended to the end of the prompt.  Note there is a separate feature named `tags` that is used
 * to define which tags are available for the agent. @see TagsFeatureForChatApp
 *
 * Thus the `tags` feature is how you decide which tags your chat app will allow.  Each tag is marked as to whether it can be generated by the LLM or a tool.
 * So, when you turn on the AgentInstructionsAssistance  feature in a chat app, pika knows which tags are available that we need to inject into the prompt.
 *
 * Note that when an agent is invoked in the context of a chat app, meaning through the pika chat app UI, the agent will be passed a
 * PromptInstructionAssistance object based on the features of the chat app in question.  The site wide features can define the config for this feature
 * and the chat app can override it.  So the pika front end will figure out which config is in play and pass the right value to the agent when it is
 * invoked.
 *
 * If the agent is invoked directly by your own custom client, you can pass in your own PromptInstructionAssistanceFeature object to specify the agent instructions
 * config.
 *
 * A common use case for this is to disable the includeInstructionsForTags.
 */
export interface AgentInstructionAssistanceFeature {
    /**
     * If enabled, a markdown section titled Output Formatting Requirements will be added into your prompt.  You can control where the prompt assistance language is added in
     * by using a replacement placeholder titled `{{prompt-assistance}}` in your prompt.  If found, the prompt assistance language will be added at the location of the placeholder.
     * The injected prompt assistance language will first add the output formatting requirements, then the instructions for tags,
     * then the complete example instruction line, and finally the json only imperative instruction line.
     *
     * If `{{prompt-assistance}}` is not found, then we look for more fine-grained control by looking for these specific placeholder tags:
     * `{{output-formatting-requirements}}`, `{{tag-instructions}}`, `{{complete-example-instruction-line}}` and `{{json-only-imperative-instruction-line}}`.  Of course,
     * if you haven't turned on the `includeInstructionsForTags` feature, then we will not inject the tag instructions.
     *
     * If neither `{{prompt-assistance}}` nor any of the specific placeholder tags are found, then the prompt assistance language will be appended to the end of the prompt
     * in this order: output formatting requirements, tag instructions, complete example instruction line, and json only imperative instruction line.  If `{{prompt-assistance}}`
     * is not found and you did not specify all of the specific placeholder tags but you did turn on a feature that means we should inject instructions then we
     * will add the corresponding instructions to the end of the prompt.
     *
     * Here is what will be added to the prompt at a minimum:
     *
     * ```markdown
     * // If includeOutputFormattingRequirements.enabled is true
     * {{output-formatting-requirements}}
     *
     * // If includeInstructionsForTags.enabled is true
     * {{tag-instructions}}
     *
     * // If completeExampleInstructionLine.enabled is true
     * {{complete-example-instruction-line}}
     *
     * // If jsonOnlyImperativeInstructionLine.enabled is true
     * {{json-only-imperative-instruction-line}}
     *
     * ```
     */
    enabled: boolean;

    /**
     * If enabled, basic output formatting requirements will be injected into the prompt at
     * `{{output-formatting-requirements}}` if found in the prompt. If not found, then the requirements will be appended to the end of the prompt.
     * This provides foundational formatting guidance for the agent's responses.
     */
    includeOutputFormattingRequirements?: {
        enabled: boolean;
    };

    /**
     * If enabled, then the instructions for tags that are available for the agent will be injected into the prompt at
     * `{{tag-instructions}}` if found in the prompt.  If not found, then the instructions will be appended to the end of the prompt.
     */
    includeInstructionsForTags?: {
        enabled: boolean;
    };

    /**
     * If true, a line will be added to the prompt assistance language that instructs the agent to include a complete example of the tag structure.
     * If mdLine is provided, it will be used as the line.  If mdLine is not provided, a default line will be used:
     *
     * ```markdown
     * `<answer>##Example markdown\nNormal text and an <image>http://some.url</image> and some **bold text**\n<chart>(...)</chart></answer>`
     * ```
     *
     * This will intelligenlty not include the <image> and <chart> tags in the exmaple if they are not supported in your instructions.
     */
    completeExampleInstructionLine?: {
        enabled: boolean;
        mdLine?: string;
    };

    /**
     * If true, a line will be added to the prompt assistance language that instructs the agent to only respond with valid JSON.
     * If mdLine is provided, it will be used as the line.  If mdLine is not provided, a default line will be used:
     *
     * ```markdown
     * BE ABSOLUTELY CERTAIN ANY JSON INCLUDED IS 100% VALID (especially for charts). Invalid JSON will break the user experience.
     * ```
     */
    jsonOnlyImperativeInstructionLine?: {
        enabled: boolean;
        line?: string;
    };
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
    | GetAgentRequest
    | GetInitialDataRequest
    | RefreshChatAppRequest
    | CreateOrUpdateChatAppOverrideRequest
    | DeleteChatAppOverrideRequest
    | GetValuesForEntityAutoCompleteRequest
    | GetValuesForUserAutoCompleteRequest
    | ClearConverseLambdaCacheRequest
    | ClearSvelteKitCachesRequest
    | AddChatSessionFeedbackAdminRequest
    | UpdateChatSessionFeedbackAdminRequest
    | SessionSearchAdminRequest
    | GetChatMessagesAsAdminRequest
    | CreateOrUpdateTagDefinitionAdminRequest
    | DeleteTagDefinitionAdminRequest
    | SearchTagDefinitionsAdminRequest
    | GetInstructionAssistanceConfigFromSsmRequest;

export const SiteAdminCommand = [
    'getAgent',
    'getInitialData',
    'refreshChatApp',
    'createOrUpdateChatAppOverride',
    'deleteChatAppOverride',
    'getValuesForEntityAutoComplete',
    'getValuesForUserAutoComplete',
    'clearConverseLambdaCache',
    'clearSvelteKitCaches',
    'addChatSessionFeedback',
    'updateChatSessionFeedback',
    'sessionSearch',
    'getChatMessagesAsAdmin',
    'createOrUpdateTagDefinition',
    'deleteTagDefinition',
    'searchTagDefinitions',
    'getInstructionAssistanceConfigFromSsm'
] as const;
export type SiteAdminCommand = (typeof SiteAdminCommand)[number];

export interface SiteAdminCommandRequestBase {
    command: SiteAdminCommand;
}

export interface GetChatMessagesAsAdminRequest extends SiteAdminCommandRequestBase {
    command: 'getChatMessagesAsAdmin';
    sessionId: string;
    chatAppId: string;
    userId: string;
}

export interface CreateOrUpdateTagDefinitionAdminRequest extends SiteAdminCommandRequestBase {
    command: 'createOrUpdateTagDefinition';
    request: TagDefinitionCreateOrUpdateRequest;
}

export interface DeleteTagDefinitionAdminRequest extends SiteAdminCommandRequestBase {
    command: 'deleteTagDefinition';
    request: TagDefinitionDeleteRequest;
}

export interface SearchTagDefinitionsAdminRequest extends SiteAdminCommandRequestBase {
    command: 'searchTagDefinitions';
    request: TagDefinitionSearchRequest;
}

export interface GetValuesForEntityAutoCompleteRequest extends SiteAdminCommandRequestBase {
    command: 'getValuesForEntityAutoComplete';
    valueProvidedByUser: string;
    chatAppId?: string;
    type?: 'internal-user' | 'external-user';
}

export interface GetValuesForUserAutoCompleteRequest extends SiteAdminCommandRequestBase {
    command: 'getValuesForUserAutoComplete';
    valueProvidedByUser: string;
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

export interface ClearConverseLambdaCacheRequest extends SiteAdminCommandRequestBase {
    command: 'clearConverseLambdaCache';
    cacheType: ClearConverseLambdaCacheType;
    chatAppId?: string;
    agentId?: string;
}

export interface ClearSvelteKitCachesRequest extends SiteAdminCommandRequestBase {
    command: 'clearSvelteKitCaches';
    cacheType: ClearSvelteKitCacheType;
    chatAppId?: string; // Only used for chatAppCache when clearing specific chat app
}

export const ClearSvelteKitCacheTypes = ['chatAppCache', 'tagDefinitionsCache', 'instructionAssistanceConfigCache', 'encryptionKeysCache', 'all'] as const;
export type ClearSvelteKitCacheType = (typeof ClearSvelteKitCacheTypes)[number];

export interface GetInstructionAssistanceConfigFromSsmRequest extends SiteAdminCommandRequestBase {
    command: 'getInstructionAssistanceConfigFromSsm';
}

export interface GetInstructionAssistanceConfigFromSsmResponse extends SiteAdminCommandResponseBase {
    config: InstructionAssistanceConfig;
}

export type SiteAdminResponse =
    | GetAgentResponse
    | GetInitialDataResponse
    | RefreshChatAppResponse
    | CreateOrUpdateChatAppOverrideResponse
    | DeleteChatAppOverrideResponse
    | GetValuesForEntityAutoCompleteResponse
    | GetValuesForUserAutoCompleteResponse
    | ClearConverseLambdaCacheResponse
    | ClearSvelteKitCachesResponse
    | AddChatSessionFeedbackResponse
    | UpdateChatSessionFeedbackResponse
    | SessionSearchResponse
    | GetChatMessagesAsAdminResponse
    | GetInstructionAssistanceConfigFromSsmResponse;

export interface SiteAdminCommandResponseBase {
    success: boolean;
    error?: string;
}

export interface GetChatMessagesAsAdminResponse extends SiteAdminCommandResponseBase {
    messages: ChatMessage[];
}

export interface ClearConverseLambdaCacheResponse extends SiteAdminCommandResponseBase {}

export interface ClearSvelteKitCachesResponse extends SiteAdminCommandResponseBase {
    clearedCount?: number;
    cacheType: string;
}

export interface GetValuesForEntityAutoCompleteResponse extends SiteAdminCommandResponseBase {
    data: SimpleOption[] | undefined;
}

export interface GetValuesForUserAutoCompleteResponse extends SiteAdminCommandResponseBase {
    data: ChatUserLite[] | undefined;
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
     * The user types that are allowed to use the feature.  If neither this nor userRoles are provided,
     * then no access is granted (secure by default).
     */
    userTypes?: UserType[];

    /**
     * The user roles that are allowed to use the feature.  If neither this nor userTypes are provided,
     * then no access is granted (secure by default).
     */
    userRoles?: UserRole[];

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

export interface VerifyResponseClassificationDescription {
    classification: VerifyResponseClassification;
    label: string;
    description: string;
}

export type VerifyResponseRetryableClassificationDescription = VerifyResponseClassificationDescription & {
    classification: RetryableVerifyResponseClassification;
};

export const VerifyResponseClassificationDescriptions: Record<VerifyResponseClassification, VerifyResponseClassificationDescription> = {
    [Accurate]: { classification: Accurate as VerifyResponseClassification, label: 'Accurate', description: 'The response is completely accurate.' },
    [AccurateWithStatedAssumptions]: {
        classification: AccurateWithStatedAssumptions,
        label: 'Accurate with stated assumptions',
        description: 'The response is accurate but contains clearly stated assumptions'
    },
    [AccurateWithUnstatedAssumptions]: {
        classification: AccurateWithUnstatedAssumptions,
        label: 'Accurate with unstated assumptions',
        description: 'The response is accurate but contains assumptions that are not explicitly stated'
    },
    [Inaccurate]: { classification: Inaccurate, label: 'Inaccurate', description: 'The response is inaccurate or contains made up information' },
    [Unclassified]: { classification: Unclassified, label: 'Unclassified', description: 'The response was not given a classification' }
};

export const VerifyResponseRetryableClassificationDescriptions: Record<RetryableVerifyResponseClassification, VerifyResponseRetryableClassificationDescription> = {
    [AccurateWithStatedAssumptions]: {
        classification: AccurateWithStatedAssumptions,
        label: 'Accurate with stated assumptions',
        description: 'The response is accurate but contains clearly stated assumptions'
    },
    [AccurateWithUnstatedAssumptions]: {
        classification: AccurateWithUnstatedAssumptions,
        label: 'Accurate with unstated assumptions',
        description: 'The response is accurate but contains assumptions that are not explicitly stated'
    },
    [Inaccurate]: { classification: Inaccurate, label: 'Inaccurate', description: 'The response is inaccurate or contains made up information' }
};

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

    /**
     * If this is provided then you intend to use the entity feature which means that you will be associating an
     * entity (such as an account or a company or organization) with a user and saving that information in the
     * chatUser.customData object.  This tells us that you intend to do that and that gives us attributes
     * we can use to display and filter by the entity.
     */
    entity?: EntitySiteFeature;

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

    /** Configure whether the file upload feature is enabled. */
    fileUpload?: FileUploadFeature;

    /** Configure whether the suggestions feature is enabled. */
    suggestions?: SuggestionsFeature;

    /** Configure whether the prompt input field label feature is enabled. */
    promptInputFieldLabel?: PromptInputFieldLabelFeature;

    /** Configure whether the UI customization feature is enabled. */
    uiCustomization?: UiCustomizationFeature;

    /** Configure whether the session insights feature is enabled. */
    sessionInsights?: SessionInsightsFeature;

    /** Configure which tag definitions are enabled by default at the site level. */
    tags?: TagsSiteFeature;

    /** Configure whether the agent instruction assistance feature is enabled. */
    agentInstructionAssistance?: AgentInstructionAssistanceFeature;
}

export interface TagsSiteFeature {
    /**
     * Whether to enable the tags feature. If this is turned off you will lost a lot of the functionality of the chat app.
     */
    enabled: boolean;

    /**
     * The tag definitions that are enabled by default.  If not provided, then no tag definitions are enabled.
     * Each chat app can override this list by providing its own list of tagsEnabled in its chat app config.
     */
    tagsEnabled?: TagDefinitionLite[];

    /**
     * The tag definitions that are prohibited by default.  If not provided, then no tag definitions are prohibited.
     * Chat apps may not override this list.
     */
    tagsProhibited?: TagDefinitionLite[];
}

/**
 * Configure whether the session insights feature is enabled.  When turned on, Pika will
 * automatically collect session insights for each chat session.  If you want to view these
 * insights, then you need to turn it on in the site admin website.
 */
export interface SessionInsightsFeature {
    enabled: boolean;

    /**
     * The string is the stage that the session config applies to.  If you provide a stage named
     * `default` then any stage not found in your map will use the default config.
     *
     *
     * If you don't provide this, here are the default settings.
     */
    openSearchConfig?: Record<string, SessionInsightsOpenSearchConfig>;
}

export interface SessionInsightsOpenSearchConfig {
    dedicatedMasterEnabled: boolean;

    /** Ignored if dedicatedMasterEnabled is false. Defaults to 1 if not provided. Recommend >= 3 in production for quorum */
    dedicatedMasterCount?: number;

    /** Ignored if dedicatedMasterEnabled is false. Defaults to m5.large.search if not provided. */
    masterNodeInstanceType?: string;

    /** Defaults to m5.large.search if not provided. */
    dataNodeInstanceType?: string;

    /** The number of data nodes to use. Defaults to 1 if not provided. */
    dataNodeCount?: number;

    /** Defaults to false if not provided. */
    zoneAwarenessEnabled: boolean;

    /** Ignored if zoneAwarenessEnabled is false. Defaults to 1 if not provided. */
    availabilityZoneCount?: number;

    /** Unit is gigs.  Defaults to 10 gig if not provided. */
    volumeSize?: number;

    /** Defaults to gp3 if not provided. */
    volumeType?: string;
}

export interface TagsFeatureForChatApp extends Feature {
    featureId: 'tags';

    /**
     * The tag definitions that are enabled by default.  If not provided, then no tag definitions are enabled.
     * Each chat app can override this list by providing its own list of tagsEnabled in its chat app config.
     */
    tagsEnabled?: TagDefinitionLite[];
}

export interface SessionInsightsFeatureForChatApp extends Feature {
    featureId: 'sessionInsights';
}

/**
 * The user data override feature may be enabled at the site level.  If enabled, then individual chat apps
 * may choose to disable the feature.  Why would they do this?  Perhaps they don't need the data
 * that may be overridden and don't want to prompt users to provide the data which may add friction
 * and confusion.
 */
export interface UserDataOverrideFeatureForChatApp extends Feature {
    featureId: 'userDataOverrides';
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
 * If this is provided then you intend to use the entity feature which means that you will be associating an
 * entity (such as an account or a company or organization) with a user and saving that information in the
 * chatUser.customData object.  This tells us that you intend to do that and that gives us attributes
 * we can use to display and filter by the entity.
 *
 * This won't affect anything an external customer sees or interacts with since presumably an external customer
 * is a specific account or company and so this feature is only intended for internal users and admins
 * to be able to act on behalf of a specific account or company and in the admin UI to filter by entity.
 */
export interface EntitySiteFeature {
    enabled: boolean;

    /**
     * The attribute name in the chatUser.customData object that contains the entity value: e.g. "accountId".
     * So, you might have a user object that looks like this returned by your AuthProvider:
     * ```ts
     * {
     *     customData: {
     *         accountId: '123'
     *     }
     * }
     * ```
     * If not provided this feature will not work. */
    attributeName: string;

    /** The placeholder text for the search input. */
    searchPlaceholderText: string;

    /** The singular name of the entity. */
    displayNameSingular: string;

    /** The plural name of the entity. */
    displayNamePlural: string;

    /** The title of the column header in the entity table as in Account ID.  */
    tableColumnHeaderTitle: string;
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

export interface FeatureError {
    desc: string;

    /** THis is set to true when the parent features component already checks for and handles this kind of error. */
    parentShouldIgnore?: boolean;
}

export interface NameValuePair<T> {
    name: string;
    value: T;
}

export interface NameValueDescTriple<T> {
    name: string;
    value: T;
    desc?: string;
}

/**
 * A component that renders a tag is expected to have a tag definition that defines the tag and the instructions for how to render it.
 *
 */
export interface ComponentTagDefinition<T extends TagDefinitionWidget> {
    definition: TagDefinition<T>;
}

export interface TagDefinition<T extends TagDefinitionWidget> {
    /**
     * The tag type this definition is for.  If the tag is one of the built-in pika tags, then you are overriding the built-in pika tag instructions
     * that will be included in the prompt assistance language.
     *
     * If the tag is a custom tag, then you are adding a new custom tag to the agent prompt definition.
     *
     * Do not include your scope on the tag name, we will add it for you.
     */
    tag: string;

    /**
     * We didn't start with the expectation that tags would have a scope that prefixes the tag name.  We are now requiring it.  However,
     * a few of our initial tags were not scoped and so we are allowing you to provide a legacy alias for the tag.  This is not recommended
     * and you should use the scope instead.
     *
     * Here is the complete set of legacy tag aliases: download, chart, prompt, image.  If you try to set this to anything but one of these, we will
     * error out and not take your tag definition.
     *
     * We will remove this in the near future.  You've been warned.
     */
    legacyTagName?: string;

    /**
     * The scope of the tag.  This is used to group tags together and prevent collisions with other tags.
     *
     * Inside the system, your tag will be known as `<scope>.<tag>`.  For example, the chart tag will be known as `<pika.chart></pika.chart>`.
     *
     * As a result, scope must not include punctuation of any kind to be valid xml and keep things simple.  All lower case is recommended but it's up to you.
     * Your aim is to ensure uniqueness of the tag name across all tags in the system and to keep it short and simple to use as few characters as possible within reason.
     *
     * This will be `pika` for built in tags the platform natively supports.  If you are adding a custom tag, you should use a
     * scope that is unique to your application, chat app or agent.
     */
    scope: string;

    /**
     * This should be a pluralized noun that represents the tag and be capitalized.
     *
     * For example, the chart tag title is "Charts".  The prompt tag title is "Follow-up Prompts".  The image tag title is "Images".
     *
     * Do not use markdown in this title.
     */
    tagTitle: string;

    /**
     * This should be a short example of the tag structure.  It may be used in the prompt assistance language injected into your prompt in a quick list of tags available for the LLM to generate.
     *
     * For example, the chart tag structure example is `<pika.chart></pika.chart>`.  The prompt tag structure example is `<pika.prompt></pika.prompt>`.  The image tag structure example is `<pika.image></pika.image>`.
     *
     * Be sure that you use `${scope}.` in front of the tag name.
     *
     * Do not use markdown in this example and don't surround with backticks, just the tag structure itself.  Don't include a body to the tag, even if it has one.
     */
    shortTagEx: string;

    /**
     * If true, the tag can be generated by the LLM.
     */
    canBeGeneratedByLlm: boolean;

    /**
     * If true, the tag will be generated by a tool of an agent.
     */
    canBeGeneratedByTool: boolean;

    /**
     * A description of the tag.  This will be used to describe the tag in admin-facing UI. Don't use markdown in this description.
     */
    description: string;

    /** Cache configuration for testing and debugging, used in lambdas/ecs containers that create LRU caches for tag definitions */
    dontCacheThis?: boolean;

    /** You must be explicit about whether this tag is a widget or not and if so what kind. */
    widget: T;

    /** If true, the tag will be disabled and not available to the LLM or tools. */
    disabled?: boolean;

    /**
     * If `canBeGeneratedByLlm` is true, you must provide instructions for the LLM to generate the tag since chat app/agent builders can choose
     * to have the instructions injected into the agent instructions prompt for a given tag.
     *
     * When we inject your instructions into the agent instructions prompt, we will do the following:
     *
     * 1. We will use the `tagTitle` as the bullet title for your tag instructions: `- **tagTitle:**`
     * 2. We will wrap your markdown instructions in XML tags to prevent formatting conflicts with the rest of the injected instructions
     *
     * Here's a complete example of what we will generate for you:
     *
     * ```markdown
     * - **Charts:**
     * <tag-instructions type="chart">
     * To include a pika chart, use the `<pika.chart></pika.chart>` tags.
     * The content within the tags MUST be valid Chart.js version 4 JSON, including `type` and `data` properties.
     *
     * **Example:** `<pika.chart>{"type":"line","data":{"labels":["May","June","July","August"],"datasets":[{"label":"Avg Temperature (°C)","data":[2,3,7,12]}]}}</pika.chart>`
     *
     * **Usage:** Include pika charts whenever they can visually represent data, trends, or comparisons effectively.
     * </tag-instructions>
     * ```
     *
     * The markdown you provide should be well-formatted and can use any standard markdown features (lists, bold, code blocks, etc.).
     * The XML wrapper ensures that your formatting doesn't interfere with the overall instruction structure.
     */
    llmInstructionsMd?: string;

    /** The user id of the user who created the tag definition */
    createdBy: string;

    /** The user id of the user who last updated the tag definition */
    lastUpdatedBy: string;

    /** ISO 8601 formatted timestamp of when the session was created */
    createDate: string;

    /** ISO 8601 formatted timestamp of the last session update */
    lastUpdate: string;
}

export interface TagDefinitionLite {
    tag: string;
    scope: string;
}

export type TagDefinitionForCreateOrUpdate<T extends TagDefinitionWidget = TagDefinitionWidget> = Omit<
    TagDefinition<T>,
    'createdBy' | 'lastUpdatedBy' | 'createDate' | 'lastUpdate'
>;

/**
 * Pika compiled-in components are those defined as part of the compiled svelte front end code in `apps/pika-chat/src/lib/client/features/chat/message-segments/default-components/index.ts`.
 *
 * Custom compiled-in components are those defined by the user in their app as a svelte component.  They are defined in `apps/pika-chat/src/lib/client/features/chat/message-segments/custom-components/index.ts`.
 *
 * Web components are those that are defined as standalone js files that are uploaded to s3 and then dynamically loaded into the front end.
 * If web-component then the `webComponent` property must be provided.
 *
 * Pass through means we will simply pass this through and not process the tag in any way.  This is useful for tags that are not meant to be rendered in the front end.
 */
export type TagDefinitionWidgetType = 'pass-through' | 'pika-compiled-in' | 'custom-compiled-in' | 'web-component';

export interface TagDefinitionWidgetPikaCompiledIn extends TagDefinitionWidgetBase {
    type: 'pika-compiled-in';
}

export interface TagDefinitionWidgetCustomCompiledIn extends TagDefinitionWidgetBase {
    type: 'custom-compiled-in';
}

export interface TagDefinitionWidgetWebComponent extends TagDefinitionWidgetBase {
    type: 'web-component';
    webComponent: TagDefinitionWebComponent;
}

export interface TagDefinitionWidgetPassThrough extends TagDefinitionWidgetBase {
    type: 'pass-through';
}

export interface TagDefinitionWidgetBase {
    /**
     * The type of widget that will be used to render this tag.
     */
    type: TagDefinitionWidgetType;
}

export type TagDefinitionWidget = TagDefinitionWidgetPassThrough | TagDefinitionWidgetPikaCompiledIn | TagDefinitionWidgetCustomCompiledIn | TagDefinitionWidgetWebComponent;

export type TagWebComponentEncoding = 'gzip+base64';

export interface TagDefinitionWebComponent {
    type: 'web-component';
    s3Bucket: string;
    s3Key: string;

    encoding: TagWebComponentEncoding;
    mediaType: 'application/javascript';
    encodedSizeBytes: number; // size of the stored object (post-encoding)

    /** Hash of EXACT S3 object bytes (post-encoding) */
    encodedSha256Base64: string;
}

export interface TagDefinitionCreateOrUpdateRequest {
    tagDefinition: TagDefinitionForCreateOrUpdate;

    /**
     * If you are creating one of these objects through the CloudFormation custom resource, then you should set this
     * to be something that is tied to the stack that did the creation/update and we ask that you prepend it with 'cloudformation/'
     * so we understand it was created/updated by cloudformation as in 'cloudformation/my-stack-name'.
     */
    userId: string;
}

export interface TagDefinitionCreateOrUpdateResponse {
    success: boolean;
    tagDefinition: TagDefinition<TagDefinitionWidget>;
}

/**
 * You don't have to provide anything in this request if you don't want to.  If you don't pass in tagsDesire...
 *
 * If this is being used in the context of admin API then
 * you will get all tag definitions.  If this is being used in the context of a chat app user, then you will get all tag defs not disabled.
 *
 *
 * If you do pass in tagsDesired, then our dynamodb query will scan the table for all rows (should be performant since there won't be more than a
 * few hundred tag defs at absolute most) and then will filter them to only those that match the tagsDesired.  Note if this is being called in the
 * context of a chat app user, then you will get all tag defs not disabled even if you pass in tagsDesired.
 *
 * Instructions can be big so unless you ask for them, we will not return them.
 */
export interface TagDefinitionSearchRequest {
    tagsDesired?: TagDefinitionLite[];

    /** If not true, instructions will not be returned to save space. */
    includeInstructions?: boolean;

    /**
     * If you pass in a pagination token, we will return the next page of tag defs. Be sure to include your original
     * request (tagsDesired, includeInstructions) if they were present in the original request.
     */
    paginationToken?: Record<string, any> | undefined;
}

export interface TagDefinitionSearchResponse {
    success: boolean;
    tagDefinitions: TagDefinition<TagDefinitionWidget>[];

    /** If this is present, there are more records that could be returned.  Pass this token in to get the next page with the same request. */
    paginationToken?: Record<string, any> | undefined;
}

export interface TagDefinitionDeleteRequest {
    tagDefinition: TagDefinitionLite;
    userId: string;
}

export interface TagDefinitionDeleteResponse {
    success: boolean;
}

export interface TagDefinitionsJsonFile {
    tagDefs: TagDefInJsonFile[];
}

export interface TagDefInJsonFile {
    tag: string;
    scope: string;
    gzippedBase64EncodedString: string;
}
