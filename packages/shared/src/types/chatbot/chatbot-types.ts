import type { ActionGroupInvocationInput, AgentCollaboration, FunctionDefinition, RetrievalFilter, Trace } from '@aws-sdk/client-bedrock-agent-runtime';
import type { Role } from '@aws-sdk/client-bedrock-agentcore';

export type CompanyType = 'retailer' | 'supplier';

export const DEFAULT_MAX_MEMORY_RECORDS_PER_PROMPT = 25;
export const DEFAULT_MAX_K_MATCHES_PER_STRATEGY = 5;
export const DEFAULT_MEMORY_STRATEGIES: UserMemoryStrategy[] = ['preferences', 'semantic'];
export const DEFAULT_EVENT_EXPIRY_DURATION = 7;

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
 * Represents a context item that was sent to the LLM in this session.
 * Used to track which contexts have been sent to avoid redundant transmission.
 */
export interface SentContextRecord {
    /** The sourceId of the context that was sent */
    sourceId: string;
    /** Array of message IDs where this context was sent (tracks all occurrences) */
    messageIds: string[];
    /** The content hash of the context when it was sent */
    contentHash: string;
    /** ISO 8601 timestamp of the last time this context was sent */
    lastSentAt: string;
    /** The origin of the context (user or auto) */
    origin: WidgetContextSourceOrigin;
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
    /**
     * The type of user who created this session.  Used for filtering sessions by internal vs external users
     * in session insights. Defaults to 'external-user' if not provided.
     */
    userType?: UserType;
    /** Identifier for the specific agent instance */
    agentId: string;
    /** Identifier for the chat app */
    chatAppId: string;
    /** Unique identifier for the user's identity */
    identityId: string;
    /** Mode of the invocation of the agent */
    invocationMode: ConverseInvocationMode;
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
     * If the entity feature is enabled, this is the entity ID of the user who created the session at the moment of creation.
     *
     * If the site wide entity feature is not enabled or if the associated chat app has disabled the entity feature or
     * if this session is being created in the context of a direct invocation (no chat app involved) then this is the string
     * "chat-app-global" indicating that if the user chooses to share this session, it will be accessible to anyone with access to the chat app who has the link.
     * Otherwise, only those who have access to the chat app and are associated with the same entity ID as the session owner will be able to access the session.
     */
    entityId: string;

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

    /**
     * Tracks context items that have been sent to the LLM in this session.
     * Keyed by sourceId to allow efficient lookups when determining if a context has changed or needs to be resent.
     *
     * This is used to:
     * - Avoid sending the same context multiple times
     * - Detect when context has changed (via contentHash comparison)
     * - Track which message included each piece of context
     */
    sentContexts?: Record<string, SentContextRecord>;
    /** The share ID if this session is shared */
    shareId?: string;
    /** User ID of the user who created the share */
    shareCreatedByUserId?: string;
    /** When this session was first shared */
    shareDate?: string;
    /** When this session's share was revoked */
    shareRevokedDate?: string;

    /** If set to 'mock', this session is used for integration testing purposes. */
    testType?: 'mock';

    /**
     * The source of the converse request. Defaults to 'user'.  The composite key chat_app_sk looks like this:
     *
     * ${chatAppId}#${source}#${updateDate}
     *
     * The source in the composite key here will only ever be either `user` or `component`.  If this attribute's value is missing or is `user` or `component-as-user`,
     * then the composite key will be set to `user` so when we query on behalf of the user, we will get all sessions for that user.
     */
    source: ConverseSource;
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

    /** Not populated in dynamodb, only present when interacting with opensearch.  We extract the llm-instructions trace and put it here for opensearch indexing. */
    llmInstructions?: string;

    /** Not populated in dynamodb, only present when interacting with opensearch.  We serialize the traces array to a string for opensearch indexing. */
    tracesStrGzipped?: string;

    /** The invocation mode, denormalized from the session for filtering and aggregation. Populated in DynamoDB at message creation time. Defaults to 'chat-app' if not provided. */
    invocationMode?: ConverseInvocationMode;

    /** The user type, denormalized from the session for filtering by internal vs external users. Populated in DynamoDB at message creation time. Defaults to 'internal-user' if not provided. */
    userType?: UserType;
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

export interface UserCognitoIdentity {
    cognitoIdentityId: string;
    cognitoAccessToken: string;
}

export interface UserAwsCredentials {
    accessKeyId: string;
    secretKey: string;
    sessionToken: string;
    expiration: string;
}

export interface UserAwsCredentialsResponse {
    success: boolean;
    awsCredentials: UserAwsCredentials;
}

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

    /** If set to 'mock', this user is used for integration testing purposes. */
    testType?: 'mock';
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
     * If enabled, entity-based access control and filtering is active for this chat app.
     * Chat apps can only disable the entity feature, not modify the site-level configuration
     * like attributeName or display settings.
     */
    entity: {
        /**
         * If false, entity features are disabled for this chat app regardless of site settings.  This
         * affects the session share feature.  If this is false, then a shared session will be
         * accessible to anyone with access to the chat app that the session exists within.
         */
        enabled: boolean;

        /**
         * The attribute name in the user's custom data that is used to match against the entity access control lists.
         *
         * This value is copied from the site level entity feature configuration and may not be overridden at the chat app level.
         *
         * It enabled is true and this is not set, then an error will be thrown.
         */
        attributeName?: string;
    };

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

    instructionAugmentation: InstructionAugmentationFeature;

    userMemory: UserMemoryFeature;

    /**
     * Intent Router configuration. When enabled, user messages are classified
     * using a fast LLM before invoking the Bedrock agent, allowing fast
     * routing to widgets for known intents.
     *
     * @since 0.18.0
     */
    intentRouter?: IntentRouterFeature;
}

/**
 * Intent Router feature configuration for a chat app.
 * @since 0.18.0
 */
export interface IntentRouterFeature {
    /** Whether the Intent Router is enabled for this chat app */
    enabled: boolean;

    /** Default confidence threshold for command matching (default 0.85) */
    confidenceThreshold?: number;

    /**
     * Optional command overrides per tag definition.
     * Allows disabling or adjusting priority of specific commands.
     * Key is "scope.tag", value is a record of commandId to override config.
     */
    commandOverrides?: Record<
        string,
        Record<
            string,
            {
                /** Disable this command for this chat app */
                disabled?: boolean;
                /** Adjust priority (added to command's base priority) */
                priorityBoost?: number;
            }
        >
    >;
}

// ============================================================
// Intent Router Command Types
// ============================================================

/**
 * Commands that can be streamed back and executed by the Pika client.
 * These map to existing ChatAppState methods for consistency.
 * @since 0.18.0
 */
export type PikaCommand =
    | PikaRenderTagCommand
    | PikaCloseCanvasCommand
    | PikaCloseDialogCommand
    | PikaCloseHeroCommand
    | PikaShowHeroCommand
    | PikaHideHeroCommand
    | PikaShowToastCommand
    | PikaNavigateToCommand
    | PikaCustomCommand;

export interface PikaRenderTagCommand {
    type: 'renderTag';
    /** Tag ID in format "scope.tag" (e.g., "rcs.job") */
    tagId: string;
    /** Which rendering context to use */
    renderingContext: Exclude<WidgetRenderingContextType, 'inline' | 'static'>;
    /** Data to pass to the widget */
    data?: Record<string, unknown>;
    /** Optional metadata for the widget */
    metadata?: {
        title?: string;
        companionMode?: boolean;
        chatPaneMinimized?: boolean;
    };
}

export interface PikaCloseCanvasCommand {
    type: 'closeCanvas';
}

export interface PikaCloseDialogCommand {
    type: 'closeDialog';
}

export interface PikaCloseHeroCommand {
    type: 'closeHero';
}

export interface PikaShowHeroCommand {
    type: 'showHero';
}

export interface PikaHideHeroCommand {
    type: 'hideHero';
}

export interface PikaShowToastCommand {
    type: 'showToast';
    message: string;
    variant: 'success' | 'error' | 'info' | 'warning';
}

export interface PikaNavigateToCommand {
    type: 'navigateTo';
    path: string;
}

export interface PikaCustomCommand {
    type: 'custom';
    /** Action identifier for the handler to dispatch on */
    action: string;
    /** Parameters for the action */
    params: Record<string, unknown>;
}

/**
 * A command definition that can be matched by the Intent Router.
 * These are defined on tag definitions in the `intentRouterCommands` array.
 * @since 0.18.0
 */
export interface IntentRouterCommand {
    /** Unique ID within this tag definition (e.g., "view_jobs", "fix_errors") */
    commandId: string;

    /** Human-readable name for admin UI */
    name: string;

    /** Description shown to classifier for classification */
    description: string;

    /** Example user queries that should match this command */
    examples: string[];

    /** Queries that should NOT match (helps classifier distinguish similar intents) */
    antiExamples?: string[];

    /** Priority when multiple commands match across tag definitions (higher = preferred) */
    priority: number;

    /** Minimum confidence required to match (default 0.85) */
    confidenceThreshold?: number;

    /**
     * Context requirements (command only eligible if these paths exist in context).
     * Uses dot notation for nested paths (e.g., "currentJob.jobId").
     */
    requiresContext?: string[];

    /** How to execute when matched */
    execution: IntentRouterCommandExecution;
}

/**
 * How a matched command should be executed.
 */
export type IntentRouterCommandExecution = IntentRouterDirectExecution | IntentRouterDispatchExecution;

/**
 * Direct execution: Router immediately executes a PikaCommand and returns a response.
 * Use for simple cases where no custom logic is needed.
 */
export interface IntentRouterDirectExecution {
    mode: 'direct';

    /** The PikaCommand to execute (supports template interpolation in string values) */
    command: PikaCommand;

    /** Response template to show user (supports {{context.xxx}} interpolation) */
    responseTemplate?: string;

    /** If true, still call Bedrock after executing command (for richer response) */
    passToAgent?: boolean;
}

/**
 * Dispatch execution: Router sends event to a handler widget for custom logic.
 * Use when you need runtime decision-making (API calls, conditional rendering, etc.).
 *
 * In dispatch mode, the server sends the dispatch event and the response template,
 * then completes the turn (no Bedrock agent call). The orchestrator widget handles
 * the command entirely on the client side.
 */
export interface IntentRouterDispatchExecution {
    mode: 'dispatch';

    /** Tag ID of the widget that will handle this command (e.g., "rcs.orchestrator") */
    handlerTagId: string;

    /** Custom payload to send to handler */
    payload?: Record<string, unknown>;

    /** Response to show user (e.g., "Opening jobs..."). Supports {{context.xxx}} interpolation. */
    responseTemplate?: string;
}

/**
 * Event dispatched to a handler widget when a command is matched.
 * @since 0.18.0
 */
export interface IntentRouterCommandEvent {
    /** The matched command ID */
    commandId: string;

    /** The intent that was matched (same as commandId in most cases) */
    intent: string;

    /** Classification confidence (0-1) */
    confidence: number;

    /** Tag ID of the handler widget (e.g., "rcs.orchestrator") */
    handlerTagId?: string;

    /** Custom payload from command definition's execution.payload */
    payload?: Record<string, unknown>;

    /** Context from widgets (interpolated from llmContextItems) */
    context: Record<string, unknown>;

    /** The original user message */
    userMessage: string;

    /** Session info */
    sessionId: string;
    userId: string;
}

/**
 * Result returned by a command handler widget.
 * @since 0.18.0
 */
export interface IntentRouterHandlerResult {
    /** Whether this handler processed the command */
    handled: boolean;

    /** Response to stream back to user (if handled). Supports markdown. */
    response?: string;

    /** Additional commands to execute after the response (optional) */
    commands?: PikaCommand[];
}

/**
 * Handler function type for intent router command dispatch.
 * @since 0.18.0
 */
export type IntentRouterHandler = (event: IntentRouterCommandEvent) => Promise<IntentRouterHandlerResult>;

export interface AgentInstructionChatAppOverridableFeature {
    enabled: boolean;
    includeOutputFormattingRequirements: boolean;
    includeInstructionsForTags: boolean;
    completeExampleInstructionEnabled: boolean;
    completeExampleInstructionLine?: string;
    jsonOnlyImperativeInstructionEnabled: boolean;
    jsonOnlyImperativeInstructionLine?: string;
    includeTypescriptBackedOutputFormattingRequirements: boolean;
    typescriptBackedOutputFormattingRequirements?: string;
}

export interface InstructionAssistanceConfig {
    outputFormattingRequirements: string;
    tagInstructions?: string;
    completeExampleInstructionLine: string;
    jsonOnlyImperativeInstructionLine: string;
    typescriptBackedOutputFormattingRequirements: string;
}

export interface TagsChatAppOverridableFeature {
    tagsEnabled: TagDefinitionLite[];
    tagsDisabled: TagDefinitionLite[];
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
    timezone?: string;
}

