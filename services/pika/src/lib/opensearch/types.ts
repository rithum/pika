import { type ChatSession, type ChatSessionFeedback, type RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import { BadRequestError } from 'pika-shared/util/bad-request-error';
import { convertStringToSnakeCase, convertToCamelCase, convertToSnakeCase, type SnakeCase } from 'pika-shared/util/chatbot-shared-utils';
import { Types, API } from '@opensearch-project/opensearch';
import { convertChatSessionToCamelFromSnakeCase, convertChatSessionToSnakeFromCamelCase } from '../utils';

export type OpenSearchIndexable = ChatSession<RecordOrUndef>;
export type OpenSearchIngestType = ChatSessionOs<RecordOrUndef>;

export const SessionIndex = 'session';

/** A list of all the opensearch indices of the app */
export const DomainIndices = [SessionIndex] as const;

/** The OpenSearch domain index type of the app */
export type DomainIndex = (typeof DomainIndices)[number];

export interface OpenSearchIndexableMap {
    session: ChatSession<RecordOrUndef>;
}
export interface OpenSearchIngestMap {
    session: ChatSessionOs<RecordOrUndef>;
}
export interface OpenSearchIndexableIdMap {
    session: 'sessionId';
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
            source: { type: 'keyword' },

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
            }
        }
    }
};

/**
 * Note that we carefully preserve the original case of the custom data fields which have been spread
 * into the sessionAttributes object.  This is important because we need to be able to search on them
 * later.
 */
export interface ChatSessionOs<T extends RecordOrUndef = undefined> extends SnakeCase<ChatSession<T>> {
    last_index_date: string;
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
                last_index_date: new Date().toISOString()
            } as ChatSessionOs<any>;
        },
        convertFromOsToBaseType: (obj: ChatSessionOs<any>) => {
            return convertChatSessionToCamelFromSnakeCase(obj);
        }
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
    if ('sessionId' in obj) {
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
