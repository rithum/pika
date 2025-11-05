import { type ChatSession, type ChatSessionFeedback, type ChatMessage, type RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import { BadRequestError } from 'pika-shared/util/bad-request-error';
import { convertStringToSnakeCase, convertToCamelCase, convertToSnakeCase, type SnakeCase } from 'pika-shared/util/chatbot-shared-utils';
import { Types, API } from '@opensearch-project/opensearch';
import { convertChatSessionToCamelFromSnakeCase, convertChatSessionToSnakeFromCamelCase } from '../utils';
import { gzipSync } from 'zlib';

export type OpenSearchIndexable = ChatSession<RecordOrUndef> | ChatMessage;
export type OpenSearchIngestType = ChatSessionOs<RecordOrUndef> | ChatMessageOs;

export const SessionIndex = 'session';
export const MessageIndex = 'message';

/** A list of all the opensearch indices of the app */
export const DomainIndices = [SessionIndex, MessageIndex] as const;

/** The OpenSearch domain index type of the app */
export type DomainIndex = (typeof DomainIndices)[number];

export interface OpenSearchIndexableMap {
    session: ChatSession<RecordOrUndef>;
    message: ChatMessage;
}
export interface OpenSearchIngestMap {
    session: ChatSessionOs<RecordOrUndef>;
    message: ChatMessageOs;
}
export interface OpenSearchIndexableIdMap {
    session: 'sessionId';
    message: 'messageId';
}
export type OpenSearchIndexableKey = keyof OpenSearchIndexableMap;

/** Typescript voodoo to create a type that is just the ID attributes from the objects we care about */
export type IdField<T extends OpenSearchIndexableKey> = OpenSearchIndexableIdMap[T];

/**
 * A function that converts an object to the type that will be indexed into OpenSearch.
 */
export type ConvertToOsTypeFn<T extends OpenSearchIndexable> = (obj: T) => OpenSearchIngestType;

/**
 * A function that converts an object from an opensearch to a base type without the extra os attrs.
 */
export type ConvertFromOsToBaseTypeFn<T extends OpenSearchIndexable> = (obj: T) => OpenSearchIndexable;

export interface OpenSearchIndexMetadata<T extends DomainIndex = DomainIndex> {
    name: DomainIndex;
    indexCreateBody: Record<string, unknown>;
    idAttr: IdField<T>;
    defaultSort?: 'asc' | 'desc';
    maxResults?: number;

    // This will be called just before objects are indexed into OS
    convertToOsType: (obj: OpenSearchIndexableMap[T]) => OpenSearchIngestMap[T];

    // This will be called just before returning objects from OS
    convertFromOsToBaseType: (obj: OpenSearchIngestMap[T]) => OpenSearchIndexableMap[T];
}

export const chatSessionOpenSearchMappings = {
    mappings: {
        dynamic_templates: [
            {
                // Handle all unknown fields under session_attributes as keywords for exact matching
                session_attributes_dynamic: {
                    path_match: 'session_attributes.*',
                    match_mapping_type: 'string',
                    mapping: {
                        type: 'keyword',
                        ignore_above: 512
                    }
                }
            }
        ],
        properties: {
            session_id: { type: 'keyword' },
            user_id: { type: 'keyword' },
            agent_alias_id: { type: 'keyword' },
            agent_id: { type: 'keyword' },
            chat_app_id: { type: 'keyword' },
            identity_id: { type: 'keyword' },
            title: { type: 'text' },
            last_message_id: { type: 'keyword' },
            test_type: { type: 'keyword' },
            source_keyword: { type: 'keyword' },
            user_type_keyword: { type: 'keyword' },
            invocation_mode_keyword: { type: 'keyword' },

            // Cost and token fields
            input_cost: { type: 'double' },
            input_tokens: { type: 'long' },
            output_cost: { type: 'double' },
            output_tokens: { type: 'long' },
            total_cost: { type: 'double' },

            // Dates
            create_date: { type: 'date' },
            last_update: { type: 'date' },

            // Analysis fields
            last_analyzed_message_id: { type: 'keyword' },
            flagged: { type: 'boolean' },
            feedback: {
                type: 'nested',
                properties: {
                    feedback_id: { type: 'keyword' },
                    user_id: { type: 'keyword' },
                    message_id: { type: 'keyword' },
                    reported_by_human: { type: 'boolean' },
                    created_by_customer: { type: 'boolean' },
                    status: { type: 'keyword' },
                    severity: { type: 'keyword' },
                    type: { type: 'keyword' },
                    user_comment: { type: 'text' },
                    attachments: {
                        type: 'nested',
                        properties: {
                            s3_url: { type: 'keyword' },
                            name: { type: 'keyword' },
                            mime_type: { type: 'keyword' }
                        }
                    },
                    internal_comments: {
                        type: 'nested',
                        properties: {
                            user_id: { type: 'keyword' },
                            comment: { type: 'text' },
                            created_on: { type: 'date' },
                            type: { type: 'keyword' },
                            status: { type: 'keyword' },
                            attachments: {
                                type: 'nested',
                                properties: {
                                    s3_url: { type: 'keyword' },
                                    name: { type: 'keyword' },
                                    mime_type: { type: 'keyword' }
                                }
                            }
                        }
                    },
                    created_on: { type: 'date' },
                    updated_on: { type: 'date' }
                }
            },
            exp_date_unix_seconds: { type: 'long' },

            // Session attributes - define known static fields, dynamic ones handled by template
            session_attributes: {
                properties: {
                    // Known static fields from SessionAttributes interface
                    first_name: { type: 'keyword' },
                    last_name: { type: 'keyword' },
                    timezone: { type: 'keyword' },
                    token: { type: 'keyword' },
                    user_id: { type: 'keyword' },
                    chat_app_id: { type: 'keyword' },
                    agent_id: { type: 'keyword' },
                    current_date: { type: 'date' }
                    // Dynamic custom data fields will be handled by the dynamic template above
                }
            },

            insights: {
                properties: {
                    model: { type: 'keyword' },
                    version: { type: 'keyword' },
                    detail_markdown: { type: 'text', index: false }, // Don't index large markdown

                    usage: {
                        properties: {
                            input_tokens: { type: 'long' },
                            cache_creation_input_tokens: { type: 'long' },
                            cache_read_input_tokens: { type: 'long' },
                            output_tokens: { type: 'long' }
                        }
                    },

                    scoring: {
                        properties: {
                            scores: {
                                properties: {
                                    goal_achievement: {
                                        properties: {
                                            score: { type: 'float' },
                                            description: { type: 'text', index: false }
                                        }
                                    },
                                    user_satisfaction: {
                                        properties: {
                                            score: { type: 'float' },
                                            description: { type: 'text', index: false }
                                        }
                                    },
                                    ai_performance: {
                                        properties: {
                                            accuracy: {
                                                properties: {
                                                    score: { type: 'float' },
                                                    description: { type: 'text', index: false }
                                                }
                                            },
                                            helpfulness: {
                                                properties: {
                                                    score: { type: 'float' },
                                                    description: { type: 'text', index: false }
                                                }
                                            },
                                            communication: {
                                                properties: {
                                                    score: { type: 'float' },
                                                    description: { type: 'text', index: false }
                                                }
                                            },
                                            efficiency: {
                                                properties: {
                                                    score: { type: 'float' },
                                                    description: { type: 'text', index: false }
                                                }
                                            },
                                            overall: {
                                                properties: {
                                                    score: { type: 'float' },
                                                    description: { type: 'text', index: false }
                                                }
                                            }
                                        }
                                    },
                                    interaction_quality: {
                                        properties: {
                                            score: { type: 'float' },
                                            description: { type: 'text', index: false }
                                        }
                                    }
                                }
                            },
                            assessments: {
                                properties: {
                                    user_sentiment: { type: 'keyword' },
                                    goal_completion_status: { type: 'keyword' },
                                    satisfaction_level: { type: 'keyword' },
                                    requires_followup: { type: 'boolean' },
                                    critical_issues_present: { type: 'boolean' },
                                    escalation_needed: { type: 'boolean' }
                                }
                            },
                            metrics: {
                                properties: {
                                    session_duration_estimate: { type: 'keyword' },
                                    complexity_level: { type: 'keyword' },
                                    user_effort_required: { type: 'keyword' },
                                    ai_confidence_level: { type: 'keyword' }
                                }
                            }
                        }
                    }
                }
            },

            // Add this for tracking when indexed
            last_index_date: { type: 'date' },

            // Sharing-related fields
            share_id: { type: 'keyword' },
            share_created_by_user_id: { type: 'keyword' },
            share_date: { type: 'date' },
            share_revoked_date: { type: 'date' },

            // Context tracking - map as an object with dynamic sourceId keys
            sent_contexts: {
                type: 'object',
                enabled: true,
                properties: {
                    // Each sourceId key will have these properties
                    // Note: OpenSearch will automatically create mappings for each sourceId key
                    // We define the structure that each nested object should have
                }
            },

            // Message replication fields
            messages_summary: {
                type: 'nested',
                properties: {
                    message_id: { type: 'keyword' },
                    timestamp: { type: 'date' },
                    source: { type: 'keyword' },
                    model: { type: 'keyword' },
                    input_tokens: { type: 'long' },
                    output_tokens: { type: 'long' },
                    input_cost: { type: 'double' },
                    output_cost: { type: 'double' },
                    total_cost: { type: 'double' },
                    execution_duration: { type: 'long' }
                }
            },

            messages_analysis: {
                properties: {
                    timing_stats: {
                        properties: {
                            total_messages: { type: 'long' },
                            total_user_messages: { type: 'long' },
                            total_assistant_messages: { type: 'long' },
                            conversation_duration_ms: { type: 'long' },
                            first_message_timestamp: { type: 'date' },
                            last_message_timestamp: { type: 'date' },
                            avg_gap_ms: { type: 'double' },
                            total_gap_time_ms: { type: 'long' },
                            total_gap_count: { type: 'long' },
                            avg_response_time_ms: { type: 'double' },
                            response_time_total_ms: { type: 'long' },
                            response_time_count: { type: 'long' },
                            avg_think_time_ms: { type: 'double' },
                            think_time_total_ms: { type: 'long' },
                            think_time_count: { type: 'long' },
                            gaps_over_1h: { type: 'long' },
                            gaps_over_1d: { type: 'long' },
                            gaps_over_1w: { type: 'long' }
                        }
                    },
                    last_message: {
                        properties: {
                            timestamp: { type: 'date' },
                            source: { type: 'keyword' },
                            message_id: { type: 'keyword' }
                        }
                    },
                    last_updated: { type: 'date' }
                }
            }
        }
    }
};

/**
 * ChatMessage document for OpenSearch message index.
 * Snake case version of ChatMessage with OS-specific fields.
 */
export interface ChatMessageOs {
    message_id: string;
    session_id: string;
    user_id: string;
    source: 'user' | 'assistant';
    timestamp: string;
    message: string;
    llm_instructions?: string;
    model?: string;
    input_tokens?: number;
    output_tokens?: number;
    input_cost?: number;
    output_cost?: number;
    total_cost?: number;
    execution_duration?: number;
    invocation_mode?: string;
    user_type?: string; // For filtering by internal vs external users
    traces_str_gzipped?: string; // Stored but NOT indexed
    last_index_date: string; // When indexed to OS
}

/**
 * Message index mappings
 */
export const chatMessageOpenSearchMappings = {
    mappings: {
        properties: {
            message_id: { type: 'keyword' },
            session_id: { type: 'keyword' },
            user_id: { type: 'keyword' },
            source: { type: 'keyword' },
            timestamp: { type: 'date' },

            // Searchable text fields
            message: {
                type: 'text',
                fields: {
                    keyword: { type: 'keyword', ignore_above: 512 }
                }
            },
            llm_instructions: { type: 'text' },

            // Model: dual purpose (search + aggregation)
            model: {
                type: 'text',
                fields: {
                    keyword: { type: 'keyword' }
                }
            },

            // Usage metrics
            input_tokens: { type: 'long' },
            output_tokens: { type: 'long' },
            input_cost: { type: 'double' },
            output_cost: { type: 'double' },
            total_cost: { type: 'double' },
            execution_duration: { type: 'long' },

            // Filtering
            invocation_mode: { type: 'keyword' },
            user_type: { type: 'keyword' },

            // CRITICAL: Stored but NOT indexed (saves space, not searchable)
            traces_str_gzipped: { type: 'object', enabled: false },

            // Tracking
            last_index_date: { type: 'date' }
        }
    }
};

/**
 * Minimal message metadata for messages_summary nested array
 */
export interface MessageSummaryEntry {
    message_id: string;
    timestamp: string;
    source: 'user' | 'assistant';
    // Only populated for assistant messages
    model?: string;
    input_tokens?: number;
    output_tokens?: number;
    input_cost?: number;
    output_cost?: number;
    total_cost?: number;
    execution_duration?: number;
}

/**
 * Pre-computed timing statistics for messages_analysis
 */
export interface MessagesAnalysis {
    timing_stats: {
        // Counts
        total_messages: number;
        total_user_messages: number;
        total_assistant_messages: number;

        // Duration
        conversation_duration_ms: number;
        first_message_timestamp: string;
        last_message_timestamp: string;

        // Gaps (averages + totals)
        avg_gap_ms: number;
        total_gap_time_ms: number;
        total_gap_count: number;

        // Response times
        avg_response_time_ms: number;
        response_time_total_ms: number;
        response_time_count: number;

        // Think times
        avg_think_time_ms: number;
        think_time_total_ms: number;
        think_time_count: number;

        // Long gap counters
        gaps_over_1h: number;
        gaps_over_1d: number;
        gaps_over_1w: number;
    };

    last_message: {
        timestamp: string;
        source: 'user' | 'assistant';
        message_id: string;
    } | null;

    last_updated: string;
}

/**
 * Note that we carefully preserve the original case of the custom data fields which have been spread
 * into the sessionAttributes object.  This is important because we need to be able to search on them
 * later.
 */
export interface ChatSessionOs<T extends RecordOrUndef = undefined> extends SnakeCase<ChatSession<T>> {
    last_index_date: string;
    // NEW: Message replication fields
    messages_summary?: MessageSummaryEntry[];
    messages_analysis?: MessagesAnalysis;
}

/**
 * Convert ChatMessage to snake_case for OpenSearch
 */
export function convertChatMessageToSnakeFromCamelCase(message: ChatMessage): ChatMessageOs {
    // Convert traces to gzipped/hex-encoded string if present
    let tracesStrGzipped: string | undefined;
    if (message.traces && message.traces.length > 0) {
        const tracesStr = JSON.stringify(message.traces);
        // 1. gzip the string
        // 2. convert to hex
        // 3. convert hex to base64
        const gzipped = gzipSync(Buffer.from(tracesStr));
        const hex = gzipped.toString('hex');
        tracesStrGzipped = Buffer.from(hex, 'utf-8').toString('base64');
    }

    return {
        message_id: message.messageId,
        session_id: message.sessionId,
        user_id: message.userId,
        source: message.source,
        timestamp: message.timestamp,
        message: message.message,
        llm_instructions: message.llmInstructions,
        model: message.model,
        input_tokens: message.usage?.inputTokens,
        output_tokens: message.usage?.outputTokens,
        input_cost: message.usage?.inputCost,
        output_cost: message.usage?.outputCost,
        total_cost: message.usage?.totalCost,
        execution_duration: message.executionDuration,
        invocation_mode: message.invocationMode,
        user_type: message.userType,
        traces_str_gzipped: tracesStrGzipped,
        last_index_date: new Date().toISOString()
    };
}

/**
 * Convert ChatMessageOs from snake_case back to camelCase
 */
export function convertChatMessageToCamelFromSnakeCase(messageOs: ChatMessageOs): ChatMessage {
    // Handle both flat structure (OpenSearch) and nested usage object (DynamoDB)
    // DynamoDB stores: { usage: { input_tokens: 123 } }
    // OpenSearch stores: { input_tokens: 123 } (flat)
    const usageFromNested = (messageOs as any).usage; // DynamoDB format

    // Check for usage data in either format
    const hasUsage =
        messageOs.input_tokens !== undefined ||
        messageOs.output_tokens !== undefined ||
        messageOs.input_cost !== undefined ||
        messageOs.output_cost !== undefined ||
        messageOs.total_cost !== undefined ||
        (usageFromNested && (usageFromNested.input_tokens !== undefined || usageFromNested.output_tokens !== undefined));

    // Extract usage fields from whichever format is present
    const inputTokens = messageOs.input_tokens ?? usageFromNested?.input_tokens;
    const outputTokens = messageOs.output_tokens ?? usageFromNested?.output_tokens;
    const inputCost = messageOs.input_cost ?? usageFromNested?.input_cost;
    const outputCost = messageOs.output_cost ?? usageFromNested?.output_cost;
    const totalCost = messageOs.total_cost ?? usageFromNested?.total_cost;

    return {
        messageId: messageOs.message_id,
        sessionId: messageOs.session_id,
        userId: messageOs.user_id,
        source: messageOs.source,
        timestamp: messageOs.timestamp,
        message: messageOs.message,
        llmInstructions: messageOs.llm_instructions,
        model: messageOs.model,
        usage: hasUsage
            ? {
                  inputTokens: inputTokens!,
                  outputTokens: outputTokens!,
                  inputCost: inputCost!,
                  outputCost: outputCost!,
                  totalCost: totalCost!
              }
            : undefined,
        executionDuration: messageOs.execution_duration,
        invocationMode: messageOs.invocation_mode as ChatMessage['invocationMode'],
        userType: messageOs.user_type as ChatMessage['userType'],
        tracesStrGzipped: messageOs.traces_str_gzipped
        // Note: traces array is NOT reconstructed (would be expensive)
    };
}

// Main metadata object following the original pattern
export const osIndexMeta: { [K in DomainIndex]: OpenSearchIndexMetadata<K> } = {
    session: {
        name: SessionIndex,
        indexCreateBody: chatSessionOpenSearchMappings,
        idAttr: 'sessionId' as const,
        convertToOsType: (obj: ChatSession<any>) => {
            const converted = convertChatSessionToSnakeFromCamelCase(obj);
            return {
                ...converted,
                last_index_date: new Date().toISOString(),
                // Copy fields to keyword variants for aggregations
                invocation_mode_keyword: converted.invocation_mode,
                user_type_keyword: converted.user_type,
                source_keyword: converted.source
            } as ChatSessionOs<any>;
        },
        convertFromOsToBaseType: (obj: ChatSessionOs<any>) => {
            // Strip out internal keyword fields used only for aggregations
            const { invocation_mode_keyword, user_type_keyword, source_keyword, ...osDataWithoutKeywordFields } = obj as any;
            return convertChatSessionToCamelFromSnakeCase(osDataWithoutKeywordFields);
        }
    },
    message: {
        name: MessageIndex,
        indexCreateBody: chatMessageOpenSearchMappings,
        idAttr: 'messageId' as const,
        convertToOsType: (obj: ChatMessage) => convertChatMessageToSnakeFromCamelCase(obj),
        convertFromOsToBaseType: (obj: ChatMessageOs) => convertChatMessageToCamelFromSnakeCase(obj)
    }
};

// Helper function to get index metadata (following original pattern)
export function getIndexMeta<T extends DomainIndex>(indexName: T): OpenSearchIndexMetadata<T> {
    return osIndexMeta[indexName];
}

/**
 * Indicates a delete to OS.
 */
export interface DeleteOp {
    op: 'delete';
    id: string;
    index: DomainIndex;
}

/**
 * Indicates a partial update to OS (preserves existing fields not specified).
 */
export interface PartialUpdateOp {
    op: 'partialUpdate';
    id: string;
    index: DomainIndex;
    /**
     * When performing a partial update with a document payload, specify fields to merge into the existing _source.
     */
    doc?: Partial<OpenSearchIngestType>;
    /**
     * When performing a partial update using a script, provide the painless script and parameters.
     */
    script?: {
        source: string;
        params?: Record<string, unknown>;
    };
}

export function isDeleteObj(obj: OsWork): obj is DeleteOp {
    return 'op' in obj && obj.op === 'delete';
}

export function isPartialUpdateObj(obj: OsWork): obj is PartialUpdateOp {
    return 'op' in obj && obj.op === 'partialUpdate';
}

/**
 * @param val
 * @returns
 */
export function isDomainIndex(val: unknown): val is DomainIndex {
    return !!val && DomainIndices.includes(val as DomainIndex);
}

export function getDomainIndex(obj: OpenSearchIngestType | OpenSearchIndexable): DomainIndex {
    if ('sessionId' in obj && 'messageId' in obj) {
        return 'message'; // Has both sessionId and messageId = message
    } else if ('sessionId' in obj) {
        return 'session';
    } else {
        throw new BadRequestError(`Unknown ingest type: ${JSON.stringify(obj)}`);
    }
}

export type OsWork = OpenSearchIndexable | DeleteOp | PartialUpdateOp;

/**
 * The stupid OpenSearch types built in are either so permissive as to be useless or require things
 * that aren't required.  Sure makes you wonder about typescript sometimes.  Ugh.  The following
 * three types are to work around it.
 */
export type BulkOpType = Partial<Types.Core_Bulk.OperationBase> & Pick<Types.Core_Bulk.OperationBase, '_id' | '_index'>;
export interface BulkOpContainer {
    index?: BulkOpType;
    create?: BulkOpType;
    update?: BulkOpType;
    delete?: BulkOpType;
}
export type BulkType = BulkOpContainer | OpenSearchIngestType;

/** convenience type */
export type BulkResp = API.Bulk_Response;

/** convenience type */
export type MSearchResp = API.Msearch_Response;

export class OsError extends Error {
    context?: string;
    notFound?: boolean;
    constructor(message: string, notFound?: boolean) {
        super(message);
        this.notFound = notFound;
    }
}

/**
 * We couldn't parse the scroll ID.
 */
export class MalformedScrollIdException extends Error {
    constructor(message: string) {
        super(message);
    }
}

/** Convenience type for opensearch API calls for querying */
export type OSSearchResult<T> = API.Search_Response;

export interface OsQuery {
    track_total_hits?: boolean;
    query: OsBoolQuery;
    sort?: OsSort[];
    search_after?: unknown[];
    size?: number;
}

/**
 * Used for doing a query to get a count of objects.
 */
export interface OsCountQuery {
    query: OsBoolQuery;
    size: 0;
    track_total_hits: true;
}

export interface OsBoolQuery {
    bool: OsFilterQuery;
}

export interface OsFilterQuery {
    must?: { match: { [key: string]: string } } | { simple_query_string: { [key: string]: any } }[];
    filter: OsFilterTermQuery | OsFilterTermQuery[] | OsFilterTermsQuery | OsFilterTermsQuery[] | OsFilterTermOrTermsQuery[];
}

export interface OsShouldQuery {
    should: OsFilterTermQuery | OsFilterTermQuery[] | OsFilterTermsQuery | OsFilterTermsQuery[] | OsFilterTermOrTermsQuery[];
}

export interface OsFilterTermQuery {
    term: { [key: string]: unknown };
}

export type OsFilterTermOrTermsQuery = OsFilterTermQuery | OsFilterTermsQuery | OsBoolQuery | OsShouldQuery;

export interface OsFilterTermsQuery {
    terms: { [key: string]: unknown };
}

export interface OsSort {
    [key: string]: 'asc' | 'desc';
}

export interface ConversationIdAndInternalId {
    id: string;
    internal_id: string;
}

export class GeneralError extends Error {
    constructor(message: string) {
        super(message);
    }
}