export interface ConverseRequestWithCommand {
    command: 'clearConverseLambdaCache';
    cacheType: ClearConverseLambdaCacheType;
    agentId?: string;
    userId: string;
}

export const ClearConverseLambdaCacheTypes = ['agent', 'tagDefinitions', 'instructionAssistanceConfig', 'intentRouterCommands', 'all'] as const;
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

    /**
     * This is the attribute name in the user's custom data that is used to match against the entity access control lists.
     * This is only used if the entity feature is enabled and the user has an entity associated with them.
     *
     * @see pika-config.ts#siteFeatures.entity.attributeName
     */
    entityAttributeNameInUserCustomData?: string;

    /**
     * If provided, this will be used to determine the invocation mode of the converse request.
     *
     * If 'chat-app', then the converse request is a chat app request.
     *
     * If 'direct-agent-invoke', then the converse request is a direct agent invoke request and is not
     * in the context of a chat app.  Since we are adding mode after the fact, if mode is provided
     * and it doesn't match what we expect, we will throw an error (chat-app requires that chatAppId is provided
     * and direct-agent-invoke requires that chatAppId is not provided).
     *
     * If 'chat-app-component', then the converse request is coming from a chat app component and is not
     * being initiated by the end user.  This is used to allow the component to invoke the agent directly
     * without the need for the end user to initiate the request.  These do not show up as user-created sessions
     * when we query for the users's sessions in this chat app.
     *
     * They are associated with the user and the chat app and the component in question.  When this mode is used,
     * the caller must provide the chatAppId and the agentId and the complete "tag" that represents the component doing the calling.
     * Tag definitions have both a scope and a tag.  Further, the `componentAgentInstructionName` must also provide so we
     * know which set of instructions from the tag definition to use.
     *
     * If invocationMode is not provided, uses the presence or absence of chatAppId to determine the mode (if chatAppId
     * is provided, then it's a chat app request, otherwise it's a direct agent invoke request).
     */
    invocationMode?: ConverseInvocationMode;

    /**
     * When invocationMode is 'chat-app-component', then this is the requiredconfiguration for the chat app component invocation.
     */
    chatAppComponentConfig?: ChatAppComponentConfig;

    /**
     * The source of the converse request. Defaults to 'user'.  The composite key chat_app_sk looks like this:
     *
     * ${chatAppId}#${source}#${updateDate}
     *
     * The source in the composite key here will only ever be either `user` or `component`.  If this attribute's value is missing or is `user` or `component-as-user`,
     * then the composite key will be set to `user` so when we query on behalf of the user, we will get all sessions for that user.
     *
     * If 'user', then the converse request is coming from the user.
     * If 'component-as-user', then the converse request is coming from a component acting as a user and thus sessions should show up in the user's sessions list.
     * If 'component', then the converse request is coming from a component.
     */
    source: ConverseSource;

    /**
     * The context items to include in the LLM prompt.  Before we call the LLM to answer the
     * user's question, we will first use another LLM request to determine which context items are relevant to the user's question.
     * The relevant context items are then appended to the prompt sent to the LLM.
     */
    llmContextItems?: LLMContextItem[];
}

export const ConverseSource = ['user', 'component-as-user', 'component'] as const;
export type ConverseSource = (typeof ConverseSource)[number];
/**
 * This is the configuration for a chat app component invocation to the converse lambda function.
 */
export interface ChatAppComponentConfig {
    /**
     * The name of the set of instructions to use for the component invocation.
     * This is the key in the `componentAgentInstructionsMd` record in the tag definition as in
     *
     * `tagDef.componentAgentInstructionsMd[componentAgentInstructionName]`
     */
    componentAgentInstructionName: string;

    /**
     * The tag definition that represents the component doing the calling.  We use this to look up the
     * right tag definition so we can get the correct instructions.  Note that you will get an exception
     * if the tag definition isn't associated with this chat app or isn't marked as `chat-app-global`.
     */
    componentTagDefinition: TagDefinitionLite;
}

export const ConverseInvocationModes = ['chat-app', 'direct-agent-invoke', 'chat-app-component'] as const;
export type ConverseInvocationMode = (typeof ConverseInvocationModes)[number];

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

export interface GetSessionAnalyticsAdminRequest {
    command: 'getSessionAnalytics';
    analyticsRequest: SessionAnalyticsRequest;
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

/**
 * Arbitrary key-value storage for web component state.
 * Scoped to user + component (scope.tag).
 * Max 400KB per component.
 */
export type UserWidgetData = Record<string, unknown>;

export interface GetUserWidgetDataRequest {
    scope: string;
    tag: string;
}

export interface GetUserWidgetDataResponse {
    success: boolean;
    userId: string;
    scope: string;
    tag: string;
    data?: UserWidgetData;
    error?: string;
}

export interface SetUserWidgetDataRequest {
    scope: string;
    tag: string;
    data: UserWidgetData;
    partial?: boolean; // If true, merge with existing data
}

export interface SetUserWidgetDataResponse {
    success: boolean;
    userId: string;
    scope: string;
    tag: string;
    data: UserWidgetData;
    error?: string;
}

export interface DeleteUserWidgetDataRequest {
    scope: string;
    tag: string;
}

export interface DeleteUserWidgetDataResponse {
    success: boolean;
    userId: string;
    scope: string;
    tag: string;
    error?: string;
}

export interface ChatUserAddOrUpdateResponse {
    success: boolean;
    user: ChatUser<RecordOrUndef>;
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

    /**
     * Allows searching for sessions by title (partial match), sessionId (exact match), or userId (exact match).
     * The search will try to match any of these fields.
     */
    query?: string;

    /**
     * Filter by date range.
     */
    dateFilter?: SessionSearchDateFilter;

    /** Filter by user type (internal-user or external-user). */
    userType?: UserType[];

    /** If provided, we will only return sessions with one of the given invocation modes. */
    invocationMode?: ConverseInvocationMode[];

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

    /**
     * Session attribute keys to inject into collaborator instructions as a `<session-context>` block.
     * Workaround for Bedrock not propagating promptSessionAttributes to inline collaborators.
     * If omitted or empty, no session context is injected.
     * @since 0.19.5
     */
    collaboratorContextFields?: string[];

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

    /** If set to 'mock', this is a test agent that will get deleted after 1 day.  This is used for integration testing. */
    testType?: 'mock';
}

/** @since 0.19.5 - Added collaboratorContextFields and collaborators to updateable fields */
export type UpdateableAgentDefinitionFields = Extract<
    keyof AgentDefinition,
    | 'basePrompt'
    | 'toolIds'
    | 'accessRules'
    | 'runtimeAdapter'
    | 'rolloutPolicy'
    | 'dontCacheThis'
    | 'knowledgeBases'
    | 'collaboratorContextFields'
    | 'collaborators'
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
 *
 * Three patterns are supported:
 * 1. tools only: Define new tools (create/update)
 * 2. agent.toolIds only: Reference existing tools by ID
 * 3. Both tools AND agent.toolIds: Mixed approach - define new tools while referencing existing ones
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
export type ExecutionType = 'lambda' | 'http' | 'inline' | 'mcp';

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
 * Tool definition representing a callable function/service
 */
export interface ToolDefinitionBase {
    /** Type of execution (lambda, http, inline) */
    executionType: ExecutionType;

    /** Unique tool name/version (e.g., 'weather-basic@1') */
    toolId: string;
    /** Friendly display name */
    displayName: string;
    /** Must not have spaces and no punctuation except _ and - :  ([0-9a-zA-Z][_-]?){1,100} */
    name: string;
    /** Description for LLM consumption. MUST BE LESS THAN 500 CHARACTERS */
    description: string;
    /** Timeout in seconds (default: 30) */
    executionTimeout?: number;
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

    /** If set to 'mock', this is a test tool that will get deleted after 1 day.  This is used for integration testing. */
    testType?: 'mock';
}

export interface LambdaToolDefinition extends ToolDefinitionBase {
    executionType: 'lambda';
    /**
     * If executionType is 'lambda', this is the required ARN of the Lambda function.
     * Note that the Lambda function must have an 'agent-tool' tag set to 'true'.
     */
    lambdaArn: string;
}

export interface McpToolDefinition extends ToolDefinitionBase {
    executionType: 'mcp';
    url: string;
    auth?: OAuth;
}

export interface InlineToolDefinition extends ToolDefinitionBase {
    executionType: 'inline';
    code: string; // This is the code to execute.  It is a stringified function.
    handler?: (event: ActionGroupInvocationInput, params: Record<string, any>) => Promise<unknown>;
}

export type ToolDefinition = LambdaToolDefinition | McpToolDefinition | InlineToolDefinition;

export type UpdateableToolDefinitionFields =
    | Extract<
          keyof ToolDefinitionBase,
          'name' | 'displayName' | 'description' | 'executionType' | 'executionTimeout' | 'supportedAgentFrameworks' | 'functionSchema' | 'tags' | 'lifecycle' | 'accessRules'
      >
    | 'lambdaArn'
    | 'url'
    | 'auth'
    | 'code';

export type ToolDefinitionForCreate =
    | (Omit<LambdaToolDefinition, 'version' | 'createdAt' | 'updatedAt' | 'lastModifiedBy' | 'createdBy'> & {
          toolId?: ToolDefinition['toolId'];
      })
    | (Omit<McpToolDefinition, 'version' | 'createdAt' | 'updatedAt' | 'lastModifiedBy' | 'createdBy'> & {
          toolId?: ToolDefinition['toolId'];
      });

export type ToolDefinitionForIdempotentCreateOrUpdate =
    | (Omit<LambdaToolDefinition, 'version' | 'createdAt' | 'updatedAt' | 'lastModifiedBy' | 'createdBy'> & {
          functionSchema: FunctionDefinition[];
          supportedAgentFrameworks: ['bedrock'];
      })
    | (Omit<InlineToolDefinition, 'version' | 'createdAt' | 'updatedAt' | 'lastModifiedBy' | 'createdBy'> & {
          functionSchema: FunctionDefinition[];
          supportedAgentFrameworks: ['bedrock'];
      })
    | (Omit<McpToolDefinition, 'version' | 'createdAt' | 'updatedAt' | 'lastModifiedBy' | 'createdBy'> & {
          functionSchema: FunctionDefinition[];
          supportedAgentFrameworks: ['bedrock'];
      });

export interface OAuth {
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
    token?: {
        accessToken: string;
        expires: number;
    };
}

export type ToolDefinitionForUpdate =
    | (Partial<Omit<LambdaToolDefinition, 'version' | 'createdAt' | 'createdBy' | 'updatedAt' | 'lastModifiedBy'>> & {
          toolId: string;
      })
    | (Partial<Omit<McpToolDefinition, 'version' | 'createdAt' | 'createdBy' | 'updatedAt' | 'lastModifiedBy'>> & {
          toolId: string;
      });

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

// ===== MOCK DATA APIS FOR TESTING =====

export interface DeleteMockDataRequest {
    userId: string;
    sessions?: {
        sessionId: string;
        sessionUserId: string;
    }[];
    chatApps?: {
        chatAppId: string;
    }[];
    agents?: {
        agentId: string;
    }[];
    tools?: {
        toolId: string;
    }[];
    users?: {
        userId: string;
    }[];
}

export interface DeleteMockDataResponse {
    success: boolean;
}

export interface CreateOrUpdateMockSessionRequest {
    session: ChatSessionForCreate & { test: 'test' };
    userId: string; // admin user creating the mock
}

export interface CreateOrUpdateMockSessionResponse {
    success: boolean;
    session: ChatSession<RecordOrUndef>;
}

export interface DeleteMockSessionRequest {
    sessionId: string;
    sessionUserId: string; // owner of session
    userId: string; // admin user deleting the mock
}

export interface DeleteMockSessionResponse {
    success: boolean;
}

export interface CreateOrUpdateMockChatAppRequest {
    chatApp: ChatApp & { test: 'test' };
    userId: string;
}

export interface CreateOrUpdateMockChatAppResponse {
    success: boolean;
    chatApp: ChatApp;
}

export interface DeleteMockChatAppRequest {
    chatAppId: string;
    userId: string;
}

export interface DeleteMockChatAppResponse {
    success: boolean;
}

export interface CreateOrUpdateMockAgentRequest {
    agent: AgentDefinition & { test: 'test' };
    userId: string;
}

export interface CreateOrUpdateMockAgentResponse {
    success: boolean;
    agent: AgentDefinition;
}

export interface DeleteMockAgentRequest {
    agentId: string;
    userId: string;
}

export interface DeleteMockAgentResponse {
    success: boolean;
}

export interface CreateOrUpdateMockToolRequest {
    tool: ToolDefinition & { test: 'test' };
    userId: string;
}

export interface CreateOrUpdateMockToolResponse {
    success: boolean;
    tool: ToolDefinition;
}

export interface DeleteMockToolRequest {
    toolId: string;
    userId: string;
}

export interface DeleteMockToolResponse {
    success: boolean;
}

export interface CreateOrUpdateMockUserRequest {
    user: ChatUser<RecordOrUndef> & { test: 'test' };
    userId: string; // admin user creating the mock
}

export interface CreateOrUpdateMockUserResponse {
    success: boolean;
    user: ChatUser<RecordOrUndef>;
}

export interface DeleteMockUserRequest {
    mockUserId: string; // userId of the mock user to delete
    userId: string; // admin user deleting the mock
}

export interface DeleteMockUserResponse {
    success: boolean;
}

// ===== GET ALL MOCK DATA APIS =====

export interface GetAllMockSessionsRequest {
    limit?: number;
    nextToken?: string;
}

export interface GetAllMockSessionsResponse {
    success: boolean;
    chatSessions: ChatSession<RecordOrUndef>[];
    nextToken?: string;
}

export interface GetMockSessionByUserIdAndSessionIdRequest {
    sessionId: string;
    userId: string;
}

export interface GetMockSessionByUserIdAndSessionIdResponse {
    success: boolean;
    chatSession?: ChatSession<RecordOrUndef>;
}

export interface GetAllMockUsersRequest {
    limit?: number;
    nextToken?: string;
}

export interface GetAllMockUsersResponse {
    success: boolean;
    chatUsers: ChatUser<RecordOrUndef>[];
    nextToken?: string;
}

export interface GetAllMockAgentsRequest {
    limit?: number;
    nextToken?: string;
}

export interface GetAllMockAgentsResponse {
    success: boolean;
    agents: AgentDefinition[];
    nextToken?: string;
}

export interface GetAllMockToolsRequest {
    limit?: number;
    nextToken?: string;
}

export interface GetAllMockToolsResponse {
    success: boolean;
    tools: ToolDefinition[];
    nextToken?: string;
}

export interface GetAllMockChatAppsRequest {
    limit?: number;
    nextToken?: string;
}

export interface GetAllMockChatAppsResponse {
    success: boolean;
    chatApps: ChatApp[];
    nextToken?: string;
}

export interface GetAllMockSharedSessionVisitsRequest {
    limit?: number;
    nextToken?: string;
}

export interface GetAllMockSharedSessionVisitsResponse {
    success: boolean;
    sharedSessionVisits: SharedSessionVisitHistory[];
    nextToken?: string;
}

export interface GetAllMockPinnedSessionsRequest {
    limit?: number;
    nextToken?: string;
}

export interface GetAllMockPinnedSessionsResponse {
    success: boolean;
    pinnedSessions: PinnedSession[];
    nextToken?: string;
}

export interface GetAllMockDataRequest {
    limit?: number;
}

export interface GetAllMockDataResponse {
    success: boolean;
    data: {
        sessions: ChatSession<RecordOrUndef>[];
        users: ChatUser<RecordOrUndef>[];
        agents: AgentDefinition[];
        tools: ToolDefinition[];
        chatApps: ChatApp[];
        sharedSessionVisits: SharedSessionVisitHistory[];
        pinnedSessions: PinnedSession[];
    };
}

// ===== DELETE ALL MOCK DATA APIS =====

export interface DeleteAllMockSessionsRequest {
    userId: string;
}

export interface DeleteAllMockSessionsResponse {
    success: boolean;
    deletedCount: number;
}

export interface DeleteAllMockUsersRequest {
    userId: string;
}

export interface DeleteAllMockUsersResponse {
    success: boolean;
    deletedCount: number;
}

export interface DeleteAllMockAgentsRequest {
    userId: string;
}

export interface DeleteAllMockAgentsResponse {
    success: boolean;
    deletedCount: number;
}

export interface DeleteAllMockToolsRequest {
    userId: string;
}

export interface DeleteAllMockToolsResponse {
    success: boolean;
    deletedCount: number;
}

export interface DeleteAllMockChatAppsRequest {
    userId: string;
}

export interface DeleteAllMockChatAppsResponse {
    success: boolean;
    deletedCount: number;
}

export interface DeleteAllMockSharedSessionVisitsRequest {
    userId: string;
}

export interface DeleteAllMockSharedSessionVisitsResponse {
    success: boolean;
    deletedCount: number;
}

export interface DeleteAllMockPinnedSessionsRequest {
    userId: string;
}

export interface DeleteAllMockPinnedSessionsResponse {
    success: boolean;
    deletedCount: number;
}

export interface DeleteAllMockDataRequest {
    userId: string;
    confirm?: boolean;
}

export interface DeleteAllMockDataResponse {
    success: boolean;
    deletedCounts: {
        sessions: number;
        users: number;
        agents: number;
        tools: number;
        chatApps: number;
        sharedSessionVisits: number;
        pinnedSessions: number;
        total: number;
    };
}

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

    /** If set to 'mock', this is a test chat app that will get deleted after 1 day.  This is used for integration testing. */
    testType?: 'mock';
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

    /**
     * Custom icon URL for this assistant, displayed on the home page card.
     * If not provided, a default sparkle icon is shown.
     *
     * **Recommended size:** 40x40 pixels (or 80x80 for retina displays)
     * **Supported formats:** SVG (recommended), PNG, JPG, WebP
     *
     * Place icons in `apps/pika-chat/static/custom/assets/` and reference as `/custom/assets/icon.svg`.
     *
     * @example "/custom/assets/order-icon.svg"
     * @since 0.16.4
     */
    icon?: string;
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
    | AgentInstructionAssistanceFeatureForChatApp
    | InstructionAugmentationFeatureForChatApp
    | UserMemoryFeatureForChatApp
    | EntityFeatureForChatApp
    | IntentRouterFeatureForChatApp;

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
    'agentInstructionAssistance',
    'instructionAugmentation',
    'userMemory',
    'entity',
    'intentRouter'
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
    agentInstructionAssistance: 'Agent Instruction Assistance',
    instructionAugmentation: 'Instruction Augmentation',
    userMemory: 'User Memory',
    entity: 'Entity',
    intentRouter: 'Intent Router'
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

    /**
     * Custom theme configuration. When enabled, allows clone projects to customize
     * colors, typography, and styling via a custom theme file.
     *
     * @see ThemeConfig in theme-types.ts
     * @since 0.16.0
     */
    customTheme?: {
        /**
         * Whether custom theming is enabled.
         * If false, the default Pika theme is used and the theme config is not loaded.
         */
        enabled: boolean;

        /**
         * Path to theme config file relative to apps/pika-chat/
         * The file must export a `themeConfig` object of type ThemeConfig.
         *
         * @default 'src/lib/custom/sample-purple-theme'
         */
        themeConfigPath?: string;
    };
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

export interface InstructionAugmentationFeatureForChatApp extends InstructionAugmentationFeature, Feature {
    featureId: 'instructionAugmentation';
}

export interface UserMemoryFeatureForChatApp extends UserMemoryFeature, Feature {
    featureId: 'userMemory';
}

export interface EntityFeatureForChatApp extends Feature {
    featureId: 'entity';
    /** Whether entity feature is enabled for this chat app. Can only be set to false to disable site-level configuration. */
    enabled: boolean;
    attributeName?: string;
}

/**
 * Intent Router feature configuration for a chat app.
 * Enables fast command routing to widgets without full LLM inference.
 * @since 0.18.0
 */
export interface IntentRouterFeatureForChatApp extends IntentRouterFeature, Feature {
    featureId: 'intentRouter';
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

    /**
     * This is only used for component invocation instructions.  If true, a line will be added to the component invocation
     * instructions that instructs the agent to only respond with valid JSON conforming to the TypeScript interface defined in the <output_schema> block.
     */
    includeTypescriptBackedOutputFormattingRequirements?: {
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
    | GetValuesForEntityListRequest
    | GetValuesForUserAutoCompleteRequest
    | GetUsersForUserListRequest
    | ClearConverseLambdaCacheRequest
    | ClearSvelteKitCachesRequest
    | AddChatSessionFeedbackAdminRequest
    | UpdateChatSessionFeedbackAdminRequest
    | SessionSearchAdminRequest
    | GetSessionAnalyticsAdminRequest
    | GetChatMessagesAsAdminRequest
    | CreateOrUpdateTagDefinitionAdminRequest
    | DeleteTagDefinitionAdminRequest
    | SearchTagDefinitionsAdminRequest
    | SearchSemanticDirectivesAdminRequest
    | SemanticDirectiveCreateOrUpdateAdminRequest
    | SemanticDirectiveDeleteAdminRequest
    | GetInstructionAssistanceConfigFromSsmRequest
    | GetAllChatAppsAdminRequest
    | GetAllAgentsAdminRequest
    | GetAllToolsAdminRequest
    | GetAllMemoryRecordsAdminRequest
    | GetInstructionsAddedForUserMemoryAdminRequest;

export const SiteAdminCommand = [
    'getAgent',
    'getInitialData',
    'refreshChatApp',
    'createOrUpdateChatAppOverride',
    'deleteChatAppOverride',
    'getValuesForEntityAutoComplete',
    'getValuesForEntityList',
    'getValuesForUserAutoComplete',
    'getUsersForUserList',
    'clearConverseLambdaCache',
    'clearSvelteKitCaches',
    'addChatSessionFeedback',
    'updateChatSessionFeedback',
    'sessionSearch',
    'getSessionAnalytics',
    'getChatMessagesAsAdmin',
    'createOrUpdateTagDefinition',
    'deleteTagDefinition',
    'searchTagDefinitions',
    'searchSemanticDirectives',
    'createOrUpdateSemanticDirective',
    'deleteSemanticDirective',
    'getInstructionAssistanceConfigFromSsm',
    'getAllChatApps',
    'getAllAgents',
    'getAllTools',
    'getAllMemoryRecords',
    'getInstructionsAddedForUserMemory'
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

export interface SearchSemanticDirectivesAdminRequest extends SiteAdminCommandRequestBase {
    command: 'searchSemanticDirectives';
    request: SearchSemanticDirectivesRequest;
}

export interface SemanticDirectiveCreateOrUpdateAdminRequest extends SiteAdminCommandRequestBase {
    command: 'createOrUpdateSemanticDirective';
    request: SemanticDirectiveCreateOrUpdateRequest;
}

export interface SemanticDirectiveDeleteAdminRequest extends SiteAdminCommandRequestBase {
    command: 'deleteSemanticDirective';
    request: SemanticDirectiveDeleteRequest;
}

export interface GetAllChatAppsAdminRequest extends SiteAdminCommandRequestBase {
    command: 'getAllChatApps';
}

export interface GetAllAgentsAdminRequest extends SiteAdminCommandRequestBase {
    command: 'getAllAgents';
}

export interface GetAllToolsAdminRequest extends SiteAdminCommandRequestBase {
    command: 'getAllTools';
}

export interface GetAllMemoryRecordsAdminRequest extends SiteAdminCommandRequestBase {
    command: 'getAllMemoryRecords';
    request: SearchAllMemoryRecordsRequest;
}

export interface GetInstructionsAddedForUserMemoryAdminRequest extends SiteAdminCommandRequestBase {
    command: 'getInstructionsAddedForUserMemory';
    request: GetInstructionsAddedForUserMemoryRequest;
}

/**
 * Request format for semantic directive data passed to custom CloudFormation resource
 */
export type SemanticDirectiveDataRequest = {
    userId: string;
    groupId: string;
    semanticDirectives: SemanticDirectiveForCreateOrUpdate[];
};

export interface GetValuesForEntityAutoCompleteRequest extends SiteAdminCommandRequestBase {
    command: 'getValuesForEntityAutoComplete';
    valueProvidedByUser: string;
    chatAppId?: string;
    type?: 'internal-user' | 'external-user';
}

/**
 * Request to get display values for a list of entity IDs
 * @since 0.12.0
 */
export interface GetValuesForEntityListRequest extends SiteAdminCommandRequestBase {
    command: 'getValuesForEntityList';
    entityIds: string[];
    chatAppId?: string;
}

export interface GetValuesForUserAutoCompleteRequest extends SiteAdminCommandRequestBase {
    command: 'getValuesForUserAutoComplete';
    valueProvidedByUser: string;
}

/**
 * Request to batch fetch user display information for a list of user IDs
 * @since 0.14.2
 */
export interface GetUsersForUserListRequest extends SiteAdminCommandRequestBase {
    command: 'getUsersForUserList';
    userIds: string[];
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

export interface GetAllChatAppsAdminResponse extends SiteAdminCommandResponseBase {
    chatApps: ChatApp[];
}

export interface GetAllAgentsAdminResponse extends SiteAdminCommandResponseBase {
    agents: AgentDefinition[];
}

export interface GetAllToolsAdminResponse extends SiteAdminCommandResponseBase {
    tools: ToolDefinition[];
}

export interface GetAllMemoryRecordsAdminResponse extends SiteAdminCommandResponseBase {
    memoryRecords: PagedRecordsResult;
}

export interface GetInstructionsAddedForUserMemoryAdminResponse extends SiteAdminCommandResponseBase {
    instructions: string;
}

export type SiteAdminResponse =
    | GetAgentResponse
    | GetInitialDataResponse
    | RefreshChatAppResponse
    | CreateOrUpdateChatAppOverrideResponse
    | DeleteChatAppOverrideResponse
    | GetValuesForEntityAutoCompleteResponse
    | GetValuesForEntityListResponse
    | GetValuesForUserAutoCompleteResponse
    | GetUsersForUserListResponse
    | ClearConverseLambdaCacheResponse
    | ClearSvelteKitCachesResponse
    | AddChatSessionFeedbackResponse
    | UpdateChatSessionFeedbackResponse
    | SessionSearchResponse
    | GetChatMessagesAsAdminResponse
    | GetInstructionAssistanceConfigFromSsmResponse
    | GetAllChatAppsAdminResponse
    | GetAllAgentsAdminResponse
    | GetAllToolsAdminResponse
    | GetAllMemoryRecordsAdminResponse
    | GetInstructionsAddedForUserMemoryAdminResponse;

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

/**
 * Response containing display values for entity IDs
 * @since 0.12.0
 */
export interface GetValuesForEntityListResponse extends SiteAdminCommandResponseBase {
    data: SimpleOption[] | undefined;
}

export interface GetValuesForUserAutoCompleteResponse extends SiteAdminCommandResponseBase {
    data: ChatUserLite[] | undefined;
}

/**
 * Response containing user display information for a list of user IDs
 * @since 0.14.2
 */
export interface GetUsersForUserListResponse extends SiteAdminCommandResponseBase {
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

    /**
     * Optional tags to apply to all AWS resources in your CDK stacks.
     * Supports dynamic placeholders that are replaced at CDK synth time:
     * @since 0.13.0
     * - {stage}: The deployment stage (e.g., 'dev', 'prod')
     * - {timestamp}: Current timestamp in ISO 8601 format
     * - {accountId}: AWS account ID where the stack is being deployed
     * - {region}: AWS region where the stack is being deployed
     * - {pika.projNameL}: Pika project name (lowercase)
     * - {pika.projNameKebabCase}: Pika project name (kebab-case)
     * - {pika.projNameTitleCase}: Pika project name (TitleCase)
     * - {pika.projNameCamel}: Pika project name (camelCase)
     * - {pika.projNameHuman}: Pika project name (human-readable)
     * - {pikaChat.projNameL}: Pika Chat project name (lowercase)
     * - {pikaChat.projNameKebabCase}: Pika Chat project name (kebab-case)
     * - {pikaChat.projNameTitleCase}: Pika Chat project name (TitleCase)
     * - {pikaChat.projNameCamel}: Pika Chat project name (camelCase)
     * - {pikaChat.projNameHuman}: Pika Chat project name (human-readable)
     *
     * Example:
     * ```typescript
     * stackTags: {
     *   common: {
     *     'ManagedBy': 'Pika',
     *     'env': '{stage}'
     *   },
     *   pikaServiceTags: {
     *     'app': '{pika.projNameKebabCase}'
     *   },
     *   pikaChatTags: {
     *     'app': '{pikaChat.projNameKebabCase}'
     *   }
     * }
     * ```
     */
    stackTags?: {
        /** Tags applied to both Pika service and Pika Chat stacks */
        common?: Record<string, string>;
        /** Additional tags applied only to the Pika service stack (merged with common, overwrites on conflict) */
        pikaServiceTags?: Record<string, string>;
        /** Additional tags applied only to the Pika Chat stack (merged with common, overwrites on conflict) */
        pikaChatTags?: Record<string, string>;
        /**
         * The platform will tag each component of infrastructure with a name.  This is the tag names to use for the component tags.
         * If not populated, then you will  not get any component tags.  Here are examples of a component tag assuming this array
         * contains `['component']`:
         *
         * ```
         * // Useful so in cost explorer you can break down the costs by inference profile
         * component: ${profileName}InferenceProfile
         *
         * // Useful so in cost explorer you can break down the costs by component
         * component: ${componentName}
         * ```
         *
         * @since 0.14.0
         */
        componentTagNames?: string[];
    };
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

    /** Configure whether the instruction augmentation feature is enabled. */
    instructionAugmentation?: InstructionAugmentationFeature;

    /** Configure whether the user memory feature is enabled. */
    userMemory?: UserMemoryFeature;

    /** Configure whether the Intent Router feature is enabled. @since 0.18.0 */
    intentRouter?: IntentRouterFeature;
}

/**
 * Configure whether the user memory feature is enabled.
 *
 * When turned on, we will create a global memory space that will be used to store the user's memory
 * and then we will automatically store memory evnents based on the strategies turned on and the
 * queries made by the user.  Then, we will query the memory to augment the prompt given to the LLM.
 */
export interface UserMemoryFeature {
    enabled: boolean;

    /** The maximum number of memory recrods to enrich a single prompt with.  Defaults to 25. */
    maxMemoryRecordsPerPrompt?: number;

    /** The maximum number of top matches to consider per strategy.  Defaults to 5. */
    maxKMatchesPerStrategy?: number;
}

export interface UserMemoryFeatureWithMemoryInfo extends UserMemoryFeature {
    memoryId: string;
    strategies: UserMemoryStrategy[];
    maxMemoryRecordsPerPrompt: number;
    maxKMatchesPerStrategy: number;
}

export const UserMemoryStrategies = ['preferences', 'semantic', 'summary'] as const;
export type UserMemoryStrategy = (typeof UserMemoryStrategies)[number];

// Define the types of content we store in memory
export interface UserMessageContent {
    type: 'user_message';
    text: string;
}

export interface AssistantMessageContent {
    type: 'assistant_message';
    text: string;
}

export interface AssistantRationaleContent {
    type: 'assistant_rationale';
    text: string;
}

export interface ToolInvocationContent {
    type: 'tool_invocation';
    invocation: {
        actionGroupInvocationInput?: any;
        knowledgeBaseLookupInput?: any;
        agentCollaboratorInvocationInput?: any;
        codeInterpreterInvocationInput?: any;
    };
}

// Union type for all possible memory content
export type MemoryContent = UserMessageContent | AssistantMessageContent | AssistantRationaleContent | ToolInvocationContent;

export type TypedContentWithRole = { content: MemoryContent; role: Role };

export interface MemoryQueryOptions {
    /** natural-language query for semantic search, default to '*' if not sure what to provide */
    query: string;
    /** how many highest-scoring hits to consider (server-side); we still cap with `maxResults` */
    maxResults: number;
    /** if you are paging, you can provide the nextToken from the previous response */
    nextToken?: string;
    /** how many highest-scoring hits to consider (server-side); we still cap with `maxResults` */
    topK?: number;
}

// What we get back when retrieving memory (either parsed JSON or raw text)
export type RetrievedMemoryContent = MemoryContent | string;

// Memory record summary with parsed content
export interface RetrievedMemoryRecordSummary {
    memoryRecordId: string | undefined;
    content: RetrievedMemoryContent | undefined;
    memoryStrategyId: string | undefined;
    namespaces: string[] | undefined;
    createdAt: Date | undefined;
    score?: number | undefined;
}

export type PagedRecordsResult = {
    records: RetrievedMemoryRecordSummary[];
    nextToken?: string;
};

export interface SearchAllMyMemoryRecordsRequest {
    strategy: UserMemoryStrategy;
    nextToken?: string;
}

export interface SearchAllMyMemoryRecordsResponse {
    success: boolean;
    error?: string;
    results: PagedRecordsResult;
}

export interface SearchAllMemoryRecordsRequest {
    userId: string;
    strategy: UserMemoryStrategy;
    nextToken?: string;
}

export interface SearchAllMemoryRecordsResponse {
    success: boolean;
    error?: string;
    results: PagedRecordsResult;
}

export interface GetInstructionsAddedForUserMemoryRequest {
    userId: string;
    strategies: UserMemoryStrategy[];
    maxMemoryRecordsPerPrompt: number;
    maxKMatchesPerStrategy: number;
    prompt: string;
}
export interface GetInstructionsAddedForUserMemoryResponse {
    success: boolean;
    error?: string;
    instructions: string;
}

/**
 * Sometimes you need to augment the prompt you will give to the LLM with additional information.
 * Currently, only one type of augmentation is supported: llm semantic search.  This uses the scope of the
 * agent invocation (chat app ID, agent ID, entity ID) to search for semantic directives in a database
 * of canned semantic directives that match the scope of the agent invocation.  Then, those semantic
 * directives are added to the prompt to be used by the LLM.  The LLM then takes the end user's message
 * and the semantic directives and uses them to determine if any of the semantic directives should be
 * included in the prompt.  If they should be included, then the semantic directive instruction is added to the prompt.
 *
 * Note that by default the feature is turned off.  To turn it on, you must set the `enabled` property to `true` or
 * it will not be turned on.  Then, all agents will have the type of augmentation chosen.
 *
 * Setting this as a site wide feature sets the default instruction augmentation type used, if turned on.  Individual chat apps
 * may override this behavior, turning off the feature or changing the augmentation type.
 *
 * Note that today we only support one type of augmentation: llm semantic directive search.  This is a light-weight
 * approach with a good balance of engineer velocity (don't have to ingest and index embeddings into a knowledge base),
 * performance and cost.
 */
export interface InstructionAugmentationFeature {
    enabled: boolean;
    type?: InstructionAugmentationType;
}

export const InstructionAugmentationTypes = ['llm-semantic-directive-search'] as const;
export type InstructionAugmentationType = (typeof InstructionAugmentationTypes)[number];

export const InstructionAugmentationTypeDisplayNames = {
    'llm-semantic-directive-search': 'LLM Semantic Directive Search'
} as const;
export type InstructionAugmentationTypeDisplayName = (typeof InstructionAugmentationTypeDisplayNames)[keyof typeof InstructionAugmentationTypeDisplayNames];

export const InstructionAugmentationScopeTypes = ['chatapp', 'agent', 'tool', 'entity', 'agent-entity'] as const;
export type InstructionAugmentationScopeType = (typeof InstructionAugmentationScopeTypes)[number];

export const InstructionAugmentationScopeTypeDisplayNames = {
    chatapp: 'Chat App',
    agent: 'Agent',
    tool: 'Tool',
    entity: 'Entity',
    'agent-entity': 'Agent and Entity'
} as const;
export type InstructionAugmentationScopeTypeDisplayName = (typeof InstructionAugmentationScopeTypeDisplayNames)[keyof typeof InstructionAugmentationScopeTypeDisplayNames];

/**
 * This is used to take the actual chatapp, agent, tools, and entity values used in a given agent invocation and use them
 * to go search for the matching semantic directives in the database.
 */
export type InvocationScopes = Partial<Record<InstructionAugmentationScopeType, (string | number | Record<string, string | number>)[] | undefined>>;

/**
 * A semantic directive is a special case or additional instruction paragraph that you might want the LLM to have included
 * in its context when responding to a user's question but that doesn't belong in the main prompt.  So, the LLM will
 * be given the semantic directives in the context of the user's question and will decide if any of them should be
 * included in the prompt.  If they should be included, then the semantic directive instruction is added to the prompt.
 *
 * One of the main use cases for this is when you have a tool with certain inputs and most of the time the LLM can
 * craft the correct inputs to your tool based on the question from an end user.  But, occasionally, you might wish to give
 * the LLM special instructions on certain details that are specific to a certain situation.
 *
 * Semantic directives are stored in a database and are associated with a scope.  The scope is used to narrow down which
 * directives we will give to the light-weight LLM to consider for inclusion in your prompt.  We first search the
 * database based on chat app, agent, tool and entity to get the set of directives that match the scope and then have the
 * LLM tell us if we should include them in the prompt.
 *
 * IMPORTANT: when you see us refer to 'entity' in a scope, it means that the entity is the entity that is associated with the user,
 * assuming you have turned on the entity feature. The value of the entity is entityFeature.attributeName.
 *
 * In your pika-config.ts file, you can turn on the entity feature by setting the entity feature to true.
 */
export interface SemanticDirective {
    /**
     * You don't set this value directly.  Instead, you set the scopeType and scopeValue from which we will construct the scope.
     *
     * Remember that we might have a database full of these semantic directives.  The scope then narrows down which
     * directives we will give to the light-weight LLM to consider for inclusion in your prompt.  We first search the
     * database based on chat app, agent, tool and entity to get the set of directives that match the scope and then have the
     * LLM tell us if we should include them in the prompt.
     *
     * We support the following scopes at present:
     * - chatapp: The ID of the chat app this semantic directive is associated with.
     * - agent: The ID of the agent this semantic directive is associated with.
     * - tool: the ID of the tool this semantic directive is associated with.
     * - entity: The ID of the entity this semantic directive is associated with.  Of course, if your pika instance
     *           doesn't turn on the uses of entities, then this scope will not be used.
     *
     * We support only the following compound scopes at present:
     * - agent#{agent-id}#entity#{entity-id}
     *
     * Examples:
     *
     * - `chatapp#weather-chat-app`
     * - `agent#weather-agent`
     * - `tool#weather-tool`
     * - `entity#account-123`
     * - `agent#weather-agent#entity#account-123` // matches only for queries by account-123 to the weather agent
     */
    scope: string;

    /**
     * The type of scope this semantic directive is associated with.  This tells us what
     * the value in `scopeValue` is.
     */
    scopeType: InstructionAugmentationScopeType;

    /**
     * The value of the scope this semantic directive is associated with.  This is a string or an object
     * depending on the value of `scopeType`.
     *
     * If `scopeType` is `agent` then this will be the agent ID.
     * If `scopeType` is `tool` then this will be the tool ID.
     * If `scopeType` is `entity` then this will be the entity ID (entityFeature.attributeName from user.customData).
     * If `scopeType` is `agent-entity` then this will be {agent: string, entity: string}.
     */
    scopeValue: string | number | Record<string, string | number>;

    /**
     * This plus scope must be unique across all semantic directives.
     *
     * Just a human-readable ID for the semantic directive.  Consider it a variable name: may use dashes and underscores
     * and should start with a letter (no spaces or special characters).  E.g. "account-details", "customer-support", "order-status", etc.
     * Used for db queries and to help engineers identify the semantic directive easily in a UI or DB.
     */
    id: string;

    /**
     * Used internally to group semantic directives created by a custom cloudformation resource. You shouldn't use this.
     * For example, a specific agent in a given stack may include CDK to define its semantic directives.  Pika needs to
     * know the complete set of semantic directives that exist for that group so that the agent author can have the
     * freedom to modify semantic directive scope values. This groupId then is how the pika platform will be able
     * to query for all the semantic directives created as a "group" by the agent author and know which semantic directives
     * should be deleted because they are no longer present in the CDK stack.
     *
     * Don't set this value directly.  Instead, let the custom cloudformation resource set it for you using the
     * `event.StackName` of the stack that created the semantic directive.
     */
    groupId?: string;

    /**
     * This is what the light-weight LLM will use to decide if the question asked by the end user means that
     * this semantic directive should be included in the prompt to ensure the final LLM gives a correct response.
     */
    description: string;

    /**
     * If the light-weight LLM determines that this semantic directive should be included in the prompt, then these
     * instructions will be included in the final prompt to the final LLM to guide its response.
     */
    instructions: string;

    /** If true, the semantic directive will not be used to augment the prompt. */
    disabled?: boolean;

    /** ISO 8601 formatted timestamp of when the semantic directive was created */
    createDate: string;

    /** User who created the semantic directive */
    createdBy: string;

    /** User who last updated the semantic directive */
    lastUpdatedBy: string;

    /** ISO 8601 formatted timestamp of the last semantic directive update */
    lastUpdate: string;
}

export interface SemanticDirectiveForCreateOrUpdate extends Omit<SemanticDirective, 'scope' | 'createDate' | 'lastUpdate'> {
    createdBy: string;
    lastUpdatedBy: string;
}

export interface SemanticDirectiveCreateOrUpdateRequest {
    semanticDirective: SemanticDirectiveForCreateOrUpdate;

    /**
     * If you are creating one of these objects through the CloudFormation custom resource, then you should set this
     * to be something that is tied to the stack that did the creation/update and we ask that you prepend it with 'cloudformation/'
     * so we understand it was created/updated by cloudformation as in 'cloudformation/my-stack-name'.
     */
    userId: string;
}

export interface SemanticDirectiveCreateOrUpdateResponse {
    success: boolean;
    semanticDirective: SemanticDirective;
}

export interface SemanticDirectiveScope {
    scopeType: InstructionAugmentationScopeType;
    scopeValue: string | number | Record<string, string | number>;
}

/**
 * Search request for semantic directives. Supports multiple search patterns based on our DynamoDB table design:
 * - If findOne is provided, then we will return the first directive that matches the scopeType, scopeValue and id.
 * - Query by specific scopes (main table access pattern)
 * - Query by creator and date range (GSI1: createdBy + createDate)
 * - Query by directive ID(s) across scopes (GSI2: id + scope)
 * - Date range filtering (created or updated)
 *
 * If no search criteria provided, returns all directives with pagination.
 */
export interface SearchSemanticDirectivesRequest {
    findOne?: {
        scopeType: InstructionAugmentationScopeType;
        scopeValue: string | number | Record<string, string | number>;
        id: string;
    };

    /**
     * Search for directives within specific scopes.
     * Uses parallel DynamoDB queries against the main table (PK = scope).
     */
    scopes?: SemanticDirectiveScope[];

    /** Will be used by the custom cloudformation resource to query for all semantic directives created as a "group" by the agent author. */
    groupId?: string;

    /**
     * Search for directives created by a specific user.
     * When provided, results are automatically sorted by createDate (newest first by default).
     *
     * Uses GSI1: createdBy + createDate
     */
    createdBy?: string;

    /**
     * Search for directives by specific IDs.
     * Returns directives matching any of the provided IDs across all scopes.
     *
     * Uses GSI2: id + scope
     */
    directiveIds?: string[];

    /**
     * Filter directives created after this ISO 8601 timestamp.
     * Can be combined with other filters.
     * Example: "2024-01-15T00:00:00Z"
     */
    createdAfter?: string;

    /**
     * Filter directives created before this ISO 8601 timestamp.
     * Can be combined with other filters.
     * Example: "2024-01-31T23:59:59Z"
     */
    createdBefore?: string;

    /**
     * Filter directives updated after this ISO 8601 timestamp.
     * Can be combined with other filters.
     */
    updatedAfter?: string;

    /**
     * Filter directives updated before this ISO 8601 timestamp.
     * Can be combined with other filters.
     */
    updatedBefore?: string;

    /**
     * Sort order for results when using createdBy search or no specific search criteria.
     * - 'asc': Oldest first
     * - 'desc': Newest first (default)
     */
    sortOrder?: 'asc' | 'desc';

    /**
     * Maximum number of directives to return per page.
     * Default: 50, Max: 100
     */
    limit?: number;

    /**
     * Pagination token from previous search response.
     * Include your original search criteria when using pagination.
     */
    paginationToken?: Record<string, any>;

    /**
     * If true, includes the full directive instructions in response.
     * If false, returns directive metadata only (scope, id, description, dates, etc).
     * Default: false (to save bandwidth)
     */
    includeInstructions?: boolean;

    /**
     * If true, excludes disabled directives in the response.
     * Default: false
     */
    excludeDisabled?: boolean;
}

export interface SearchSemanticDirectivesResponse {
    success: boolean;

    /** Array of semantic directives matching the search criteria */
    semanticDirectives: SemanticDirective[];

    /** Total count of directives found (may be larger than returned array due to pagination) */
    totalCount?: number;

    /** If present, there are more results available. Pass this token back in the next request. */
    paginationToken?: Record<string, any>;
}

export interface SemanticDirectiveDeleteRequest {
    semanticDirective: {
        scope: string;
        id: string;
    };

    /**
     * If you are deleting one of these objects through the CloudFormation custom resource, then you should set this
     * to be something that is tied to the stack that did the deletion and we ask that you prepend it with 'cloudformation/'
     * so we understand it was deleted by cloudformation as in 'cloudformation/my-stack-name'.
     */
    userId: string;
}

export interface SemanticDirectiveDeleteResponse {
    success: boolean;
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
     * Global tags are enabled by default.  Turn them off here if you don't want them.
     */
    tagsDisabled?: TagDefinitionLite[];
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
     * The tag definitions that are explicitly enabled for this chat app.
     * These are chat-app specific tags (usageMode='chat-app') that must be explicitly enabled.
     * Global tags (usageMode='global') are automatically included unless listed in tagsDisabled.
     */
    tagsEnabled?: TagDefinitionLite[];

    /**
     * Global tag definitions that should be disabled for this chat app.
     * Only applies to global tags (usageMode='global').
     * Use this to exclude specific global tags that you don't want available.
     */
    tagsDisabled?: TagDefinitionLite[];
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
     * The title of the home page. If not provided, defaults to "AI Assistants".
     * This is displayed prominently in the header next to the logo.
     */
    homePageTitle?: string;

    /**
     * Subtitle text displayed below the main title.
     * Provides context about what users can do on this page.
     *
     * @default "Select an assistant to get started"
     * @example "Intelligent tools to help you work smarter"
     * @since 0.16.4
     */
    subtitle?: string;

    /**
     * The welcome message to display on the home page. If not provided, the default welcome message will be used.
     * This is used to describe the home page to the user and in navigation.
     * @deprecated Use `subtitle` instead. This will be removed in a future version.
     */
    welcomeMessage?: string;

    /**
     * The text shown on the navigation button that takes users to the home page.
     * Appears in the sidebar/header area. Defaults to "AI Assistants" if not specified.
     *
     * @default "AI Assistants"
     * @example "Dashboard"
     * @example "All Assistants"
     * @since 0.16.4
     */
    navigationButtonText?: string;

    /**
     * Logo displayed in the home page header next to the title.
     * Can be a single URL string (same for both modes) or an object with separate light/dark URLs.
     *
     * Place custom logos in `apps/pika-chat/static/custom/assets/` and reference as `/custom/assets/filename.png`.
     * If not provided, defaults to the Pika logo. Set to `null` to hide the logo entirely.
     *
     * @default "/pika-logo-default.png"
     * @example "/custom/assets/my-company-logo.svg"
     * @example { light: "/custom/assets/logo-dark.svg", dark: "/custom/assets/logo-light.svg" }
     * @since 0.16.4
     */
    logo?: string | { light: string; dark?: string } | null;

    /**
     * Height of the logo in pixels. Width scales automatically to maintain aspect ratio.
     *
     * @default 48
     * @since 0.16.4
     */
    logoHeight?: number;

    /**
     * Gap between the logo and the title in pixels.
     *
     * @default 16
     * @since 0.16.4
     */
    logoGap?: number;

    /**
     * Whether to show the search bar on the home page.
     * When set to 'auto', search bar appears when there are 6 or more assistants.
     *
     * @default 'auto'
     * @since 0.16.4
     */
    searchEnabled?: boolean | 'auto';

    /**
     * Default icon for assistant cards on the home page when an assistant doesn't have its own icon.
     * If not set, a sparkle icon is displayed.
     *
     * **Recommended size:** 40×40 pixels (80×80 for retina displays)
     * **Supported formats:** SVG (recommended), PNG, JPG, WebP
     *
     * Place icons in `apps/pika-chat/static/custom/assets/` and reference as `/custom/assets/icon.svg`.
     *
     * @example "/custom/assets/default-assistant-icon.svg"
     * @since 0.16.4
     */
    defaultAssistantIcon?: string;

    /**
     * Size of the icon inside assistant cards in pixels. This controls the width and height
     * of the icon within the card's icon container.
     *
     * @default 24
     * @since 0.16.4
     */
    assistantIconSize?: number;

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

export const TAG_DEFINITION_STATUSES = ['enabled', 'disabled', 'retired'] as const;
export type TagDefinitionStatus = (typeof TAG_DEFINITION_STATUSES)[number];

export interface SpotlightContextConfig {
    enabled: boolean;
    isDefault?: boolean;
    displayOrder?: number;
    /** If true (default), only one instance of this widget can exist in spotlight at a time */
    singleton?: boolean;
    /** If false, widget won't appear in unpinned menu. Default: true. Use false for base widgets that only create instances */
    showInUnpinnedMenu?: boolean;
    /**
     * If true (default), widget is automatically created in spotlight on startup.
     * If false, widget must be explicitly rendered via `renderTag('scope.tag', 'spotlight')`.
     * @default true
     * @since 0.18.0
     */
    autoCreateInstance?: boolean;
    /**
     * If true, spotlight starts in collapsed/hidden state on startup.
     * User can expand it by clicking the header.
     * @default false
     * @since 0.18.0
     */
    startCollapsed?: boolean;
}

export interface InlineContextConfig {
    enabled: boolean;
}

export interface DialogContextConfig {
    enabled: boolean;
    size?: 'small' | 'medium' | 'large' | 'fullscreen';
}

export interface CanvasContextConfig {
    enabled: boolean;
}

/**
 * Sizing configuration for hero widgets.
 * Allows developers to control the dimensions of their hero widget.
 *
 * Behavior:
 * - If width/height specified, use that value (clamped to min/max)
 * - If not specified, use content's intrinsic size (clamped to min/max)
 * - Hero container is always centered horizontally
 * - Percentage values are responsive to viewport changes
 *
 * @since 0.18.0
 */
export interface HeroSizeConfig {
    /** Fixed width (e.g., '600px', '80%'). If not set, uses content width. */
    width?: string;
    /** Fixed height (e.g., '300px', 'auto'). If not set, uses content height. */
    height?: string;
    /** Minimum width constraint (e.g., '400px'). @default '200px' */
    minWidth?: string;
    /** Maximum width constraint (e.g., '900px', '90%'). @default '90%' */
    maxWidth?: string;
    /** Minimum height constraint in pixels. @default 100 */
    minHeight?: number;
    /** Maximum height constraint in pixels. @default 600 */
    maxHeight?: number;
}

/**
 * Hero rendering context configuration.
 * Hero is a singleton widget that displays dominantly above the chat input area,
 * below spotlight (if both are shown). Hero can be shown/hidden via API.
 */
export interface HeroContextConfig {
    enabled: boolean;
    /**
     * If true, hero widget is automatically rendered on startup.
     * If false (default), hero must be explicitly rendered via `renderTag('scope.tag', 'hero')`.
     * @default false
     * @since 0.18.0
     */
    autoCreateInstance?: boolean;
    /**
     * If true, hero starts in collapsed state on startup.
     * User can expand it by clicking the header.
     * Only applies when autoCreateInstance is true.
     * @default false
     * @since 0.18.0
     */
    startCollapsed?: boolean;
    /**
     * Sizing configuration for the hero widget.
     * Controls width and height constraints.
     * @since 0.18.0 - Extended with width controls
     */
    sizing?: HeroSizeConfig;
}

/**
 * Tag definition for widgets that have static context enabled.
 * Static widgets can run initialization code (like registering title bar actions)
 * when the chat app loads. They can also have other rendering contexts for visual UI.
 */
export type StaticWidgetTagDefinition = TagDefinition<TagDefinitionWidgetWebComponent> & {
    renderingContexts: {
        static: StaticContextConfig;
        spotlight?: SpotlightContextConfig;
        inline?: InlineContextConfig;
        dialog?: DialogContextConfig;
        canvas?: CanvasContextConfig;
        hero?: HeroContextConfig;
    };
};

/**
 * The static context is used to render a static component that doesn't render visually but is used to run code that needs to be run once.
 * For example, you might want to run a code snippet that puts an icon in the title bar of the chat app.
 */
export interface StaticContextConfig {
    enabled: boolean;
    /**
     * If provided, the static context container will be removed from the DOM after this many milliseconds.
     * If not provided, the container stays in the DOM (hidden) indefinitely.
     *
     * Use this when the static component only needs to run initialization code and doesn't need to
     * persist in the DOM afterwards.
     *
     * Example: 1000 (remove after 1 second)
     */
    shutDownAfterMs?: number;
}

export const WIDGET_RENDERING_CONTEXT_TYPES = ['spotlight', 'inline', 'dialog', 'canvas', 'static', 'hero'] as const;
export type WidgetRenderingContextType = (typeof WIDGET_RENDERING_CONTEXT_TYPES)[number];

export interface WidgetRenderingContexts {
    spotlight?: SpotlightContextConfig;
    inline?: InlineContextConfig;
    dialog?: DialogContextConfig;
    canvas?: CanvasContextConfig;
    static?: StaticContextConfig;
    hero?: HeroContextConfig;
}

/**
 * Represents a tracked widget instance with its DOM element and metadata.
 */
export interface WidgetInstance {
    /** Unique instance ID */
    instanceId: string;
    /** The actual DOM element */
    element: HTMLElement;
    /** Tag identifier (scope.tag) */
    tagId: string;
    /** Custom element name */
    customElementName: string;
    /** Rendering context where this widget appears */
    renderingContext: WidgetRenderingContextType;
    /** Tag definition */
    tagDefinition: TagDefinition<TagDefinitionWidgetWebComponent>;
    /** When this instance was created */
    createdAt: number;
}

/**
 * Metadata for a persistent spotlight instance (saved via Virtual Tags Pattern)
 */
export interface SpotlightInstanceMetadata {
    displayName: string;
    savedAt: string; // ISO-8601
    displayOrder: number;
    parentTag: string; // Base tag without instance suffix
    instanceId: string; // UUID
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

    /**
     * Determines how this tag can be used across chat apps.
     * - 'global': Tag is available to all chat apps by default (unless explicitly disabled)
     * - 'chat-app': Tag must be explicitly enabled in a chat app's configuration to be available
     *
     * REQUIRED: Must be explicitly set.
     * Built-in Pika tags (scope='pika') are typically 'global', while custom tags are typically 'chat-app'.
     */
    usageMode: TagDefinitionUsageMode;

    /**
     * The status of this tag definition.
     * - 'enabled': Tag is active and available for use
     * - 'disabled': Tag is temporarily disabled
     * - 'retired': Tag is permanently retired/deprecated
     *
     * REQUIRED: Must be explicitly set. If not provided, defaults to 'enabled'.
     * This is critical for the GSI to properly index all records.
     */
    status: TagDefinitionStatus;

    /**
     * Rendering contexts this widget supports.  Required.  Must have at least one context.
     */
    renderingContexts: WidgetRenderingContexts;

    /**
     * Indicates this is a mock/demo tag definition for development/testing purposes.
     * Mock tags may be filtered out in production environments.
     */
    isMock?: boolean;

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

    /**
     * If the code that backs your tag definition, whether compile in or a separate web component, has need to
     * directly invoke the agent to get assistance from an LLM, then you can create named sets of instructions
     * so when the component makes the request for help from the agent, the agent will know which set of instructions
     * to use.  For example, let's say you have a Spotlight component defined as a tag definition that needs to
     * on startup get a list of cities and then make a request to the agent to get the weather for the list of cities.
     * The default agent instructions for the agent probably woudn't return the weather information in a structured
     * manner.  So, you'd want to create a new set of instructions for the agent to use, with the same set of tools,
     * that the component code would cause to be used by asking for a direct agent invocation initiated from the
     * code in the browser and that references the name of the instructions to use that will retrieve the
     * weather as structured json let's say and that includes the list of cities you want the weather for.
     *
     * That way, the server side converse lambda function that responds to direct agent invocation requests will know
     * which set of instructions to use.  It's not a good idea to allow the client to define the entire set of instructions.
     *
     * It's too risky.  So, here's an example of a good set of instructions that you could use.  Note that the input value
     * sent from the browser webcomponent in this case would just be a list of locations that we would append to the bottom
     * of the following.  Also note that the {{typescript-backed-output-formatting-requirements}} placeholder is used to
     * inject the typescript backed output formatting requirements which are stored in S3.
     *
     * ```markdown
     * You are **WeatherDataLookupAgent**, a highly skilled assistant used to turn a list of locations into weather data.
     * Below you will find the list of locations you need to look up the weather for using the associated tools provided.
     *
     * <output_schema>
     * interface WeatherData {
     *     // ISO 8601 date string of when this data was generated
     *     date: string;
     *
     *     // the weather data  itself
     *     locations: LocationWeatherInfo[];
     * }
     *
     * interface LocationWeatherInfo {
     *     // The name of the location in a human readable format
     *     locationName: string;
     *
     *     // longitude for the location. Optional just in case you can't get it.
     *     lon?: string;
     *
     *     // latitude for the location.  Optional just in case you can't get it.
     *     lat?: string;
     *
     *     // The temperature in celsius
     *     tempC: string;
     *
     *     // The temperature in fahrenheit
     *     tempF: string;
     * }
     * </output_schema>
     *
     * {{typescript-backed-output-formatting-requirements}}
     * ```
     *
     * The key in the record is referred to as the "componentAgentInstructionName" and the value is the markdown string of the instructions.
     *
     */
    componentAgentInstructionsMd?: Record<string, string>;

    /**
     * Commands that the Intent Router can use to match user messages and trigger this widget.
     * When a user's message matches a command's intent, the router will execute the specified
     * action (render widget, dispatch event to handler, etc.).
     *
     * @example
     * ```typescript
     * intentRouterCommands: [
     *   {
     *     commandId: 'view_job',
     *     name: 'View Job',
     *     description: 'Opens the job the user is working on',
     *     examples: ['show me my job', 'open my job'],
     *     priority: 100,
     *     requiresContext: ['currentJob.jobId'],
     *     execution: {
     *       mode: 'direct',
     *       command: {
     *         type: 'renderTag',
     *         tagId: 'rcs.job',
     *         renderingContext: 'canvas',
     *         data: { jobId: '{{context.currentJob.jobId}}' }
     *       },
     *       responseTemplate: 'Opening your job: {{context.currentJob.name}}'
     *     }
     *   }
     * ]
     * ```
     *
     * @since 0.18.0
     */
    intentRouterCommands?: IntentRouterCommand[];

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

/**
 * Web component definition for create/update operations.
 * The s3Bucket field is omitted because it's filled in by the backend.
 */
export interface TagDefinitionWebComponentForCreateOrUpdate extends Omit<TagDefinitionWebComponent, 's3'> {
    s3?: {
        /** Must follow pattern: wc/${scope}/fileName.js.gz */
        s3Key: string;
    };
}

/**
 * Widget definition for web components in create/update operations.
 * Uses TagDefinitionWebComponentForCreateOrUpdate which omits the backend-managed s3Bucket field.
 */
export interface TagDefinitionWidgetWebComponentForCreateOrUpdate extends TagDefinitionWidgetBase {
    type: 'web-component';
    webComponent: TagDefinitionWebComponentForCreateOrUpdate;
}

/**
 * Union type for all widget types in create/update operations.
 * Uses the specialized web component type that omits backend-managed fields.
 */
export type TagDefinitionWidgetForCreateOrUpdate =
    | TagDefinitionWidgetPassThrough
    | TagDefinitionWidgetPikaCompiledIn
    | TagDefinitionWidgetCustomCompiledIn
    | TagDefinitionWidgetWebComponentForCreateOrUpdate;

/**
 * Tag definition for create/update operations.
 * Omits backend-managed fields and uses TagDefinitionWidgetForCreateOrUpdate which excludes
 * backend-managed fields from nested structures (like s3Bucket in web components).
 *
 * The usageMode field is optional and defaults to 'chat-app' if not provided.
 */
export type TagDefinitionForCreateOrUpdate<T extends TagDefinitionWidgetForCreateOrUpdate = TagDefinitionWidgetForCreateOrUpdate> = Omit<
    TagDefinition<TagDefinitionWidget>,
    'createdBy' | 'lastUpdatedBy' | 'createDate' | 'lastUpdate' | 'widget' | 'usageMode'
> & {
    widget: T;
    usageMode?: TagDefinitionUsageMode;
};

export const TAG_DEFINITION_USAGE_MODES = ['global', 'chat-app'] as const;
export type TagDefinitionUsageMode = (typeof TAG_DEFINITION_USAGE_MODES)[number];

export const TAG_DEFINITION_WIDGET_TYPES = ['pass-through', 'pika-compiled-in', 'custom-compiled-in', 'web-component'] as const;

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
export type TagDefinitionWidgetType = (typeof TAG_DEFINITION_WIDGET_TYPES)[number];

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

export type TagWebComponentEncoding = 'gzip';

/**
 * Preset dialog size options for web component widgets.
 * - 'fullscreen': 95vw x 90vh (default)
 * - 'large': 85vw x 80vh
 * - 'medium': 70vw x 70vh
 * - 'small': 50vw x 50vh
 */
export type WidgetDialogSizePreset = 'fullscreen' | 'large' | 'medium' | 'small';

/**
 * Custom dimensions for dialog sizing.
 * Values must be viewport-relative units (vh, vw, vmin, vmax) or percentages.
 * Pixel values are not supported to ensure responsive behavior.
 *
 * Examples:
 * - { width: "80vw", height: "70vh" }
 * - { width: "90%", height: "85%" }
 */
export interface WidgetDialogSizeCustom {
    /**
     * Dialog width as viewport-relative unit or percentage.
     * Examples: "80vw", "90%", "85vw"
     */
    width?: string;

    /**
     * Dialog height as viewport-relative unit or percentage.
     * Examples: "70vh", "80%", "60vh"
     */
    height?: string;
}

/**
 * Sizing configuration for dialog rendering context.
 * Can be either a preset size or custom dimensions.
 */
export type WidgetDialogSizing = WidgetDialogSizePreset | WidgetDialogSizeCustom;

/**
 * Sizing configuration for inline rendering context.
 * Inline widgets appear within the chat message flow.
 */
export interface WidgetInlineSizing {
    /**
     * Widget height for inline rendering.
     * Supports any valid CSS height value, or "auto" to grow to content height.
     * Defaults to "400px" if not specified.
     *
     * Special values:
     * - "auto": Widget grows to fit its content height (no fixed height constraint)
     *
     * Fixed height examples: "400px", "50vh", "500px", "30rem"
     */
    height?: string;

    /**
     * Widget width for inline rendering.
     * Reserved for future use. Currently, inline widgets always fill available width.
     *
     * Examples: "100%", "80vw", "600px"
     */
    width?: string;
}

/**
 * Sizing configuration for web component widgets across different rendering contexts.
 * Allows widget authors to control how their widget is sized in different visual contexts.
 */
export interface WidgetSizing {
    /**
     * Sizing for dialog (modal) rendering context.
     * When a widget is opened in a dialog, this controls its dimensions.
     *
     * Defaults to 'fullscreen' (95vw x 90vh) if not specified.
     */
    dialog?: WidgetDialogSizing;

    /**
     * Sizing for inline rendering context.
     * When a widget is rendered inline within a chat message.
     *
     * Defaults to { height: "400px" } if not specified.
     */
    inline?: WidgetInlineSizing;
}

export interface TagDefinitionWebComponent {
    /**
     * Direct URL to the web component JavaScript file.
     * Use this if the component is hosted externally (CDN, separate server, etc.)
     *
     * Either `url` OR `s3` must be provided, but not both.
     */
    url?: string;

    /**
     * S3 location of the web component JavaScript file in the Pika S3 bucket.
     * If provided, the system will serve it via /api/webcomponent/:scope/:tag
     *
     * Either `url` OR `s3` must be provided, but not both.
     */
    s3?: {
        /** Must be the Pika system S3 bucket (retrieved from SSM parameter) */
        s3Bucket: string;
        /** Must follow pattern: wc/${scope}/fileName.js.gz */
        s3Key: string;
    };

    /**
     * The actual custom element name that the JavaScript file defines.
     * This is the name used in customElements.define() in the JavaScript file.
     *
     * If not provided, defaults to `${scope}.${tag}` (e.g., "pika.mock-spotlight-1").
     *
     * Use this when:
     * - The JavaScript file defines a custom element with a different name than the tag
     * - Multiple tag definitions share the same JavaScript file that defines one custom element
     * - A JavaScript bundle file defines multiple custom elements
     *
     * Examples:
     * - "hello-world" for a file that calls customElements.define("hello-world", ...)
     * - "my-widget" for a file that calls customElements.define("my-widget", ...)
     */
    customElementName?: string;

    /**
     * Optional sizing configuration for this widget across different rendering contexts.
     *
     * If not provided, defaults are:
     * - dialog: 'fullscreen' (95vw x 90vh)
     * - inline: { height: "400px" }
     *
     * Examples:
     * ```typescript
     * // Preset dialog size
     * sizing: { dialog: 'medium', inline: { height: '300px' } }
     *
     * // Custom dialog size
     * sizing: { dialog: { width: '80vw', height: '60vh' } }
     *
     * // Only specify inline height
     * sizing: { inline: { height: '500px' } }
     * ```
     */
    sizing?: WidgetSizing;

    encoding: TagWebComponentEncoding;
    mediaType: 'application/javascript';
    encodedSizeBytes: number; // size of the stored object (post-encoding)

    /**
     * Hash of the GZIPPED file bytes as stored in S3 (NOT the decompressed JavaScript).
     * This hash is used for integrity validation when serving the file from S3.
     * When uploading to S3: hash = SHA256(gzippedBytes).toBase64()
     * When serving: compare stored hash to SHA256(gzippedBytesFromS3).toBase64()
     */
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
 * Search for tag definitions with two primary modes:
 *
 * MODE 1 - Get specific tags (optionally including globals):
 *   - Pass tagsDesired array for specific tags to retrieve
 *   - Set includeGlobal=true to also include all global tags
 *   - Uses primary key lookup (scope + tag) for specified tags
 *   - Uses GSI (scope-status-index) for global tags if includeGlobal=true
 *   - Returns requested tags + global tags (if includeGlobal=true)
 *
 * MODE 2 - Get all tags:
 *   - Don't pass tagsDesired or includeGlobal
 *   - Scans entire table with pagination
 *   - Returns all tag definitions
 *
 * If used in admin context, returns all tag definitions (including disabled/retired).
 * If used in chat app context, filters to only 'enabled' status.
 */
export interface TagDefinitionSearchRequest {
    /** Specific tags to retrieve by scope+tag */
    tagsDesired?: TagDefinitionLite[];

    /** If true, also includes all global tags (usageMode='global') in addition to tagsDesired */
    includeGlobal?: boolean;

    /** If not true, instructions will not be returned to save space */
    includeInstructions?: boolean;

    /** Pagination token for continued queries */
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

// ===== SHARING SESSIONS FEATURE TYPES =====

/**
 * SharedSessionVisitHistory tracks user visits to shared sessions
 */
export interface SharedSessionVisitHistory {
    shareId: string;
    entityId: string;
    chatAppId: string;
    firstVisitedAt: string;
    lastVisitedAt: string;
    visitCount: number;
    title: string;

    /** If set to 'mock', this is a test shared session visit history.  This is used for integration testing. */
    testType?: 'mock';
}

export interface SharedSessionVisitHistoryDynamoDb extends SharedSessionVisitHistory {
    userIdChatAppId: string;
}

/**
 * PinnedSession represents user-curated sidebar items (both own and shared sessions)
 */
export interface PinnedSession {
    shareId?: string; // for shared sessions
    sessionId?: string; // for own sessions
    userId: string; // the user who did the pinning, will be userId of session if pin is for own session
    chatAppId: string;
    pinnedAt: string;

    /** If set to 'mock', this is a test pinned session.  This is used for integration testing. */
    testType?: 'mock';
}

export type PinnedSessionDynamoDb = PinnedSession & {
    userIdChatAppId: string;
    sessionOrShareId: string;
};

export interface PinnedObjAndChatSession {
    pinnedSession: PinnedSession;
    chatSession: ChatSession<RecordOrUndef>;
}

// API Request/Response types

export interface CreateSharedSessionRequest {
    sessionId: string;
    sessionUserId: string;
    chatAppId: string;
}

export interface CreateSharedSessionResponse {
    success: boolean;
    shareId: string;
    chatAppId: string;
    error?: string;
}

export interface RevokeSharedSessionRequest {
    shareId: string;
}

export interface RevokeSharedSessionResponse {
    success: boolean;
    error?: string;
}

export interface UnrevokeSharedSessionRequest {
    shareId: string;
}

export interface UnrevokeSharedSessionResponse {
    success: boolean;
    error?: string;
}

export interface GetRecentSharedRequest {
    chatAppId: string;
    limit?: number; // default 5
    entityId?: string; // entity id to filter by
    nextToken?: string; // pagination token
}

export interface GetRecentSharedResponse {
    success: boolean;
    recentShared: SharedSessionVisitHistory[];
    error?: string;
    nextToken?: string; // pagination token
}

export interface GetPinnedSessionsRequest {
    chatAppId: string;
    limit?: number; // default 20
    nextToken?: string; // pagination token
}

export interface GetPinnedSessionsResponse {
    success: boolean;
    results: PinnedObjAndChatSession[];
    nextToken?: string; // for pagination
    error?: string;
}

export interface PinSessionRequest {
    pinnedSession: PinnedSession;
}

export interface PinSessionResponse {
    success: boolean;
    error?: string;
}

export interface UnpinSessionRequest {
    sessionId?: string; // for own sessions
    shareId?: string; // for shared sessions
    chatAppId: string;
}

export interface UnpinSessionResponse {
    success: boolean;
    error?: string;
}

export interface ValidateShareAccessRequest {
    shareId: string;
    chatAppId: string;
    entityId?: string;
}

export interface ValidateShareAccessResponse {
    success: boolean;
    hasAccess: boolean;
    sessionData?: ChatSession<RecordOrUndef>;
    error?: string;
}

export interface RecordShareVisitRequest {
    shareId: string;
}

export interface RecordShareVisitResponse {
    success: boolean;
    error?: string;
}

export interface ShowToastOptions {
    type: 'success' | 'error' | 'warning' | 'info';
    duration?: number | 'infinite';
}

export type ShowToastFn = (message: string, options: ShowToastOptions) => void;

export const ShareSessionStateList = ['disable-share-feature', 'shared-by-me', 'shared-by-someone-else', 'not-shared'] as const;
export type ShareSessionState = (typeof ShareSessionStateList)[number];

/**
 * Options for invokeAgentAsComponent() method
 */
export interface InvokeAgentAsComponentOptions {
    /**
     * Callback for streaming traces from the agent
     */
    onTrace?: (trace: any) => void;

    /**
     * Callback for progress updates (partial JSON text as it streams)
     */
    onProgress?: (partialText: string) => void;

    /**
     * Callback for agent thinking/rationale
     */
    onThinking?: (rationale: string) => void;

    /**
     * Callback for tool invocations
     */
    onToolCall?: (toolCall: { name: string; params: any }) => void;

    /**
     * Whether to include full traces in callbacks (default: false)
     */
    includeTraces?: boolean;

    /**
     * Request timeout in milliseconds (default: 60000)
     */
    timeout?: number;

    /**
     * The source of the converse request. Defaults to 'user'.  The composite key chat_app_sk looks like this:
     *
     * ${chatAppId}#${source}#${updateDate}
     *
     * The source in the composite key here will only ever be either `user` or `component`.  If this attribute's value is missing or is `user` or `component-as-user`,
     * then the composite key will be set to `user` so when we query on behalf of the user, we will get all sessions for that user.
     */
    source: ConverseSource;
}

/**
 * A single action button that will appear at the top of the chat app in the title bar or
 * that will appear in a button menu that pops up when the user clicks the title bar action button.
 *
 * @example
 * ```js
 * const action: ChatAppAction = {
 *   id: 'refresh',
 *   title: 'Refresh',
 *   iconSvg: '<svg>...</svg>',
 *   callback: () => refresh()
 * };
 * ```
 */
export interface ChatAppAction {
    /** Unique identifier for this action */
    id: string;
    /** Discriminator for the type */
    type: 'action';

    /** Tooltip or menu item description for the action */
    title: string;

    /** SVG markup string for the icon (e.g., from extractIconSvg() helper) */
    iconSvg: string;

    /** Whether action is currently disabled */
    disabled?: boolean;

    /** Handler when clicked */
    callback: () => void | Promise<void>;
}

/**
 * The only reason to use this is to get a title for the action group.
 */
export interface ChatAppActionGroup {
    /** Discriminator for the type */
    type: 'group';
    /** Title of the action group. The whole point of an action group is to get a title above the group. */
    title: string;
    /** Actions to display in the group */
    actions: (ChatAppAction | 'separator')[];
}

/**
 * The elements that can be displayed in a ChatAppActionMenu.
 */
export type ChatAppActionMenuElements = ChatAppActionGroup | ChatAppAction | 'separator';

/**
 * Widgets can register a single icon button or icon button with a menu that will appear at the top of the chat app in the title bar.
 */
export interface ChatAppActionMenu {
    /** Unique identifier for this action */
    id: string;
    /** Tooltip/label for the action (also button text in dialog context) */
    title: string;
    /** SVG markup string for the icon (e.g., from extractIconSvg() helper) */
    iconSvg: string;
    /** Whether the action menu is currently disabled */
    disabled?: boolean;
    /**
     * Actions to display in the menu
     * Here are some common examples:
     * - [
     *     { type: 'action', id: 'refresh', title: 'Refresh', iconSvg: '<svg>...</svg>', callback: () => refresh() },
     *     'separator',
     *     { id: 'settings', title: 'Settings', iconSvg: '<svg>...</svg>', callback: () => showSettings() }
     *   ]
     * - [
     *     { type: 'group', title: 'Settings', actions: [
     *       { type: 'action', id: 'refresh', title: 'Refresh', iconSvg: '<svg>...</svg>', callback: () => refresh() },
     *       'separator',
     *       { type: 'action', id: 'settings', title: 'Settings', iconSvg: '<svg>...</svg>', callback: () => showSettings() }
     *     ] }
     *   ]
     */
    actions: ChatAppActionMenuElements[];
}

export interface IUserWidgetDataStoreState {
    readonly initialized: boolean;
    readonly data: UserWidgetData | undefined;
    readonly showToast: ShowToastFn;
    refreshDataFromServer(): Promise<void>;
    getValue<T>(key: string): Promise<T | undefined>;
    setValue(key: string, value: unknown): Promise<void>;
    deleteValue(key: string): Promise<void>;
}

/**
 * Represents a unit of contextual information that can be considered for inclusion
 * in an LLM prompt when responding to a user's request.
 */
export interface LLMContextItem {
    /** A unique identifier for this context item. */
    id: string;

    /**
     * A short natural-language summary describing what this context is about.
     * Used by smaller / cheaper LLMs to determine if this item is relevant
     * to the user's current query.
     */
    description: string;

    /**
     * The actual contextual content that can be inserted into the LLM prompt
     * if deemed relevant by the model.
     */
    context: unknown;

    /** Whether this was added automatically by the component or by the user */
    origin: WidgetContextSourceOrigin;

    /** SHA-256 hash of the content, used to detect changes. */
    contentHash: string;

    /** ISO-8601 timestamp of when this context was last updated. */
    lastUpdated: string;

    /**
     * Optional expiration for the cached context.
     * - `0` means it is always considered "changed" (always re-included).
     * - If omitted, re-inclusion depends on hash changes.
     * - If set, after this duration (in ms), the context is considered stale
     *   and should be re-fetched or re-included even if the hash is unchanged.
     */
    maxAgeMs?: number;
}

/**
 * Here is a generic source of context that can be added to the conversation.
 */
export interface ContextSourceDef {
    /** A unique identifier for this context source. Must be unique system wide so be sure. Used for caching and tracking. */
    sourceId: string;

    /**
     * This is a description that will be given an LLM before the agent is invoked to determine if this context should be included in the prompt.
     * It will be given a list of all contexts that are available, the inquiry from the user and then asked which
     * contexts should be included in the prompt.
     */
    llmInclusionDescription: string;

    /** Whether this was added automatically by the component or by the user */
    origin: WidgetContextSourceOrigin;

    /** The name of the lucide icon to show the user to represent this context.  A default will be used if not provided. */
    lucideIconName?: string;

    /** The title of the context. This will be shown to the user as the name of this context. */
    title: string;

    /** The description of the context. This will be shown to the user as the description of this context. */
    description: string;

    /** The data to include in the context. This will be sent to the agent as the context. */
    data: unknown;

    /** Whether to add this context automatically when the component is added to the conversation. */
    addAutomatically?: boolean;

    /**
     * Optional expiration for the cached context.
     * - `0` means it is always considered "changed" (always re-included).
     * - If omitted, re-inclusion depends on hash changes.
     * - If set, after this duration (in ms), the context is considered stale
     *   and should be re-fetched or re-included even if the hash is unchanged.
     */
    maxAgeMs?: number;
}

export const WidgetContextSourceOrigins = ['user', 'auto'] as const;
export type WidgetContextSourceOrigin = (typeof WidgetContextSourceOrigins)[number];

/**
 * Components that have a getContext method will return a ContextSourceDef
 * object and then Pika will include the instanceId and store it as a
 * WidgetContextSourceDef so it knows the source of the context is
 * a widget.
 */
export interface WidgetContextSourceDef extends ContextSourceDef {
    type: 'widget';

    /** The web component instance ID that is adding the context. This is used to identify the instance of the component that is adding the context. */
    instanceId: string;
}

/** These are what get added to the converstaion state as context sources. */
export type ContextSource = WidgetContextSourceDef;

/**
 * Session Analytics Types
 * Used for the Session Analytics dashboard to show platform usage metrics, cost analytics, and at-a-glance KPIs.
 */

export interface SessionAnalyticsRequest {
    /** Date range for the analytics query (ISO 8601 formatted strings) */
    dateRange: {
        start: string;
        end: string;
    };
    /** Optional filter by specific entity ID */
    entityId?: string;
    /** Entity attribute name from siteFeatures, used for entity aggregations */
    entityAttributeName?: string;
    /** Optional filter by specific chat app IDs */
    chatAppIds?: string[];
    /** Optional filter by user types (internal-user, external-user) */
    userTypes?: UserType[];
    /** Optional filter by invocation modes. Defaults to undefined and 'chat-app' (user-initiated only) if not provided. */
    invocationModes?: (ConverseInvocationMode | 'undefined')[];
    /** Time grouping for time series data (day, week, month) */
    groupBy?: 'day' | 'week' | 'month';
    /** Limit for top entities/chat apps results */
    limit?: number;
}

/**
 * Cost distribution bucket with dynamic percentile-based boundaries
 * @since 0.16.0
 */
export interface CostDistributionBucket {
    /** Bucket key (e.g., 'p25-p50', 'p99+') */
    key: string;
    /** Bucket start value in USD */
    costRangeStart: number;
    /** Bucket end value in USD (null for p99+) */
    costRangeEnd: number | null;
    /** Number of sessions/turns in this bucket */
    count: number;
    /** Human-readable dollar label (e.g., '$0.18–$0.35') */
    label: string;
    /** Human-readable percentile label (e.g., 'P25–P50', 'Top 1%') */
    percentileLabel: string;
    /** Average input tokens within this bucket (turn distribution only) */
    avgInputTokens?: number;
    /** Average output tokens within this bucket (turn distribution only) */
    avgOutputTokens?: number;
    /** Model breakdown within this bucket (Phase 11.3) */
    modelBreakdown?: Array<{
        model: string;
        count: number;
    }>;
}

export interface SessionAnalyticsResponse {
    /** Whether the request was successful */
    success: boolean;
    /** Error message if success is false */
    error?: string;
    /** Summary metrics across the entire date range */
    summary: SessionAnalyticsSummary;
    /** Time series data points */
    timeSeries: SessionAnalyticsTimeSeriesPoint[];
    /** Top entities by usage (only populated if entityAttributeName was provided) */
    topEntities: SessionAnalyticsEntityUsage[];
    /** Top chat apps by usage */
    topChatApps: SessionAnalyticsChatAppUsage[];
    /** Cost breakdown by invocation mode */
    costByInvocationMode: SessionAnalyticsCostByMode[];
    /** Session-level cost distribution (dynamic percentile buckets) @since 0.16.0 */
    sessionCostDistribution?: CostDistributionBucket[];
    /** Turn-level cost distribution (dynamic percentile buckets) @since 0.16.0 */
    turnCostDistribution?: CostDistributionBucket[];
}

export interface SessionAnalyticsSummary {
    /** Total number of sessions */
    totalSessions: number;
    /** Number of unique users */
    uniqueUsers: number;
    /** Number of unique entities (only populated if entity feature enabled) */
    uniqueEntities?: number;
    /** Total number of messages across all sessions */
    totalMessages: number;
    /** Total input tokens consumed */
    totalInputTokens: number;
    /** Total output tokens generated */
    totalOutputTokens: number;
    /** Total input cost in USD */
    totalInputCost: number;
    /** Total output cost in USD */
    totalOutputCost: number;
    /** Total cost (input + output) in USD */
    totalCost: number;
    /** Average cost per session in USD */
    avgCostPerSession: number;
    /** Average tokens per session */
    avgTokensPerSession: number;

    // NEW: User Engagement Metrics
    /** Total user messages across all sessions */
    totalUserMessages: number;
    /** Total assistant responses across all sessions */
    totalAssistantMessages: number;
    /** Average user messages per session */
    avgUserMessagesPerSession: number;
    /** Average assistant messages per session */
    avgAssistantMessagesPerSession: number;

    // NEW: Cost/Token Per Response Metrics (assistant messages only)
    /** Average output tokens per assistant response */
    avgTokensPerResponse: number;
    /** Average input tokens per assistant response */
    avgInputTokensPerResponse: number;
    /** Average output tokens per assistant response */
    avgOutputTokensPerResponse: number;
    /** Average cost per assistant response in USD */
    avgCostPerResponse: number;
    /** Average execution duration per assistant response in milliseconds */
    avgExecutionDurationPerResponse: number;

    // NEW: Timing Analytics
    /** Timing analytics metrics */
    timingAnalytics?: {
        /** Average session duration in milliseconds */
        avgSessionDurationMs: number;
        /** Average time between message turns in milliseconds */
        avgTimeBetweenTurnsMs: number;
        /** Average response time (user to assistant) in milliseconds */
        avgResponseTimeMs: number;
        /** Average user think time (assistant to user) in milliseconds */
        avgUserThinkTimeMs: number;
        /** Sessions with long gaps */
        sessionsWithLongGaps: {
            /** Number of sessions with gaps over 1 hour */
            over1Hour: number;
            /** Number of sessions with gaps over 1 day */
            over1Day: number;
            /** Number of sessions with gaps over 1 week */
            over1Week: number;
        };
    };

    // NEW: Cost Percentiles (for distribution analysis)
    /** Session cost percentiles (8-bucket distribution) */
    sessionCostPercentiles?: {
        /** 10th percentile of session costs */
        p10: number;
        /** 25th percentile of session costs */
        p25: number;
        /** 50th percentile (median) of session costs */
        p50: number;
        /** 75th percentile of session costs */
        p75: number;
        /** 90th percentile of session costs */
        p90: number;
        /** 95th percentile of session costs */
        p95: number;
        /** 99th percentile of session costs */
        p99: number;
    };

    /** Turn (assistant message) cost percentiles */
    turnCostPercentiles?: {
        /** 10th percentile of turn costs */
        p10: number;
        /** 25th percentile of turn costs */
        p25: number;
        /** 50th percentile (median) of turn costs */
        p50: number;
        /** 75th percentile of turn costs */
        p75: number;
        /** 90th percentile of turn costs */
        p90: number;
        /** 95th percentile of turn costs */
        p95: number;
        /** 99th percentile of turn costs */
        p99: number;
    };

    /** Median cost per session (convenience field, same as sessionCostPercentiles.p50) */
    medianCostPerSession?: number;
    /** Median cost per turn (convenience field, same as turnCostPercentiles.p50) */
    medianCostPerTurn?: number;
}

export interface SessionAnalyticsTimeSeriesPoint {
    /** ISO 8601 formatted date for this data point */
    date: string;
    /** Number of sessions in this time period */
    sessionCount: number;
    /** Number of unique users in this time period */
    uniqueUserCount: number;
    /** Number of messages in this time period */
    messageCount: number;
    /** Input tokens consumed in this time period */
    inputTokens: number;
    /** Output tokens generated in this time period */
    outputTokens: number;
    /** Input cost in USD for this time period */
    inputCost: number;
    /** Output cost in USD for this time period */
    outputCost: number;
    /** Total cost in USD for this time period */
    totalCost: number;

    // NEW: Message breakdown
    /** Number of user messages in this time period */
    userMessageCount: number;
    /** Number of assistant messages in this time period */
    assistantMessageCount: number;
}

export interface SessionAnalyticsEntityUsage {
    /** Entity identifier */
    entityId: string;
    /** Entity name (human-readable) */
    entityName?: string;
    /** Number of sessions for this entity */
    sessionCount: number;
    /** Number of unique users for this entity */
    uniqueUserCount: number;
    /** Number of messages for this entity */
    messageCount: number;
    /** Total cost in USD for this entity */
    totalCost: number;
    /** Input tokens consumed for this entity */
    inputTokens: number;
    /** Output tokens generated for this entity */
    outputTokens: number;
}

export interface SessionAnalyticsChatAppUsage {
    /** Chat app identifier */
    chatAppId: string;
    /** Chat app name (human-readable) */
    chatAppName?: string;
    /** Number of sessions for this chat app */
    sessionCount: number;
    /** Number of unique users for this chat app */
    uniqueUserCount: number;
    /** Number of messages for this chat app */
    messageCount: number;
    /** Total cost in USD for this chat app */
    totalCost: number;
    /** Input tokens consumed for this chat app */
    inputTokens: number;
    /** Output tokens generated for this chat app */
    outputTokens: number;
}

export interface SessionAnalyticsCostByMode {
    /** Invocation mode (including 'undefined' for missing/undefined mode) */
    invocationMode: string;
    /** Number of sessions for this mode */
    sessionCount: number;
    /** Total cost in USD for this mode */
    totalCost: number;
    /** Input cost in USD for this mode */
    inputCost: number;
    /** Output cost in USD for this mode */
    outputCost: number;
    /** Input tokens consumed for this mode */
    inputTokens: number;
    /** Output tokens generated for this mode */
    outputTokens: number;
    /** Human-readable description of the mode */
    description: string;
}

/**
 * Configuration options for markdown-it renderer
 * @since 0.13.0
 */
export interface MarkdownRendererConfig {
    /**
     * Enable HTML tags in source
     * @default true
     */
    html?: boolean;
    /**
     * Autoconvert URL-like text to links
     * @default true
     */
    linkify?: boolean;
    /**
     * Enable some language-neutral replacement + quotes beautification
     * @default true
     */
    typographer?: boolean;
    /**
     * Convert '\n' in paragraphs into <br>
     * @default true
     */
    breaks?: boolean;
    /**
     * Custom syntax highlighting function for code blocks
     * @param str - The code string to highlight
     * @param lang - The language identifier
     * @returns HTML string with highlighted code
     */
    highlight?: (str: string, lang: string) => string;
    /**
     * Cache key identifier for the highlight function (required if highlight is provided).
     * This allows the factory to cache renderers with different highlight functions.
     * Use a unique string to identify your highlight function (e.g., 'hljs-default', 'prism-custom', etc.)
     */
    highlightCacheKey?: string;
}
