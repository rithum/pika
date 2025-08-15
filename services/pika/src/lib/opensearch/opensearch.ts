import { Client, Types } from '@opensearch-project/opensearch';

import type { ChatSession, ChatSessionFeedback, RecordOrUndef, ScoreSearchParams, SessionSearchRequest, SessionSearchResponse } from 'pika-shared/types/chatbot/chatbot-types';
import { convertToSnakeCase } from 'pika-shared/util/chatbot-shared-utils';
import { convertChatSessionToCamelFromSnakeCase, getEnv, isDevLikeEnv } from '../utils';
import OsClient from './opensearch-client';
import { buildScrollIdFromQueryAndLastHitSort, getNextPageQueryFromScrollId, handleOsError } from './opensearch-utils';
import {
    type BulkResp,
    type BulkType,
    type ChatSessionOs,
    type DeleteOp,
    type DomainIndex,
    GeneralError,
    type OpenSearchIndexable,
    type OpenSearchIndexableMap,
    type OpenSearchIngestMap,
    OsError,
    type OsFilterTermOrTermsQuery,
    type OsQuery,
    type OsWork,
    type PartialUpdateOp,
    getDomainIndex,
    isDeleteObj,
    isPartialUpdateObj,
    osIndexMeta
} from './types';

/** Limit the number of results we get back from opensearch */
const MAX_RESULTS = 500;

/** Microbatch requests no larger than this */
const MICRO_BATCH_SIZE = 500;

/** Limit the number of results we get back from opensearch when doing a term search */
const MAX_TERM_SEARCH_RESULTS = 100;

/** Batch size for mget existence checks */
const MGET_BATCH_SIZE = 500;

export function getDeleteOp(obj: OpenSearchIndexable): DeleteOp {
    const index = getDomainIndex(obj);
    return {
        op: 'delete',
        id: osIndexMeta[index].idAttr,
        index
    };
}

export function spliceIntoChunks<T>(arr: T[], chunkSize: number): T[][] {
    const res = [];
    while (arr.length > 0) {
        const chunk = arr.splice(0, chunkSize);
        res.push(chunk);
    }
    return res;
}

/**
 * If exception or non-200 status code response, try re-creating the open search client (it goes bad after
 * some hours).  If it fails again (exception or non-200 status code) throw exception out.
 *
 * @param fn The function to call
 * @param cmdName A pretty name of what you are doing for logging
 * @param errMsg An error message to put in exception if status code isn't in 200's
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
//export async function execOpenSearchCmd<type extends ApiResponse<Record<string, any>, unknown>>(
export async function execOpenSearchCmd<type extends { statusCode?: number | null; body?: any }>(
    cmdName: string,
    errMsg: string,
    fn: (client: Client) => Promise<type>
): Promise<type> {
    let result: type;
    let firstTry = true;

    /*
        Try to execute the open search command.  If it fails for any reason, try to do it a second time.
        If it still fails let the response/error get returned/bubble out.  The reason to do this
        is that the open search client seems to go bad after some hours and we need to 
        re-create it.  The error we see is this:
        Invalid Host Header Request
    */
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            try {
                result = await fn(await OsClient.getClient());
            } catch (ex) {
                console.error(
                    `execOpenSearchCmd-${cmdName} exception when calling fn provided that does the actual opensearch queery: ${ex} ${
                        ex instanceof Error ? `${ex.message} ${ex.stack}` : ''
                    }`
                );
                throw ex;
            }

            if (result.statusCode && (result.statusCode < 200 || result.statusCode > 299)) {
                if (firstTry) {
                    console.debug(
                        `OpenSearch client call status code not in the 200's when doing ${cmdName}.  Re-creating client connection. ` +
                            `Status code: ${result.statusCode} ${JSON.stringify(result, null, 4)}`
                    );

                    // Try to re-create the open search client because it goes bad sometimes
                    firstTry = false;
                    await OsClient.getClient(true);
                } else {
                    // We've already tried re-creating the client, error out
                    console.error(`${errMsg} Cause: OpenSearch client call status code not in the 200's when doing ${cmdName}. ${result.statusCode}`);
                    throw new GeneralError(`${errMsg} Cause: OpenSearch client call status code not in the 200's when doing ${cmdName}.`);
                }
            } else {
                // We're good, return the results
                break;
            }
        } catch (ex) {
            if (firstTry) {
                console.debug(
                    `OpenSearch client call failed when doing ${cmdName}.  Re-creating client connection.  Error: ${ex} ${ex instanceof Error ? `${ex.message} ${ex.stack}` : ''}`
                );
                firstTry = false;

                // Try to re-create the open search client because it goes bad sometimes.
                try {
                    await OsClient.getClient(true);
                } catch (ex2) {
                    console.error(
                        `Failed to re-init open search client, re-init was attempted since got some random ex and sometimes that means need re-init: ${ex2} ${
                            ex instanceof Error ? `${ex.message} ${ex.stack}` : ''
                        }`
                    );
                    throw new GeneralError(
                        `Failed to re-init open search client, re-init was attempted since got some random ex and sometimes that means need re-init: ${ex2} ${
                            ex2 instanceof Error ? `${ex2.message} ${ex2.stack}` : ''
                        }`
                    );
                }
            } else {
                // Already tried re-creating the client, bust out
                console.error(
                    `execOpenSearchCmd#12-${cmdName} - giving up after second atempt with the hope that re-initializing open search client fixes error, giving up: ${ex} ${
                        ex instanceof Error ? `${ex.message} ${ex.stack}` : ''
                    }`
                );
                throw ex;
            }
        }
    }

    return result;
}

/**
 * Always do updates/inserts/deletes in micro batches to get economies of scale writing to
 * opensearch.  This breaks the work into bite-sized microbatches and then executes each
 * batch as a single operation against opensearch.
 *
 * @param work
 * @returns
 */
export async function doMicroBatchWork(work: OsWork[]): Promise<void> {
    console.debug(`Microbatching work to opensearch: ${work.length}`);
    if (work.length === 0) {
        return;
    } else {
        /* keep going, have work to do */
    }

    const arrChunks = spliceIntoChunks<OsWork>(work, MICRO_BATCH_SIZE);
    for (const arr of arrChunks) {
        await bulkOperation(arr, 'index and/or delete');
    }
}

/**
 * Efficiently determine which documents exist in OpenSearch for a given index and set of ids.
 * Returns a Set of ids that currently exist.
 */
export async function getExistingDocumentsByIds(index: DomainIndex, ids: string[]): Promise<Set<string>> {
    const existingIds = new Set<string>();

    if (!ids || ids.length === 0) {
        return existingIds;
    }

    const indexName = osIndexMeta[index].name;
    const chunks = spliceIntoChunks([...ids], MGET_BATCH_SIZE);

    for (const chunk of chunks) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resp = await execOpenSearchCmd<any>('mget', `Failed mget for index ${indexName}`, async (client: Client) => {
            // The OpenSearch client expects ids in the body for mget when specifying a single index
            // https://opensearch.org/docs/latest/api-reference/document-apis/multi-get/
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
            return (await client.mget({ index: indexName, body: { ids: chunk }, _source: false } as any)) as any;
        });

        const docs = resp?.body?.docs ?? [];
        for (const doc of docs) {
            if (doc && (doc.found === true || doc.found === 'true')) {
                existingIds.add(String(doc._id));
            }
        }
    }

    return existingIds;
}

/**
 * Retrieve documents by their IDs for a given domain index. Returns a map keyed by the document id
 * (the OpenSearch _id, which for our indices is the domain id such as sessionId) to the base type
 * object (converted from the OpenSearch ingest shape).
 */
export async function getDocumentsByIds<T extends DomainIndex>(index: T, ids: string[]): Promise<Record<string, OpenSearchIndexableMap[T]>> {
    const results: Record<string, OpenSearchIndexableMap[T]> = Object.create(null);

    if (!ids || ids.length === 0) {
        return results;
    }

    const indexName = osIndexMeta[index].name;
    const chunks = spliceIntoChunks([...ids], MGET_BATCH_SIZE);

    for (const chunk of chunks) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resp = await execOpenSearchCmd<any>('mget', `Failed mget for index ${indexName}`, async (client: Client) => {
            // The OpenSearch client expects ids in the body for mget when specifying a single index
            // https://opensearch.org/docs/latest/api-reference/document-apis/multi-get/
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
            return (await client.mget({ index: indexName, body: { ids: chunk }, _source: true } as any)) as any;
        });

        const docs = resp?.body?.docs ?? [];
        for (const doc of docs) {
            if (doc && (doc.found === true || doc.found === 'true')) {
                const id = String(doc._id);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const source = doc._source as OpenSearchIngestMap[T];
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const converted: OpenSearchIndexableMap[T] = osIndexMeta[index].convertFromOsToBaseType(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    source as any
                ) as OpenSearchIndexableMap[T];
                results[id] = converted;
            }
        }
    }

    return results;
}

/**
 * Don't call this directly.  Call doMicroBatchWork instead.
 * The execOpenSearchCmd wrapper function helps us deal with times when the opensearch client seems
 * to go stale after extended periods.
 *
 * @param arr
 * @param errMsg
 * @returns
 */
async function bulkOperation(arr: OsWork[], errMsg: string) {
    if (!arr || arr.length === 0) {
        return;
    }

    const resp = await execOpenSearchCmd(`bulkOperation`, `Failed bulkOperation: ${errMsg}`, async (client: Client): Promise<BulkResp> => {
        const result: BulkResp = await client.bulk({
            refresh: true,
            body: arr.flatMap((obj): (BulkType | { doc: any; doc_as_upsert?: boolean } | { script: any; scripted_upsert?: boolean })[] => {
                if (isDeleteObj(obj)) {
                    return [{ delete: { _index: obj.index, _id: obj.id } }];
                } else if (isPartialUpdateObj(obj)) {
                    if (obj.script) {
                        return [{ update: { _index: obj.index, _id: obj.id } }, { script: obj.script, scripted_upsert: false }];
                    }
                    return [{ update: { _index: obj.index, _id: obj.id } }, { doc: obj.doc ?? {}, doc_as_upsert: false }];
                } else {
                    const index = getDomainIndex(obj);
                    // As any is fine because we just extracted the correct type from the object
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
                    const convertedObj = osIndexMeta[index].convertToOsType(obj as any);
                    const id = obj[osIndexMeta[index].idAttr as keyof typeof obj];
                    return [{ index: { _index: index, _id: String(id) } }, convertedObj];
                }
            })
        });
        return result;
    });

    if (resp.body.errors) {
        const erroredItems = resp.body.items.reduce((errArr: Types.Core_Bulk.ResponseItem[], item: any) => {
            if (item.index?.error) {
                errArr.push(item.index);
            }
            if (item.update?.error) {
                errArr.push(item.update);
            }
            return errArr;
        }, [] as Types.Core_Bulk.ResponseItem[]);

        console.error(`Failed in bulkOperation when doing opensearch bulk operation: ${JSON.stringify(erroredItems, null, 4)}}`);
        throw new OsError(`Failed bulk opensearch operation: ${JSON.stringify(erroredItems, null, 4)}}`);
    } else {
        /* we're good */
    }
}

/**
 * This should never be used in production or staging.  If it is, it will throw an error.
 * @param indexName The index to delete
 */
export async function deleteIndex(indexName: string) {
    if (!isDevLikeEnv()) {
        throw new GeneralError(`Cannot delete index in non dev/test environment ${getEnv()}`);
    } else {
        // OK, we're going to delete an OpenSearch index, you better know what you are doing
        const client = await OsClient.getClient();
        try {
            await client.indices.delete({ index: indexName });
        } catch (ex) {
            const err = handleOsError(ex, 'deleteIndex:indices.delete');
            if ('notFound' in err && err.notFound === true) {
                // Not found is ok, just means it didn't exist
            } else {
                throw err;
            }
        }
    }
}

// Helper function to build score filter
function buildScoreFilter(field: string, scoreParams: ScoreSearchParams): any {
    switch (scoreParams.operator) {
        case 'eq':
            return { term: { [field]: scoreParams.score } };
        case 'gte':
            return { range: { [field]: { gte: scoreParams.score } } };
        case 'lte':
            return { range: { [field]: { lte: scoreParams.score } } };
    }
}

// Helper function to get total value from OpenSearch response
function getTotalValue(total: any): number {
    if (typeof total === 'number') {
        return total;
    } else {
        return total.value || 0;
    }
}

/**
 * Query for chat sessions with comprehensive filtering and pagination support
 */
export async function queryForSessions<T extends RecordOrUndef = undefined>(searchRequest: SessionSearchRequest<T>): Promise<SessionSearchResponse<T>> {
    try {
        if (searchRequest.insights && searchRequest.insights.hasInsights === undefined) {
            return {
                success: false,
                sessions: [],
                error: 'insights.hasInsights is required when insights filtering is requested',
                total: 0,
                pageSize: searchRequest.size ?? MAX_RESULTS
            };
        }

        const sessions: ChatSession<T>[] = [];

        // Handle pagination via scrollId
        let body: OsQuery;
        if (searchRequest.scrollId) {
            // Decode existing query from scrollId
            try {
                body = getNextPageQueryFromScrollId(searchRequest.scrollId);
                // Update size if provided in new request
                if (searchRequest.size) {
                    body.size = searchRequest.size;
                }
                // Update source filtering based on include flags for this request
                try {
                    const excludes: string[] = [];
                    if (!searchRequest.includeInsights) {
                        excludes.push('insights');
                    }
                    if (!searchRequest.includeFeedback) {
                        excludes.push('feedback');
                    }
                    if (excludes.length > 0) {
                        (body as any)._source = { excludes };
                    } else {
                        // If both are requested, ensure we don't carry over excludes from previous pages
                        if ((body as any)._source && (body as any)._source.excludes) {
                            delete (body as any)._source.excludes;
                        }
                    }
                } catch {
                    // best-effort; ignore source filtering errors
                }
            } catch (error) {
                return {
                    success: false,
                    sessions: [],
                    error: 'Invalid scrollId provided',
                    total: 0,
                    pageSize: searchRequest.size ?? MAX_RESULTS
                };
            }
        } else {
            // Build new query body
            body = {
                query: {
                    bool: {
                        filter: [], // All term/terms/range filters go here
                        must: [] // Text search queries go here
                    }
                },
                sort: [],
                size: searchRequest.size ?? MAX_RESULTS,
                track_total_hits: true
            };
            // Configure source filtering so that by default we exclude large nested fields
            try {
                const excludes: string[] = [];
                if (!searchRequest.includeInsights) {
                    excludes.push('insights');
                }
                if (!searchRequest.includeFeedback) {
                    excludes.push('feedback');
                }
                if (excludes.length > 0) {
                    (body as any)._source = { excludes };
                }
            } catch {
                // best-effort; ignore source filtering errors
            }
        }

        // Only build filters for new queries (not when using scrollId)
        if (!searchRequest.scrollId) {
            const filter: any[] = body.query.bool.filter as any[];

            // Basic field matching (exact terms)
            if (searchRequest.userId) {
                filter.push({ term: { user_id: searchRequest.userId } });
            }
            if (searchRequest.chatAppId) {
                filter.push({ term: { chat_app_id: searchRequest.chatAppId } });
            }
            if (searchRequest.sessionId) {
                filter.push({ term: { session_id: searchRequest.sessionId } });
            }
            if (searchRequest.flagged !== undefined) {
                filter.push({ term: { flagged: searchRequest.flagged } });
            }

            // We will handle the feedback date filter below
            if (searchRequest.dateFilter && (searchRequest.dateFilter.dateType === 'created' || searchRequest.dateFilter.dateType === 'updated')) {
                const rangeFilter: any = { gte: searchRequest.dateFilter.startDate };
                const dateType = searchRequest.dateFilter.dateType ?? 'created';
                const field = dateType === 'created' ? 'create_date' : 'last_update';
                if (searchRequest.dateFilter.endDate) {
                    rangeFilter.lte = searchRequest.dateFilter.endDate;
                }
                filter.push({ range: { [field]: rangeFilter } });
            }

            // Custom user data filtering
            if (searchRequest.customUserData && typeof searchRequest.customUserData === 'object') {
                Object.entries(searchRequest.customUserData).forEach(([key, value]) => {
                    // Custom user data preserves original case (following the same pattern as ChatUser conversion)
                    // Known SessionAttributes fields (firstName, lastName, userId, etc.) are converted to snake_case,
                    // but custom data keys from the T generic spread remain as-is
                    filter.push({ term: { [`session_attributes.${key}`]: value } });
                });
            }

            // Text search (titlePartial)
            if (searchRequest.titlePartial && searchRequest.titlePartial.trim().length > 0) {
                if (!body.query.bool.must) {
                    body.query.bool.must = [];
                }
                (body.query.bool.must as any[]).push({
                    wildcard: {
                        title: `*${searchRequest.titlePartial.toLowerCase()}*`
                    }
                });
            }

            // Insights filtering (most complex)
            if (searchRequest.insights) {
                const insightsFilters: any[] = [];

                // hasInsights is required
                if (searchRequest.insights.hasInsights) {
                    insightsFilters.push({ exists: { field: 'insights' } });
                } else {
                    insightsFilters.push({ bool: { must_not: { exists: { field: 'insights' } } } });
                }

                // Score-based filters
                if (searchRequest.insights.goalAchievementScore) {
                    const scoreFilter = buildScoreFilter('insights.scoring.scores.goal_achievement.score', searchRequest.insights.goalAchievementScore);
                    insightsFilters.push(scoreFilter);
                }

                if (searchRequest.insights.userSatisfactionScore) {
                    const scoreFilter = buildScoreFilter('insights.scoring.scores.user_satisfaction.score', searchRequest.insights.userSatisfactionScore);
                    insightsFilters.push(scoreFilter);
                }

                if (searchRequest.insights.aiPerformanceOverallScore) {
                    const scoreFilter = buildScoreFilter('insights.scoring.scores.ai_performance.overall.score', searchRequest.insights.aiPerformanceOverallScore);
                    insightsFilters.push(scoreFilter);
                }

                if (searchRequest.insights.aiPerformanceAccuracyScore) {
                    const scoreFilter = buildScoreFilter('insights.scoring.scores.ai_performance.accuracy.score', searchRequest.insights.aiPerformanceAccuracyScore);
                    insightsFilters.push(scoreFilter);
                }

                if (searchRequest.insights.aiPerformanceEfficiencyScore) {
                    const scoreFilter = buildScoreFilter('insights.scoring.scores.ai_performance.efficiency.score', searchRequest.insights.aiPerformanceEfficiencyScore);
                    insightsFilters.push(scoreFilter);
                }

                if (searchRequest.insights.interactionQualityScore) {
                    const scoreFilter = buildScoreFilter('insights.scoring.scores.interaction_quality.score', searchRequest.insights.interactionQualityScore);
                    insightsFilters.push(scoreFilter);
                }

                // Array-based categorical filters (OR logic within each category)
                if (searchRequest.insights.userSentiment && searchRequest.insights.userSentiment.length > 0) {
                    insightsFilters.push({
                        terms: { 'insights.scoring.assessments.user_sentiment': searchRequest.insights.userSentiment }
                    });
                }

                if (searchRequest.insights.goalCompletionStatus && searchRequest.insights.goalCompletionStatus.length > 0) {
                    insightsFilters.push({
                        terms: { 'insights.scoring.assessments.goal_completion_status': searchRequest.insights.goalCompletionStatus }
                    });
                }

                if (searchRequest.insights.satisfactionLevel && searchRequest.insights.satisfactionLevel.length > 0) {
                    insightsFilters.push({
                        terms: { 'insights.scoring.assessments.satisfaction_level': searchRequest.insights.satisfactionLevel }
                    });
                }

                if (searchRequest.insights.sessionDurationEstimate && searchRequest.insights.sessionDurationEstimate.length > 0) {
                    insightsFilters.push({
                        terms: { 'insights.scoring.metrics.session_duration_estimate': searchRequest.insights.sessionDurationEstimate }
                    });
                }

                if (searchRequest.insights.complexityLevel && searchRequest.insights.complexityLevel.length > 0) {
                    insightsFilters.push({
                        terms: { 'insights.scoring.metrics.complexity_level': searchRequest.insights.complexityLevel }
                    });
                }

                if (searchRequest.insights.userEffortRequired && searchRequest.insights.userEffortRequired.length > 0) {
                    insightsFilters.push({
                        terms: { 'insights.scoring.metrics.user_effort_required': searchRequest.insights.userEffortRequired }
                    });
                }

                if (searchRequest.insights.aiConfidenceLevel && searchRequest.insights.aiConfidenceLevel.length > 0) {
                    insightsFilters.push({
                        terms: { 'insights.scoring.metrics.ai_confidence_level': searchRequest.insights.aiConfidenceLevel }
                    });
                }

                // Combine all insights filters with AND logic
                if (insightsFilters.length > 0) {
                    filter.push({
                        bool: {
                            filter: insightsFilters
                        }
                    });
                }
            }

            // Feedback filtering
            // First, check if any feedback criteria are specified
            const hasFeedbackCriteria = !!(
                searchRequest.feedbackReportedByHuman !== undefined ||
                searchRequest.feedbackCreatedByCustomer !== undefined ||
                searchRequest.feedbackUserId ||
                (searchRequest.feedbackInStatus && searchRequest.feedbackInStatus.length > 0) ||
                (searchRequest.feedbackSeverity && searchRequest.feedbackSeverity.length > 0) ||
                (searchRequest.feedbackType && searchRequest.feedbackType.length > 0) ||
                (searchRequest.dateFilter?.dateType === 'feedback' && searchRequest.dateFilter.startDate) ||
                searchRequest.feedbackInternalCommentUserId ||
                (searchRequest.feedbackInternalCommentType && searchRequest.feedbackInternalCommentType.length > 0) ||
                (searchRequest.feedbackInternalCommentStatus && searchRequest.feedbackInternalCommentStatus.length > 0)
            );

            // Handle feedback existence first
            if (searchRequest.flagged === false) {
                // If explicitly searching for non-flagged sessions, exclude those with open feedback
                filter.push({
                    bool: {
                        should: [
                            { bool: { must_not: { exists: { field: 'feedback' } } } }, // No feedback at all
                            {
                                bool: {
                                    must_not: {
                                        nested: {
                                            path: 'feedback',
                                            query: {
                                                terms: { 'feedback.status': ['open', 'in_review'] }
                                            }
                                        }
                                    }
                                }
                            } // Has feedback but none are open/in_review
                        ]
                    }
                });
            } else if (hasFeedbackCriteria) {
                // Build nested feedback filters
                const feedbackFilters: any[] = [];

                // Simple feedback field filters
                if (searchRequest.feedbackReportedByHuman !== undefined) {
                    feedbackFilters.push({ term: { 'feedback.reported_by_human': searchRequest.feedbackReportedByHuman } });
                }

                if (searchRequest.feedbackCreatedByCustomer !== undefined) {
                    feedbackFilters.push({ term: { 'feedback.created_by_customer': searchRequest.feedbackCreatedByCustomer } });
                }

                if (searchRequest.feedbackUserId) {
                    feedbackFilters.push({ term: { 'feedback.user_id': searchRequest.feedbackUserId } });
                }

                // Array-based feedback filters (OR logic within each category)
                if (searchRequest.feedbackInStatus && searchRequest.feedbackInStatus.length > 0) {
                    feedbackFilters.push({ terms: { 'feedback.status': searchRequest.feedbackInStatus } });
                }

                if (searchRequest.feedbackSeverity && searchRequest.feedbackSeverity.length > 0) {
                    feedbackFilters.push({ terms: { 'feedback.severity': searchRequest.feedbackSeverity } });
                }

                if (searchRequest.feedbackType && searchRequest.feedbackType.length > 0) {
                    feedbackFilters.push({ terms: { 'feedback.type': searchRequest.feedbackType } });
                }

                // Feedback date range filters
                if (searchRequest.dateFilter?.dateType === 'feedback' && searchRequest.dateFilter.startDate) {
                    const dateRangeFilter: any = {};
                    if (searchRequest.dateFilter.startDate) {
                        dateRangeFilter.gte = searchRequest.dateFilter.startDate;
                    }
                    if (searchRequest.dateFilter.endDate) {
                        dateRangeFilter.lte = searchRequest.dateFilter.endDate;
                    }
                    feedbackFilters.push({ range: { 'feedback.created_on': dateRangeFilter } });
                }

                // Internal comment filters (nested within nested)
                const internalCommentFilters: any[] = [];

                if (searchRequest.feedbackInternalCommentUserId) {
                    internalCommentFilters.push({ term: { 'feedback.internal_comments.user_id': searchRequest.feedbackInternalCommentUserId } });
                }

                if (searchRequest.feedbackInternalCommentType && searchRequest.feedbackInternalCommentType.length > 0) {
                    internalCommentFilters.push({ terms: { 'feedback.internal_comments.type': searchRequest.feedbackInternalCommentType } });
                }

                if (searchRequest.feedbackInternalCommentStatus && searchRequest.feedbackInternalCommentStatus.length > 0) {
                    internalCommentFilters.push({ terms: { 'feedback.internal_comments.status': searchRequest.feedbackInternalCommentStatus } });
                }

                // Add internal comment nested query if we have internal comment filters
                if (internalCommentFilters.length > 0) {
                    feedbackFilters.push({
                        nested: {
                            path: 'feedback.internal_comments',
                            query: {
                                bool: {
                                    filter: internalCommentFilters
                                }
                            }
                        }
                    });
                }

                // Wrap all feedback filters in a nested query
                if (feedbackFilters.length > 0) {
                    filter.push({
                        nested: {
                            path: 'feedback',
                            query: {
                                bool: {
                                    filter: feedbackFilters
                                }
                            }
                        }
                    });
                }
            }

            // Sorting strategy
            if (searchRequest.sortBy && searchRequest.sortBy.length > 0) {
                searchRequest.sortBy.forEach((sortField) => {
                    // Convert field names to snake_case for OpenSearch
                    let osFieldName: string;
                    switch (sortField.field) {
                        case 'createDate':
                            osFieldName = 'create_date';
                            break;
                        case 'lastUpdate':
                            osFieldName = 'last_update';
                            break;
                        case 'sessionId':
                            osFieldName = 'session_id';
                            break;
                        case 'inputTokens':
                            osFieldName = 'input_tokens';
                            break;
                        case 'outputTokens':
                            osFieldName = 'output_tokens';
                            break;
                        case 'totalCost':
                            osFieldName = 'total_cost';
                            break;
                        case 'insightGoalAchievementScore':
                            osFieldName = 'insights.scoring.scores.goal_achievement.score';
                            break;
                        default:
                            osFieldName = sortField.field;
                    }
                    body.sort!.push({ [osFieldName]: sortField.order });
                });
            } else {
                // Default sorting
                body.sort = [{ create_date: 'desc' }, { session_id: 'desc' }];
            }

            // Ensure sessionId is always included for consistent pagination
            const hasSessionIdSort = body.sort!.some((s) => typeof s === 'object' && 'session_id' in s);
            if (!hasSessionIdSort) {
                body.sort!.push({ session_id: 'desc' });
            }
        }

        // Execute the search
        const index = osIndexMeta.session.name; // Use configured session index name
        // Log the final query before execution (help diagnose unexpected filters/sorts)
        try {
            console.log(
                'queryForSessions: final query',
                JSON.stringify(
                    {
                        index,
                        size: body.size,
                        sort: body.sort,
                        track_total_hits: body.track_total_hits,
                        filterCount: (body.query?.bool?.filter as any[])?.length ?? 0,
                        mustCount: (body.query?.bool?.must as any[])?.length ?? 0,
                        query: body
                    },
                    null,
                    2
                )
            );
        } catch (e) {
            console.warn('queryForSessions: failed to log final query', e);
        }
        const resp = await execOpenSearchCmd(`queryForSessions`, `Failed queryForSessions`, async (client: Client): Promise<any> => {
            return await client.search({ index, body } as any);
        });

        // Process the response
        const morePages = resp.body.hits.hits.length === (searchRequest.size ?? MAX_RESULTS);
        let scrollId: string | undefined;

        // Log response summary including totals and bounds
        try {
            const totalRaw = resp.body.hits.total;
            const totalParsed = getTotalValue(totalRaw);
            const hitsLen = resp.body.hits.hits.length;
            console.log(
                'queryForSessions: response summary',
                JSON.stringify(
                    {
                        tookMs: resp.body.took,
                        hitsReturned: hitsLen,
                        totalRaw,
                        totalParsed,
                        pageSize: body.size,
                        morePages,
                        sort: body.sort,
                        track_total_hits: body.track_total_hits
                    },
                    null,
                    2
                )
            );

            console.log(
                'queryForSessions: page bounds',
                JSON.stringify(
                    {
                        firstId: resp.body.hits.hits[0]?._source?.session_id,
                        firstSort: resp.body.hits.hits[0]?.sort,
                        lastId: resp.body.hits.hits[hitsLen - 1]?._source?.session_id,
                        lastSort: resp.body.hits.hits[hitsLen - 1]?.sort
                    },
                    null,
                    2
                )
            );
        } catch (e) {
            console.warn('queryForSessions: failed to log response summary/bounds', e);
        }

        // Optional debug: run a filtered count using the same query.bool to compare totals
        try {
            const countResp = await execOpenSearchCmd('queryForSessions:debugCount', 'Failed debugCount', async (client: Client): Promise<any> => {
                return await client.count({ index, body: { query: body.query } } as any);
            });
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const countVal = (countResp as any)?.body?.count ?? (countResp as any)?.count;
            console.log('queryForSessions: debugCount (filters only)', countVal);
        } catch (e) {
            console.warn('queryForSessions: debugCount failed', e);
        }

        for (let i = 0; i < resp.body.hits.hits.length; i++) {
            const hit = resp.body.hits.hits[i];
            if (hit._source) {
                // Convert from snake_case OS format to camelCase application format
                const session = convertChatSessionToCamelFromSnakeCase<T>(hit._source);
                sessions.push(session);
            }

            // Handle pagination for last item
            if (i === resp.body.hits.hits.length - 1 && hit.sort) {
                if (morePages) {
                    scrollId = buildScrollIdFromQueryAndLastHitSort(hit.sort, body);
                }
            }
        }

        // Set total count
        const total = getTotalValue(resp.body.hits.total);

        return {
            success: true,
            sessions,
            scrollId,
            total,
            pageSize: body.size ?? MAX_RESULTS
        };
    } catch (error) {
        return {
            success: false,
            sessions: [],
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            total: 0,
            pageSize: searchRequest.size ?? MAX_RESULTS
        };
    }
}

/******************************************************
 * THESE ARE OLD QUERIES FROM ANOTHER PROJECT THAT WE WILL USE AS A REFERENCE
 ******************************************************/

// /**
//  * Get the message count for a conversation from opensearch and put it on the conversation object.
//  */
// export async function getMessageCountForConversation(conversation: Conversation, accountId: string, accountType: AccountType) {
//     const counts = await getMessageCounts([conversation.id], accountId, accountType);
//     if (counts.length !== 1) {
//         throw new GeneralError(`Failed to get message count for conversation ${conversation.id}`);
//     } else {
//         conversation.message_count = counts[0].count;
//     }
// }

// /**
//  * Get the message count for a list of conversations from opensearch and put the count on each object.
//  */
// export async function getMessageCountForConversations(conversations: Conversation[], accountId: string, accountType: AccountType) {
//     const conversationIds = conversations.map((c) => c.id);
//     const counts = await getMessageCounts(conversationIds, accountId, accountType);
//     if (counts.length !== conversations.length) {
//         throw new GeneralError(`Did not get the same number of message counts as conversations when calling getMessageCountsForConversation`);
//     } else {
//         conversations.forEach((c, idx) => {
//             c.message_count = counts[idx].count;
//         });
//     }
// }

// /**
//  * Get an object by ID from opensearch.
//  */
// export async function getMessageCounts(conversationIds: string[], accountId: string, accountType: AccountType): Promise<MessageCount[]> {
//     if (conversationIds.length === 0) {
//         return [];
//     }

//     const index: DomainIndex = 'message';
//     const accountAttrName = accountType === 'retailer' ? 'retailer_id' : 'supplier_id';
//     //const filters: OsFilterTermQuery[] = [];
//     const baseFilters: QueryDslQueryContainer[] = [];

//     //let result: MessageCount[] = [];
//     // If we're querying as the overlord, that means we're allowed to act as any account and we don't
//     // require that we filter by the account ID of the calling account since the calling account
//     // is the overlord who is allowed to query on behalf of any account.  So, if we're the overlord,
//     // only add the retailer_id or supplier_id filter if it was present on the query.

//     if (accountId !== OVERLORD_ACCOUNT_ID) {
//         baseFilters.push({ term: { [accountAttrName]: accountId } });
//     } else {
//         // The overlord isn't filtered by account since it can search across all accounts
//     }

//     const body: (MsearchBody | MsearchHeader)[] = conversationIds.flatMap((conversationId): (MsearchBody | MsearchHeader)[] => {
//         return [
//             { index },
//             {
//                 query: {
//                     bool: {
//                         filter: [...baseFilters, { term: { conversation_id: conversationId } }]
//                     } as QueryDslBoolQuery // See note at to top of file
//                 },
//                 size: 0,
//                 track_total_hits: true
//             }
//         ];
//     });

//     logger.debug({ body }, 'Opensearch getMessageCounts');

//     const resp = await execOpenSearchCmd(`msearch for message counts`, `Failed msearch for message counts`, async (client: Client): Promise<MSearchResp> => {
//         return await client.msearch({ body });
//     });

//     if (resp.body.responses.length !== conversationIds.length) {
//         logger.error({ body, responses: resp.body.responses }, 'Did not get the same number of responses as queries in getMessageCounts');
//         throw new GeneralError('Did not get the same number of responses as queries in getMessageCounts');
//     } else {
//         const errors: (string | MainError)[] = [];
//         const result = resp.body.responses.reduce((arr, responseObj, idx) => {
//             if ('error' in responseObj) {
//                 errors.push(responseObj.error);
//             } else {
//                 const count = typeof responseObj.hits.total === 'number' ? responseObj.hits.total : responseObj.hits.total.value;
//                 arr.push({ conversation_id: conversationIds[idx], count });
//             }
//             return arr;
//         }, [] as MessageCount[]);

//         if (errors.length > 0) {
//             logger.error({ body, errors }, 'Got errors from opensearch for some queries in getMessageCounts');
//             throw new GeneralError(`Got errors from opensearch for some queries in getMessageCounts: ${JSON.stringify(errors)}`);
//         } else {
//             return result;
//         }
//     }
// }

// /**
//  * Used to cleanup integration test detritus from opensearch, deleting data by conversation ID from the given index.
//  */
// export async function deleteIntegrationTestDetritusByIndex(conversationIds: string[], index: DomainIndex): Promise<void> {
//     // Adding the filters for is_test and test_type just to be darn sure we aren't deleting things we shouldn't be
//     const body =
//         index === 'conversation' || index === 'message'
//             ? {
//                   query: {
//                       bool: {
//                           filter: [
//                               {
//                                   terms: {
//                                       [index === 'conversation' ? 'id' : 'conversation_id']: conversationIds
//                                   }
//                               },
//                               {
//                                   term: {
//                                       is_test: true
//                                   }
//                               },
//                               {
//                                   term: {
//                                       test_type: 'integration'
//                                   }
//                               }
//                           ]
//                       }
//                   }
//               }
//             : ({
//                   query: {
//                       bool: {
//                           filter: [
//                               {
//                                   terms: {
//                                       conversation_id: conversationIds
//                                   }
//                               }
//                           ]
//                       }
//                   }
//               } as unknown as OsQuery);

//     logger.debug({ body }, 'Opensearch deleteAllTestConversationMessages');

//     const resp = await execOpenSearchCmd(
//         `deleteAllTestConversationMessages`,
//         `Failed deleteAllTestConversationMessages`,
//         async (client: Client): Promise<ApiResponse<DeleteByQueryResponse>> => {
//             return await client.deleteByQuery({ index, body });
//         }
//     );

//     if (resp.body.failures && resp.body.failures.length > 0) {
//         logger.error({ body, errors: resp.body.failures }, 'Got errors from opensearch when doing deleteByQuery in deleteAllTestConversationMessages');
//         throw new GeneralError(`Got errors from opensearch when doing deleteByQuery in deleteAllTestConversationMessages: ${JSON.stringify(resp.body.failures)}`);
//     }
// }

// /**
//  * Get all test conversations (is_test == true && test_type === 'integration') that are older than the specified period.
//  * Note the now-5000ms is really only useful for testing purposes.
//  *
//  * @param period Defaults to 'now-1h'
//  * @returns
//  */
// export async function getTestConversationIdsOlderThanXYZ(period?: 'now' | 'now-5000ms' | 'now-1m' | 'now-1h'): Promise<Record<string, string>> {
//     const result: Record<string, string> = {};
//     let searchAfter: SearchSortResults | undefined;

//     do {
//         const body: OsQuery = {
//             query: {
//                 bool: {
//                     filter: [
//                         {
//                             range: {
//                                 create_date: {
//                                     lt: period ?? 'now-1h'
//                                 }
//                             }
//                         },
//                         {
//                             term: {
//                                 is_test: true
//                             }
//                         },
//                         {
//                             term: {
//                                 test_type: 'integration'
//                             }
//                         }
//                     ]
//                 }
//             },
//             _source: ['id', 'internal_id'],
//             size: MAX_RESULTS,
//             sort: [{ create_date: 'asc' }]
//         } as unknown as OsQuery;

//         body.search_after = searchAfter ?? undefined;

//         logger.debug({ body }, 'Opensearch getTestConversationIdsOlderThanXYZ');
//         const index: DomainIndex = 'conversation';
//         const resp = await execOpenSearchCmd(
//             `getTestConversationIdsOlderThanXYZ`,
//             `Failed getTestConversationIdsOlderThanXYZ`,
//             async (client: Client): Promise<OSSearchResult<ConversationIdAndInternalId>> => {
//                 return await client.search({ index, body });
//             }
//         );
//         // We have to assume if we got back the exact number of results we asked for, there are more pages
//         const morePages = resp.body.hits.hits.length === MAX_RESULTS;
//         searchAfter = undefined;

//         if (resp.body.hits.hits.length > 0) {
//             for (let i = 0; i < resp.body.hits.hits.length; i++) {
//                 const obj = resp.body.hits.hits[i];
//                 if (obj._source) {
//                     result[obj._source.id] = obj._source.internal_id;
//                 } else {
//                     logger.error(`Did not get _source back in getTestConversationIdsOlderThanXYZ from opensearch ${JSON.stringify(obj)}`);
//                 }
//                 if (morePages && i === resp.body.hits.hits.length - 1 && obj.sort) {
//                     searchAfter = obj.sort;
//                 }
//             }
//         } else {
//             /* didn't find any docs in opensearch */
//         }
//     } while (searchAfter);

//     return result;
// }

// /**
//  * Get the first message string of each conversation from opensearch.
//  */
// export async function getFirstMessageStrings(conversationIds: string[], accountId: string, accountType: AccountType): Promise<FirstMessageString[]> {
//     const result: FirstMessageString[] = [];
//     const accountAttrName = accountType === 'retailer' ? 'retailer_id' : 'supplier_id';

//     //TODO: deal with possibility that they are requesting too many of these and we need to scrollId it

//     const body: OsQuery = {
//         query: {
//             bool: {
//                 filter: [{ terms: { conversation_id: conversationIds } }]
//             }
//         },
//         size: MAX_RESULTS,
//         collapse: {
//             field: 'conversation_id',
//             inner_hits: {
//                 name: 'first_message',
//                 size: 1,
//                 sort: [{ create_date: 'asc' }]
//             }
//         },
//         fields: ['conversation_id', 'message'],
//         _source: false,
//         sort: [{ create_date: 'asc' }]
//     } as OsQuery;
//     const filter: OsFilterTermOrTermsQuery[] = body.query.bool.filter as OsFilterTermOrTermsQuery[];

//     //fields: ['conversation_id', 'message'],

//     //let result: MessageCount[] = [];
//     // If we're querying as the overlord, that means we're allowed to act as any account and we don't
//     // require that we filter by the account ID of the calling account since the calling account
//     // is the overlord who is allowed to query on behalf of any account.  So, if we're the overlord,
//     // only add the retailer_id or supplier_id filter if it was present on the query.

//     if (accountId !== OVERLORD_ACCOUNT_ID) {
//         filter.push({ term: { [accountAttrName]: accountId } });
//     } else {
//         // The overlord isn't filtered by account since it can search across all accounts
//     }

//     if (body) {
//         logger.debug({ body }, 'Opensearch queryForFirstMessageStrings');
//         const index: DomainIndex = 'message';
//         const resp = await execOpenSearchCmd(`getFirstMessageStrings`, `Failed getFirstMessageStrings`, async (client: Client): Promise<OSSearchResult<FirstMessageString>> => {
//             return await client.search({ index, body });
//         });
//         // We have to assume if we got back the exact number of results we asked for, there are more pages
//         const morePages = resp.body.hits.hits.length === MAX_RESULTS;

//         if (resp.body.hits.hits.length > 0) {
//             for (let i = 0; i < resp.body.hits.hits.length; i++) {
//                 const obj = resp.body.hits.hits[i];
//                 if (obj.fields) {
//                     const cid = obj.fields.conversation_id && (obj.fields.conversation_id as string[]).length > 0 ? (obj.fields.conversation_id as string[])[0] : undefined;
//                     const msg = obj.fields.message && (obj.fields.message as string[]).length > 0 ? (obj.fields.message as string[])[0] : undefined;
//                     if (cid === undefined || msg === undefined) {
//                         throw new GeneralError(`Did not get conversation_id or message back in getFirstMessageStrings from opensearch ${JSON.stringify(obj)}`);
//                     }
//                     result.push({
//                         conversation_id: cid,
//                         message: msg.length > FIRST_MESSAGE_MAX_LENGTH ? msg.substring(0, FIRST_MESSAGE_MAX_LENGTH) : msg
//                     });
//                 } else {
//                     logger.error(`Did not get fields back in getFirstMessageStrings from opensearch ${JSON.stringify(obj)}`);
//                 }
//                 if (morePages && i === resp.body.hits.hits.length - 1) {
//                     if (obj.sort) {
//                         // If there are more pages, we need to return a scroll id
//                         //result.scroll_id = buildScrollIdFromQueryAndLastHitSort(obj.sort, body);
//                         //TODO: get scroll working here
//                     } else {
//                         logger.error(`Did not get sort back in getFirstMessageStrings from opensearch ${JSON.stringify(obj)}`);
//                     }
//                 }
//             }
//         } else {
//             /* didn't find any docs in opensearch */
//         }
//     } else {
//         // Already did a search and have results
//     }

//     return result;
// }

// /**
//  * Gets a single user viewed conversation from opensearch.
//  */
// export async function getSingleUserViewedConversation(
//     conversationId: string,
//     userId: string,
//     accountId: string,
//     accountType: AccountType
// ): Promise<UserViewedConversation | undefined> {
//     const query: ViewedQuery = { conversation_ids: [conversationId], account_id: accountId, user_id: userId, account_type: accountType };
//     const result = await queryForViewed(query);
//     if (result.viewed.length === 1) {
//         return result.viewed[0];
//     } else if (result.viewed.length > 1) {
//         throw new GeneralError(
//             `getSingleUserViewedConversation found ${result.viewed.length} viewed for conversationId: ${conversationId}, accountId: ${accountId}, userId: ${userId}`
//         );
//     } else {
//         return undefined;
//     }
// }

// /**
//  * Find the conversations that the user has viewed and where they left off in the conversations.
//  */
// export async function queryForViewed(query: ViewedQuery): Promise<UserViewedConversationQueryResult> {
//     const result: UserViewedConversationQueryResult = {
//         viewed: [],
//         scroll_id: undefined
//     };
//     // The body of the query we will send to opensearch
//     let body: OsQuery | undefined;

//     if (query.scroll_id) {
//         body = getNextPageQueryFromScrollId(query.scroll_id);
//     } else {
//         body = {
//             query: {
//                 bool: {
//                     filter: [{ terms: { conversation_id: query.conversation_ids } }, { term: { account_id: query.account_id } }, { term: { user_id: query.user_id } }]
//                 }
//             },
//             sort: [{ last_index_date: 'asc' }],
//             search_after: undefined,
//             size: MAX_RESULTS
//         };
//     }

//     if (body) {
//         logger.debug({ body }, 'Opensearch queryForViewed');
//         const index: DomainIndex = 'viewed';
//         const resp = await execOpenSearchCmd(`queryForViewed`, `Failed queryForViewed`, async (client: Client): Promise<OSSearchResult<UserViewedConversationOs>> => {
//             return await client.search({ index, body });
//         });
//         // We have to assume if we got back the exact number of results we asked for, there are more pages
//         const morePages = resp.body.hits.hits.length === MAX_RESULTS;

//         if (resp.body.hits.hits.length > 0) {
//             for (let i = 0; i < resp.body.hits.hits.length; i++) {
//                 const obj = resp.body.hits.hits[i];
//                 if (obj._source) {
//                     result.viewed.push(osIndexMeta.viewed.convertFromOsToBaseType(obj._source));
//                 } else {
//                     logger.error(`Did not get _source back from opensearch for viewed ${JSON.stringify(obj)}`);
//                 }
//                 if (morePages && i === resp.body.hits.hits.length - 1) {
//                     if (obj.sort) {
//                         // If there are more pages, we need to return a scroll id
//                         result.scroll_id = buildScrollIdFromQueryAndLastHitSort(obj.sort, body);
//                     } else {
//                         logger.error(`Did not get sort back from opensearch for viewed ${JSON.stringify(obj)}`);
//                     }
//                 }
//             }
//         } else {
//             /* didn't find any docs in opensearch */
//         }
//     } else {
//         // Already did a search and have results
//     }

//     return result;
// }

// /**
//  * Returns the number of unread messages for a given user for each conversation
//  * listed. If the user viewed information is not provided, it will first be retrieved from opensearch.
//  */
// export async function getUnreadMessageCounts(query: UnreadMessageCountQuery, viewed?: UserViewedConversationLite[]): Promise<UnreadMessageCountsResult> {
//     const result: UnreadMessageCountsResult = {
//         counts: [],
//         scroll_id: undefined
//     };

//     // All of the convolutions below are to just make sure we have an entry in the viewed array for each conversation ID
//     // passed in. If we don't have an entry, we will assume the user has not viewed any messages in that conversation.
//     // If they passed in the list of viewed messages, we use it as gospel and run with it.  If not, we go get them.
//     if (!viewed) {
//         const viewedQuery: ViewedQuery = {
//             conversation_ids: query.conversation_ids,
//             account_id: query.account_id,
//             user_id: query.user_id,
//             account_type: query.account_type
//         };
//         const viewedResult = await queryForViewed(viewedQuery);
//         viewed = viewedResult.viewed;
//     }

//     const convIdToViewedDate = viewed.reduce(
//         (obj, viewedConversation) => {
//             obj[viewedConversation.conversation_id] = viewedConversation.viewed_date;
//             return obj;
//         },
//         {} as { [key: string]: string }
//     );

//     // Put an entry in for each conversation not yet read at all
//     for (const convId of query.conversation_ids) {
//         if (!convIdToViewedDate[convId]) {
//             convIdToViewedDate[convId] = DATE_FROM_A_LONG_TIME_AGO_AS_ISO_STRING;
//         }
//     }

//     // Get them back as an array.
//     viewed = Object.entries(convIdToViewedDate).map(([convId, date]) => {
//         return { conversation_id: convId, viewed_date: date };
//     });

//     const index: DomainIndex = 'message';
//     const accountAttrName = query.account_type === 'retailer' ? 'retailer_id' : 'supplier_id';
//     //const filters: OsFilterTermQuery[] = [];
//     const baseFilters: QueryDslQueryContainer[] = [];

//     //let result: MessageCount[] = [];
//     // If we're querying as the overlord, that means we're allowed to act as any account and we don't
//     // require that we filter by the account ID of the calling account since the calling account
//     // is the overlord who is allowed to query on behalf of any account.  So, if we're the overlord,
//     // only add the retailer_id or supplier_id filter if it was present on the query.

//     if (query.account_id !== OVERLORD_ACCOUNT_ID) {
//         baseFilters.push({ term: { [accountAttrName]: query.account_id } });
//     } else {
//         // The overlord isn't filtered by account since it can search across all accounts
//     }

//     // For each conversation, we want to find the number of messages that are unread by the user.
//     // Loop through the conversations and make a new query to do at the same time where each query
//     // is filtered to the account passed in (unless overlord account passed in) and to only
//     // the messages that are newer than the date passed in and ignore messages from the user passed in
//     // so we don't treat the user's own messages as unread.
//     const body: (MsearchBody | MsearchHeader)[] = viewed.flatMap((viewedObj): (MsearchBody | MsearchHeader)[] => {
//         return [
//             { index },
//             {
//                 query: {
//                     bool: {
//                         filter: [
//                             ...baseFilters,
//                             { term: { conversation_id: viewedObj.conversation_id } },
//                             { range: { create_date: { gt: viewedObj.viewed_date } } },
//                             {
//                                 bool: {
//                                     must_not: {
//                                         term: {
//                                             user_id: query.user_id
//                                         }
//                                     }
//                                 }
//                             }
//                         ]
//                     } as QueryDslBoolQuery // See note at to top of file
//                 },
//                 size: 0,
//                 track_total_hits: true
//             }
//         ];
//     });

//     logger.debug({ body }, 'Opensearch getUnreadMessageCounts');

//     const resp = await execOpenSearchCmd(`msearch for unread counts`, `Failed msearch for unread counts`, async (client: Client): Promise<MSearchResp> => {
//         return await client.msearch({ body });
//     });

//     if (resp.body.responses.length !== query.conversation_ids.length) {
//         logger.error({ body, responses: resp.body.responses }, 'Did not get the same number of responses as queries in getUnreadMessageCounts');
//         throw new GeneralError('Did not get the same number of responses as queries in getUnreadMessageCounts');
//     } else {
//         const errors: (string | MainError)[] = [];
//         result.counts = resp.body.responses.reduce((arr, responseObj, idx) => {
//             if ('error' in responseObj) {
//                 errors.push(responseObj.error);
//             } else {
//                 const count = typeof responseObj.hits.total === 'number' ? responseObj.hits.total : responseObj.hits.total.value;
//                 arr.push({ conversation_id: viewed![idx].conversation_id, count });
//             }
//             return arr;
//         }, [] as MessageCount[]);

//         if (errors.length > 0) {
//             logger.error({ body, errors }, 'Got errors from opensearch for some queries in getUnreadMessageCounts');
//             throw new GeneralError(`Got errors from opensearch for some queries in getUnreadMessageCounts: ${JSON.stringify(errors)}`);
//         } else {
//             return result;
//         }
//     }
// }

// /**
//  * Adds message count to the conversation as a side effect unless told not to. Defaults to always add msg count.
//  *
//  * @param idIsReference If true, then we aren't looking up by conversation_id, we're looking up using the reference provided, either
//  *                      retailer_reference_id or supplier_reference_id
//  */
// export async function getConversationById(
//     id: string,
//     accountId: string,
//     accountType: AccountType,
//     userId: string,
//     idAttrName: 'retailer_reference_id' | 'supplier_reference_id' | 'id' | undefined,
//     isTest?: boolean,
//     options?: ConversationQueryOptions
// ): Promise<Conversation | undefined> {
//     const query: ConversationQuery = {};

//     idAttrName = idAttrName ?? 'id';
//     query[idAttrName] = id;

//     if (isTest !== undefined) {
//         query.test = isTest === true ? 'test' : 'legit';
//     } else {
//         query.test = 'all';
//     }
//     const result = (await queryForConversations(query, accountId, accountType, userId, options)) as ConversationQueryResult;
//     if (result.conversations.length === 1) {
//         return result.conversations[0];
//     } else if (result.conversations.length > 1) {
//         throw new GeneralError(`getConversationById found ${result.conversations.length} conversations for id ${id}`);
//     } else {
//         return undefined;
//     }
// }

// function isCountQuery(query: ConversationQuery | ConversationQueryOptionCount): query is ConversationQueryOptionCount {
//     return 'name' in query;
// }

// /**
//  * Find conversations. Adds message count to the conversations as a side effect unless told not to.
//  * Defaults to always add msg count to conversations.  You may either pass in a normal query or a request
//  * to retrurn counts for a query.
//  */
// export async function queryForConversations(
//     q: ConversationQuery | ConversationQueryOptionCount,
//     accountId: string,
//     accountType: AccountType,
//     userId: string,
//     options?: ConversationQueryOptions
// ): Promise<ConversationQueryResult | ConversationCount> {
//     const countOnly = isCountQuery(q);
//     let result: ConversationQueryResult | undefined;
//     let countResult: ConversationCount | undefined;

//     if (isCountQuery(q)) {
//         countResult = {
//             name: q.name,
//             count: 0
//         };

//         // Reset this to only query for params we want that make sense for counts
//         q = q.params;
//         options = {
//             dontAddMsgCount: true,
//             include_user_viewed_data: false,
//             counts: undefined,
//             include_first_message_text: false,
//             include_unread_message_counts: false
//         };
//     } else {
//         result = {
//             conversations: [],
//             scroll_id: undefined
//         };
//     }

//     // The body of the query we will send to opensearch
//     let body: OsQuery | undefined;

//     options = options ?? {};
//     options.dontAddMsgCount = options.dontAddMsgCount === true;
//     options.include_first_message_text = options.include_first_message_text === true;
//     options.include_user_viewed_data = options.include_user_viewed_data === true;

//     if (q.context_types && q.context_types.length > 0 && q.context) {
//         throw new ValidationError(`you may not provide both query.context_types and query.context at the same time`);
//     }

//     if (q.types && q.types.length > 0 && q.type) {
//         throw new ValidationError(`you may not provide both query.types and query.type at the same time`);
//     }

//     let countStatusConflicting = ((q.statuses ?? []).length > 0 ? 1 : 0) + (q.past_due === true ? 1 : 0) + (q.closed_since ? 1 : 0);
//     if (countStatusConflicting > 1) {
//         throw new ValidationError('You may only provide one of query.statuses, query.past_due and query.closed_since at the same time.');
//     }

//     countStatusConflicting = ((q.statuses ?? []).length > 0 ? 1 : 0) + (q.closed_since ? 1 : 0) + (q.due_in_next_ms ? 1 : 0);
//     if (countStatusConflicting > 1) {
//         throw new ValidationError('You may only provide one of query.statuses, query.closed_since and query.due_in_next_ms at the same time.');
//     }

//     let countDueConflicting = (q.past_due ? 1 : 0) + (q.until ? 1 : 0);
//     if (countDueConflicting > 1) {
//         throw new ValidationError('You may only provide one of query.past_due or query.until at the same time.');
//     }

//     countDueConflicting = (q.until ? 1 : 0) + (q.due_in_next_ms ? 1 : 0);
//     if (countDueConflicting > 1) {
//         throw new ValidationError('You may only provide one of query.until or query.due_in_next_ms at the same time.');
//     }

//     // Make certain there is no whitespace
//     q.term = q.term?.trim();
//     const isTermSearch = q.term && q.term.length > 0;

//     if (q.scroll_id) {
//         body = getNextPageQueryFromScrollId(q.scroll_id);
//     } else {
//         // If we're querying as the overlord, that means we're allowed to act as any account and we don't
//         // require that we filter by the account ID of the calling account since the calling account
//         // is the overlord who is allowed to query on behalf of any account.  So, if we're the overlord,
//         // only add the retailer_id or supplier_id filter if it was present on the query.

//         if (accountType === 'retailer') {
//             q.retailer_id = accountId === OVERLORD_ACCOUNT_ID ? q.retailer_id : accountId;
//         } else {
//             q.supplier_id = accountId === OVERLORD_ACCOUNT_ID ? q.supplier_id : accountId;
//         }

//         body = {
//             query: {
//                 bool: {
//                     filter: []
//                 }
//             },
//             sort: [],
//             search_after: undefined,
//             size: MAX_RESULTS
//         };
//         const filter: OsFilterTermOrTermsQuery[] = body.query.bool.filter as OsFilterTermOrTermsQuery[];

//         if (isTermSearch) {
//             body.query.bool.must = [{ simple_query_string: { query: prepareSearchTerm(q.term!), fields: ['all_text'], default_operator: 'and' } }];
//         }

//         if (countOnly) {
//             body.size = 0;
//             body.track_total_hits = true;
//         } else if (isTermSearch) {
//             body.size = MAX_TERM_SEARCH_RESULTS;
//         }

//         // Default to only returning legit conversations
//         if (q.test === undefined) {
//             q.test = 'legit';
//         }

//         if (q.test !== 'all') {
//             filter.push({ term: { is_test: q.test !== 'legit' } });
//         } else {
//             /* don't add a filter to get back both test and legit conversations */
//         }

//         addQueryFilterTermFromObj<ConversationQuery>(q, 'id', filter);
//         addQueryFilterTermFromObj<ConversationQuery>(q, 'initiated_by', filter);
//         addQueryFilterTermFromObj<ConversationQuery>(q, 'retailer_reference_id', filter);
//         addQueryFilterTermFromObj<ConversationQuery>(q, 'supplier_reference_id', filter);
//         addQueryFilterTermFromObj<ConversationQuery>(q, 'internal_conversation_id', filter);
//         addQueryFilterTermFromObj<ConversationQuery>(q, 'retailer_id', filter);
//         addQueryFilterTermFromObj<ConversationQuery>(q, 'supplier_id', filter);
//         addQueryFilterTermFromObj<ConversationQuery>(q, 'test_type', filter);

//         if (q.account_ids && q.account_ids.length > 0) {
//             if (accountType === 'retailer') {
//                 filter.push({ terms: { supplier_id: q.account_ids } });
//             } else {
//                 filter.push({ terms: { retailer_id: q.account_ids } });
//             }
//         }

//         if (q.statuses) {
//             filter.push({ terms: { status: q.statuses } });
//         }

//         if (q.context_types) {
//             filter.push({ terms: { 'context.type': q.context_types } });
//         }

//         if (q.types) {
//             filter.push({ terms: { 'type.type': q.types } });
//         }

//         if (q.created_since) {
//             if (q.until) {
//                 filter.push({ range: { create_date: { gte: q.created_since, lt: q.until } } } as unknown as OsFilterTermOrTermsQuery);
//             } else {
//                 filter.push({ range: { create_date: { gte: q.created_since } } } as unknown as OsFilterTermOrTermsQuery);
//             }
//         }

//         if (q.updated_since) {
//             if (q.until) {
//                 filter.push({ range: { last_update: { gte: q.updated_since, lt: q.until } } } as unknown as OsFilterTermOrTermsQuery);
//             } else {
//                 filter.push({ range: { last_update: { gte: q.updated_since } } } as unknown as OsFilterTermOrTermsQuery);
//             }
//         }

//         if (q.closed_since) {
//             if (q.until) {
//                 filter.push({ range: { closed_date: { gte: q.closed_since, lt: q.until } } } as unknown as OsFilterTermOrTermsQuery);
//             } else {
//                 filter.push({ range: { closed_date: { gte: q.closed_since } } } as unknown as OsFilterTermOrTermsQuery);
//             }
//         }

//         if (q.past_due === true && q.due_in_next_ms) {
//             const date = new Date(new Date().getTime() + q.due_in_next_ms).toISOString();
//             // filter.push({ range: { due_date: { gt: 'now' } } } as unknown as OsFilterTermOrTermsQuery);
//             filter.push({
//                 bool: {
//                     should: [
//                         { range: { due_date: { lte: 'now' } } },
//                         {
//                             bool: {
//                                 filter: [{ range: { due_date: { gte: 'now' } } }, { range: { due_date: { lte: date } } }]
//                             }
//                         }
//                     ],
//                     minimum_should_match: 1
//                 }
//             } as unknown as OsFilterTermOrTermsQuery);
//             filter.push({ bool: { must_not: [{ term: { status: 'closed' } }] } } as unknown as OsFilterTermOrTermsQuery);
//         } else if (q.due_in_next_ms) {
//             const date = new Date(new Date().getTime() + q.due_in_next_ms).toISOString();
//             filter.push({
//                 bool: {
//                     filter: [{ range: { due_date: { gte: 'now' } } }, { range: { due_date: { lte: date } } }]
//                 }
//             } as unknown as OsFilterTermOrTermsQuery);
//             filter.push({ bool: { must_not: [{ term: { status: 'closed' } }] } } as unknown as OsFilterTermOrTermsQuery);
//         } else if (q.past_due === true) {
//             filter.push({ range: { due_date: { lte: 'now' } } } as unknown as OsFilterTermOrTermsQuery);
//             filter.push({ bool: { must_not: [{ term: { status: 'closed' } }] } } as unknown as OsFilterTermOrTermsQuery);
//         } else if (q.past_due === false) {
//             filter.push({ range: { due_date: { gt: 'now' } } } as unknown as OsFilterTermOrTermsQuery);
//             filter.push({ terms: { status: ['new', 'in_progress'] } });
//         }

//         if (q.type) {
//             if (!q.type.type) {
//                 throw new ValidationError(`if query.type is provided then query.type.type is required`);
//             }
//             addQueryFilterTermFromObjWithSubKey<ConversationQuery>(q, 'type', 'type', filter);

//             if (q.type.type === 'customer_care' && q.type.consumer_id) {
//                 addQueryFilterTermFromObjWithSubKey<ConversationQuery>(q, 'type', 'consumer_id', filter);
//             }
//         }

//         if (q.context) {
//             //TODO: handle other serch terms in context
//             if (q.context.type) {
//                 addQueryFilterTermFromObjWithSubKey<ConversationQuery>(q, 'context', 'type', filter);
//             }
//         }

//         //TODO: handle created_since, updated_since and until and context

//         // If doing a term search, we let the search engine handle the sorting by search results score
//         if (!isTermSearch) {
//             const sort: OsSort[] = body.sort as OsSort[];
//             const convSort: ConversationSort[] = q.sort ?? [{ field: 'create_date', direction: 'desc' }];
//             convSort.forEach((sortItem) => {
//                 sort.push({ [sortItem.field]: sortItem.direction });
//             });
//         }
//     }

//     if (body) {
//         // eslint-disable-next-line no-console
//         console.log(JSON.stringify(body, null, 2));
//         logger.debug({ body }, 'Opensearch queryForConversations');
//         const index: DomainIndex = 'conversation';
//         const resp = await execOpenSearchCmd(`queryForConversations`, `Failed queryForConversations`, async (client: Client): Promise<OSSearchResult<ConversationOs>> => {
//             return await client.search({ index, body });
//         });
//         // We have to assume if we got back the exact number of results we asked for, there are more pages
//         const morePages = countOnly || isTermSearch ? false : resp.body.hits.hits.length === MAX_RESULTS;

//         if (result) {
//             // We're doing a real search, expect the real results
//             if (resp.body.hits.hits.length > 0) {
//                 for (let i = 0; i < resp.body.hits.hits.length; i++) {
//                     const obj = resp.body.hits.hits[i];
//                     if (obj._source) {
//                         result.conversations.push(osIndexMeta.conversation.convertFromOsToBaseType(obj._source));
//                     } else {
//                         logger.error(`Did not get _source back from opensearch for conversation ${JSON.stringify(obj)}`);
//                     }
//                     if (morePages && i === resp.body.hits.hits.length - 1) {
//                         if (obj.sort) {
//                             // If there are more pages, we need to return a scroll id
//                             result.scroll_id = buildScrollIdFromQueryAndLastHitSort(obj.sort, body);
//                         } else {
//                             logger.error(`Did not get sort back from opensearch for conversation ${JSON.stringify(obj)}`);
//                         }
//                     }
//                 }
//             }

//             // If we're doing a term search, we need to also search for messages
//             if (isTermSearch) {
//                 const query: ConversationMessageQuery = {
//                     retailer_id: accountType === 'retailer' ? accountId : undefined,
//                     supplier_id: accountType === 'supplier' ? accountId : undefined,
//                     term: q.term,
//                     test: q.test,
//                     test_type: q.test_type
//                 };
//                 const messageResult = await queryForMessages(query, accountId, accountType);
//                 await mergeConversationMessagesIntoConversations(result.conversations, messageResult.messages);
//             }

//             if (result.conversations.length > 0 && options.dontAddMsgCount === false) {
//                 await getMessageCountForConversations(result.conversations, accountId, accountType);
//             }

//             if (result.conversations.length > 0 && options.include_first_message_text === true) {
//                 const convIdToMessage = (
//                     await getFirstMessageStrings(
//                         result.conversations.map((c) => c.id),
//                         accountId,
//                         accountType
//                     )
//                 ).reduce(
//                     (obj, firstMessageStr) => {
//                         obj[firstMessageStr.conversation_id] = firstMessageStr.message;
//                         return obj;
//                     },
//                     {} as { [key: string]: string }
//                 );

//                 result.conversations.forEach((c) => {
//                     c.first_message_text = convIdToMessage[c.id];
//                 });
//             }

//             let viewed: UserViewedConversation[] | undefined;

//             if (result.conversations.length > 0 && options.include_user_viewed_data === true) {
//                 viewed = (
//                     await queryForViewed({
//                         account_id: accountId,
//                         account_type: accountType,
//                         user_id: userId,
//                         conversation_ids: result.conversations.map((c) => c.id)
//                     })
//                 ).viewed;
//                 const convIdToViewedDate = viewed.reduce(
//                     (obj, viewedConversation) => {
//                         obj[viewedConversation.conversation_id] = viewedConversation.viewed_date;
//                         return obj;
//                     },
//                     {} as { [key: string]: string }
//                 );

//                 result.conversations.forEach((c) => {
//                     c.user_viewed_date = convIdToViewedDate[c.id];
//                 });
//             }

//             if (result.conversations.length > 0 && options.include_unread_message_counts === true) {
//                 const convIdToUnreadCount = (
//                     await getUnreadMessageCounts(
//                         {
//                             conversation_ids: result.conversations.map((c) => c.id),
//                             account_id: accountId,
//                             account_type: accountType,
//                             user_id: userId
//                         },
//                         viewed
//                     )
//                 ).counts.reduce(
//                     (obj, unreadCount) => {
//                         obj[unreadCount.conversation_id] = unreadCount.count;
//                         return obj;
//                     },
//                     {} as { [key: string]: number }
//                 );

//                 result.conversations.forEach((c) => {
//                     c.unread_msg_count = convIdToUnreadCount[c.id];
//                 });
//             }

//             if (options.counts && options.counts.length > 0) {
//                 result.counts = [];
//                 for (const countParams of options.counts) {
//                     const countObj = (await queryForConversations(countParams, accountId, accountType, userId)) as ConversationCount;
//                     result.counts.push(countObj);
//                 }
//             }
//         } else if (countResult) {
//             //TODO: handle the case where we have more than 10,000 results and the eq is gte
//             // We're doing a count only search, just grab the count
//             countResult.count = getTotalValue(resp.body.hits.total);
//         } else {
//             // Won't ever get here
//         }
//     }

//     if (result) {
//         return result;
//     } else if (countResult) {
//         return countResult;
//     } else {
//         throw new GeneralError('Did not get either a normal or count result from queryForConversations');
//     }
// }

// function getTotalValue(totalObject: SearchTotalHits | number): number {
//     if (typeof totalObject === 'number') {
//         return totalObject;
//     } else {
//         return totalObject.value;
//     }
// }

// /**
//  * Whether or not a conversation exists for a given reference id.
//  */
// export async function conversationExistsForReference(accountId: string, accountType: AccountType, referenceId: string): Promise<boolean> {
//     const body: OsQuery = {
//         query: {
//             bool: {
//                 filter: [
//                     ...(accountType === 'retailer'
//                         ? [{ term: { retailer_id: accountId } }, { term: { retailer_reference_id: referenceId } }]
//                         : [{ term: { supplier_id: accountId } }, { term: { supplier_reference_id: referenceId } }])
//                 ]
//             }
//         },
//         _source: false
//     } as OsQuery;

//     logger.debug({ body }, 'Opensearch conversationExistsForReference');
//     const index: DomainIndex = 'conversation';
//     const resp = await execOpenSearchCmd(
//         `conversationExistsForReference`,
//         `Failed conversationExistsForReference`,
//         async (client: Client): Promise<OSSearchResult<Partial<ConversationOs>>> => {
//             return await client.search({ index, body });
//         }
//     );

//     return resp.body.hits.hits.length > 0;
// }

// /**
//  * Return the conversation_id of each conversation that is open that a given account has access to.
//  *
//  * Note it makes no sense to query this as the overlord account because if you did, we would be returning
//  * every single open conversation in the system regardless of account.  Right now, that seems
//  * nonsensical.  So, you need a real account ID or we're going to throw a ValidationError.
//  */
// export async function queryForOpenConversations(accountId: string, accountType: AccountType, test?: TestQueryType): Promise<string[]> {
//     const result: string[] = [];

//     //TODO: deal with getting back too many results

//     if (accountId === OVERLORD_ACCOUNT_ID) {
//         throw new ValidationError('You may not call queryForOpenConversationsForUser using the overlord account');
//     }

//     const body: OsQuery = {
//         query: {
//             bool: {
//                 filter: [accountType === 'retailer' ? { term: { retailer_id: accountId } } : { term: { supplier_id: accountId } }, { terms: { status: ['new', 'in_progress'] } }]
//             }
//         },
//         fields: ['id'],
//         _source: false,
//         sort: [{ create_date: 'desc' }],
//         search_after: undefined,
//         size: MAX_RESULTS
//     } as OsQuery;
//     const filter: OsFilterTermOrTermsQuery[] = body.query.bool.filter as OsFilterTermOrTermsQuery[];

//     // Default to only returning legit conversations
//     if (test === undefined) {
//         test = 'legit';
//     }

//     if (test !== 'all') {
//         filter.push({ term: { is_test: test !== 'legit' } });
//     } else {
//         /* don't add a filter to get back both test and legit conversations */
//     }

//     logger.debug({ body }, 'Opensearch queryForOpenConversationsForUser');
//     const index: DomainIndex = 'conversation';
//     const resp = await execOpenSearchCmd(
//         `queryForOpenConversationsForUser`,
//         `Failed queryForOpenConversationsForUser`,
//         async (client: Client): Promise<OSSearchResult<Partial<ConversationOs>>> => {
//             return await client.search({ index, body });
//         }
//     );

//     if (resp.body.hits.hits.length > 0) {
//         for (let i = 0; i < resp.body.hits.hits.length; i++) {
//             const obj = resp.body.hits.hits[i];
//             if (obj.fields) {
//                 const cid = obj.fields.id && (obj.fields.id as string[]).length > 0 ? (obj.fields.id as string[])[0] : undefined;

//                 if (cid === undefined) {
//                     throw new GeneralError(`Did not get id back in queryForOpenConversationsForUser from opensearch ${JSON.stringify(obj)}`);
//                 }
//                 result.push(cid);
//             } else {
//                 logger.error(`Did not get _source back in getFirstMessageStrings from opensearch ${JSON.stringify(obj)}`);
//             }
//         }
//     } else {
//         /* didn't find any docs in opensearch */
//     }

//     return result;
// }

// /**
//  * Return the conversation_id of each conversation that is open that a given account has access to.
//  *
//  * Note it makes no sense to query this as the overlord account because if you did, we would be returning
//  * every single open conversation in the system regardless of account.  Right now, that seems
//  * nonsensical.  So, you need a real account ID or we're going to throw a ValidationError.
//  */
// export async function queryForEvents(accountId: string, accountType: AccountType, conversationId: string): Promise<GetEventsSuccess> {
//     const result: GetEventsSuccess = {
//         events: [],
//         success: true
//     };
//     const body: OsQuery = {
//         query: {
//             bool: {
//                 filter: [{ term: { conversation_id: conversationId } }]
//             }
//         },
//         sort: [{ date: 'asc' }],
//         search_after: undefined,
//         size: MAX_RESULTS
//     } as OsQuery;
//     const filter: OsFilterTermOrTermsQuery[] = body.query.bool.filter as OsFilterTermOrTermsQuery[];

//     const accountAttrName = accountType === 'retailer' ? 'retailer_id' : 'supplier_id';
//     if (accountId !== OVERLORD_ACCOUNT_ID) {
//         filter.push({ term: { [accountAttrName]: accountId } });
//     } else {
//         // The overlord isn't filtered by account since it can search across all accounts
//     }

//     logger.debug({ body }, 'Opensearch queryForEvents');
//     const index: DomainIndex = 'event';
//     const resp = await execOpenSearchCmd(`queryForEvents`, `Failed queryForEvents`, async (client: Client): Promise<OSSearchResult<ConversationEvent>> => {
//         return await client.search({ index, body });
//     });

//     const morePages = resp.body.hits.hits.length === MAX_RESULTS;

//     if (resp.body.hits.hits.length > 0) {
//         for (let i = 0; i < resp.body.hits.hits.length; i++) {
//             const obj = resp.body.hits.hits[i];
//             if (obj._source) {
//                 result.events.push(osIndexMeta.event.convertFromOsToBaseType(obj._source));
//             } else {
//                 logger.error(`Did not get _source back from opensearch for conversation message ${JSON.stringify(obj)}`);
//             }
//             if (morePages && i === resp.body.hits.hits.length - 1) {
//                 if (obj.sort) {
//                     // If there are more pages, we need to return a scroll id
//                     result.scroll_id = buildScrollIdFromQueryAndLastHitSort(obj.sort, body);
//                 } else {
//                     logger.error(`Did not get sort back from opensearch for event ${JSON.stringify(obj)}`);
//                 }
//             }
//         }
//     } else {
//         /* didn't find any docs in opensearch */
//     }

//     return result;
// }

// /**
//  * Find conversations.
//  *
//  * @param q
//  * @param accountId
//  * @param accountType
//  * @returns
//  */
// export async function queryForMessages(q: ConversationMessageQuery, accountId: string, accountType: AccountType): Promise<ConversationMessageQueryResult> {
//     const result: ConversationMessageQueryResult = {
//         messages: [],
//         scroll_id: undefined
//     };
//     // The body of the query we will send to opensearch
//     let body: OsQuery | undefined;

//     // Make certain there is no whitespace
//     q.term = q.term?.trim();
//     const isTermSearch = q.term && q.term.length > 0;

//     if (q.scroll_id) {
//         body = getNextPageQueryFromScrollId(q.scroll_id);
//     } else {
//         // If we're querying as the overlord, that means we're allowed to act as any account and we don't
//         // require that we filter by the account ID of the calling account since the calling account
//         // is the overlord who is allowed to query on behalf of any account.  So, if we're the overlord,
//         // only add the retailer_id or supplier_id filter if it was present on the query.

//         if (accountType === 'retailer') {
//             q.retailer_id = accountId === OVERLORD_ACCOUNT_ID ? q.retailer_id : accountId;
//         } else {
//             q.supplier_id = accountId === OVERLORD_ACCOUNT_ID ? q.supplier_id : accountId;
//         }

//         body = {
//             query: {
//                 bool: {
//                     filter: []
//                 }
//             },
//             sort: [],
//             search_after: undefined,
//             size: MAX_RESULTS
//         };
//         const filter: OsFilterTermOrTermsQuery[] = body.query.bool.filter as OsFilterTermOrTermsQuery[];

//         if (isTermSearch) {
//             body.query.bool.must = [{ simple_query_string: { query: prepareSearchTerm(q.term!), fields: ['all_text'], default_operator: 'and' } }];
//             body.size = MAX_TERM_SEARCH_RESULTS;
//         }

//         // Default to only returning legit conversations
//         if (q.test === undefined) {
//             q.test = 'legit';
//         }

//         if (q.test !== 'all') {
//             filter.push({ term: { is_test: q.test !== 'legit' } });
//         } else {
//             /* don't add a filter to get back both test and legit conversations */
//         }

//         addQueryFilterTermFromObj<ConversationMessageQuery>(q, 'id', filter);
//         addQueryFilterTermFromObj<ConversationMessageQuery>(q, 'conversation_id', filter);
//         addQueryFilterTermFromObj<ConversationMessageQuery>(q, 'retailer_reference_id', filter);
//         addQueryFilterTermFromObj<ConversationMessageQuery>(q, 'supplier_reference_id', filter);
//         addQueryFilterTermFromObj<ConversationMessageQuery>(q, 'retailer_id', filter);
//         addQueryFilterTermFromObj<ConversationMessageQuery>(q, 'supplier_id', filter);
//         addQueryFilterTermFromObj<ConversationMessageQuery>(q, 'user_id', filter);
//         addQueryFilterTermFromObj<ConversationMessageQuery>(q, 'sent_by_account', filter);
//         addQueryFilterTermFromObj<ConversationMessageQuery>(q, 'received_by_account', filter);
//         addQueryFilterTermFromObj<ConversationMessageQuery>(q, 'internal_conversation_id', filter);

//         if (q.account_ids && q.account_ids.length > 0) {
//             if (accountType === 'retailer') {
//                 filter.push({ terms: { supplier_id: q.account_ids } });
//             } else {
//                 filter.push({ terms: { retailer_id: q.account_ids } });
//             }
//         }

//         if (q.type) {
//             if (!q.type.type) {
//                 throw new ValidationError(`if query.type is provided then query.type.type is required`);
//             }
//             addQueryFilterTermFromObjWithSubKey<ConversationMessageQuery>(q, 'type', 'type', filter);

//             if (q.type.customer_care_type) {
//                 addQueryFilterTermFromObjWithSubKey<ConversationMessageQuery>(q, 'type', 'customer_care_type', filter);
//             }

//             if (q.type.consumer_id) {
//                 addQueryFilterTermFromObjWithSubKey<ConversationMessageQuery>(q, 'type', 'consumer_id', filter);
//             }
//         }

//         if (q.created_since) {
//             if (q.until) {
//                 filter.push({ range: { create_date: { gte: q.created_since, lt: q.until } } } as unknown as OsFilterTermOrTermsQuery);
//             } else {
//                 filter.push({ range: { create_date: { gte: q.created_since } } } as unknown as OsFilterTermOrTermsQuery);
//             }
//         }

//         if (!isTermSearch) {
//             const sort: OsSort[] = body.sort as OsSort[];
//             const convSort: ConversationSort[] = q.sort ?? [{ field: 'create_date', direction: 'asc' }];
//             convSort.forEach((sortItem) => {
//                 sort.push({ [sortItem.field]: sortItem.direction });
//             });
//         }
//     }
//     /*
//         Get all messages
//         {
//             query: {
//                 match_all: {}
//             },
//             sort: [],
//             search_after: undefined,
//             size: MAX_RESULTS
//         }
//     */

//     if (body) {
//         logger.debug({ body }, 'Opensearch queryForConversationMessages');
//         const index: DomainIndex = 'message';
//         const resp = await execOpenSearchCmd(
//             `queryForConversationMessages`,
//             `Failed queryForConversationMessages`,
//             async (client: Client): Promise<OSSearchResult<ConversationMessageOs>> => {
//                 return await client.search({ index, body });
//             }
//         );
//         // We have to assume if we got back the exact number of results we asked for, there are more pages
//         const morePages = isTermSearch ? false : resp.body.hits.hits.length === MAX_RESULTS;

//         if (resp.body.hits.hits.length > 0) {
//             for (let i = 0; i < resp.body.hits.hits.length; i++) {
//                 const obj = resp.body.hits.hits[i];
//                 if (obj._source) {
//                     result.messages.push(osIndexMeta.message.convertFromOsToBaseType(obj._source));
//                 } else {
//                     logger.error(`Did not get _source back from opensearch for conversation message ${JSON.stringify(obj)}`);
//                 }
//                 if (morePages && i === resp.body.hits.hits.length - 1) {
//                     if (obj.sort) {
//                         // If there are more pages, we need to return a scroll id
//                         result.scroll_id = buildScrollIdFromQueryAndLastHitSort(obj.sort, body);
//                     } else {
//                         logger.error(`Did not get sort back from opensearch for conversation message ${JSON.stringify(obj)}`);
//                     }
//                 }
//             }
//         } else {
//             /* didn't find any docs in opensearch */
//         }
//     } else {
//         // Already did a search and have results
//     }

//     return result;
// }

// /**
//  * This is an internal method that assumes you know that it's OK to get these conversations and use them on behalf
//  * of a user as it does not restriction based on account IDs. It simpy returns all conversations that match
//  * one of the IDs and it also doesn't enrich the conversations in any way.  It just gets them.
//  *
//  * This API expects that the list of conversations you are requesting is small enough that it won't require that
//  * you page and so doesn't deal with paging.
//  */
// async function getConversationsByIds(conversationIds: string[]): Promise<Conversation[]> {
//     const result: Conversation[] = [];

//     //TODO: deal with getting back too many results

//     const body: OsQuery = {
//         query: {
//             bool: {
//                 filter: [{ terms: { id: conversationIds } }]
//             }
//         },
//         sort: [{ create_date: 'desc' }],
//         search_after: undefined,
//         size: MAX_RESULTS
//     } as OsQuery;

//     logger.debug({ body }, 'Opensearch getConversationsByIds');
//     const index: DomainIndex = 'conversation';
//     const resp = await execOpenSearchCmd(`getConversationsByIds`, `Failed getConversationsByIds`, async (client: Client): Promise<OSSearchResult<ConversationOs>> => {
//         return await client.search({ index, body });
//     });

//     if (resp.body.hits.hits.length > 0) {
//         for (let i = 0; i < resp.body.hits.hits.length; i++) {
//             const obj = resp.body.hits.hits[i];
//             if (obj._source) {
//                 result.push(osIndexMeta.conversation.convertFromOsToBaseType(obj._source));
//             } else {
//                 logger.error(`Did not get _source back from opensearch for conversation ${JSON.stringify(obj)}`);
//             }
//         }
//     } else {
//         /* didn't find any docs in opensearch */
//     }

//     return result;
// }

// /**
//  * Take the messages and make sure that there's a conversation for each one in the list of conversations.  If there isn't
//  * go get the conversation and add it to the list of conversations at the bottom of the list.
//  */
// async function mergeConversationMessagesIntoConversations(conversations: Conversation[], messages: ConversationMessage[]) {
//     const conversationIds = new Set<string>();
//     conversations.forEach((c) => conversationIds.add(c.id));

//     const conversationsToRetrieve = new Set<string>();
//     messages.forEach((m) => {
//         if (!conversationIds.has(m.conversation_id)) {
//             conversationsToRetrieve.add(m.conversation_id);
//         }
//     });

//     // Go get the conversations that we don't have
//     if (conversationsToRetrieve.size > 0) {
//         const conversationsToAdd = await getConversationsByIds(Array.from(conversationsToRetrieve));
//         conversations.push(...conversationsToAdd);
//     }
// }

/**
 * Add a term filter to the query if the object has a value for the key
 *
 * @param obj
 * @param key
 * @param filter
 */
function addQueryFilterTermFromObj<T>(obj: T, key: keyof T, filter: OsFilterTermOrTermsQuery[]) {
    if (obj[key]) {
        filter.push({ term: { [key]: obj[key] } });
    }
}

/**
 * Add a term filter to the query if the object has a value for the key and subkey
 * so key: type and subKey: message_type would be looking for
 * type.message_type in the object.
 *
 * @param obj
 * @param key
 * @param subKey
 * @param filter
 */
function addQueryFilterTermFromObjWithSubKey<T>(obj: T, key: keyof T, subKey: string, filter: OsFilterTermOrTermsQuery[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    if (obj[key] && (obj[key] as any)[subKey]) {
        const term = `${String(key)}.${subKey}`;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        const value = (obj[key] as any)[subKey];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        filter.push({ term: { [term]: value } });
    }
}

/**
 * Handle changes to chat sessions from DynamoDB change stream.
 * For updates, we carefully preserve any existing feedback array in OpenSearch.
 */
export async function chatSessionUpdated(obj: {
    newObjects?: ChatSession<RecordOrUndef>[];
    updatedObjects?: ChatSession<RecordOrUndef>[];
    deletedObjects?: ChatSession<RecordOrUndef>[];
}): Promise<void> {
    const work: OsWork[] = [];

    // Handle new sessions - simple inserts
    if (obj.newObjects && obj.newObjects.length > 0) {
        work.push(...obj.newObjects);
    }

    // Handle deleted sessions - simple deletes
    if (obj.deletedObjects && obj.deletedObjects.length > 0) {
        for (const session of obj.deletedObjects) {
            work.push({
                op: 'delete',
                id: session.sessionId,
                index: 'session'
            });
        }
    }

    // Handle updated sessions - partial updates to preserve feedback array
    if (obj.updatedObjects && obj.updatedObjects.length > 0) {
        for (const session of obj.updatedObjects) {
            // Convert to snake_case for OpenSearch, but exclude feedback field
            const converted = osIndexMeta.session.convertToOsType(session);
            const { feedback, ...partialDoc } = converted as ChatSessionOs<RecordOrUndef>;

            work.push({
                op: 'partialUpdate',
                id: session.sessionId,
                index: 'session',
                doc: partialDoc as ChatSessionOs<RecordOrUndef>
            });
        }
    }

    if (work.length > 0) {
        await doMicroBatchWork(work);
        console.debug(`Processed ${work.length} chat session changes in OpenSearch`);
    }
}

/**
 * Handle changes to chat session feedback from DynamoDB change stream.
 * This manages the feedback array within session documents in OpenSearch.
 */
export async function chatSessionFeedbackChanged(obj: {
    newObjects?: ChatSessionFeedback[];
    updatedObjects?: ChatSessionFeedback[];
    deletedObjects?: ChatSessionFeedback[];
}): Promise<void> {
    const work: OsWork[] = [];

    // Handle new feedback - add to feedback array
    if (obj.newObjects && obj.newObjects.length > 0) {
        for (const feedback of obj.newObjects) {
            const converted = convertToSnakeCase(feedback);
            work.push(createAddFeedbackOperation(feedback.sessionId, converted));
        }
    }

    // Handle updated feedback - update item in feedback array
    if (obj.updatedObjects && obj.updatedObjects.length > 0) {
        for (const feedback of obj.updatedObjects) {
            const converted = convertToSnakeCase(feedback);
            work.push(createUpdateFeedbackOperation(feedback.sessionId, converted, feedback.feedbackId));
        }
    }

    // Handle deleted feedback - remove from feedback array
    if (obj.deletedObjects && obj.deletedObjects.length > 0) {
        for (const feedback of obj.deletedObjects) {
            work.push(createRemoveFeedbackOperation(feedback.sessionId, feedback.feedbackId));
        }
    }

    if (work.length > 0) {
        await doMicroBatchWork(work);
        console.debug(`Processed ${work.length} chat session feedback changes in OpenSearch`);
    }
}

/**
 * Create a script-based partial update for adding feedback to a session
 */
function createAddFeedbackOperation(sessionId: string, feedback: any): PartialUpdateOp {
    return {
        op: 'partialUpdate',
        id: sessionId,
        index: 'session',
        script: {
            source: `
                if (ctx._source.feedback == null) {
                    ctx._source.feedback = [];
                }
                boolean exists = false;
                for (int i = 0; i < ctx._source.feedback.length; i++) {
                    if (ctx._source.feedback[i].feedback_id == params.feedback.feedback_id) {
                        // Replace existing entry to ensure idempotency
                        ctx._source.feedback[i] = params.feedback;
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    ctx._source.feedback.add(params.feedback);
                }
                ctx._source.last_index_date = params.currentDate;
            `,
            params: {
                feedback,
                currentDate: new Date().toISOString()
            }
        }
    };
}

/**
 * Create a script-based partial update for updating feedback in a session
 */
function createUpdateFeedbackOperation(sessionId: string, feedback: any, feedbackId: string): PartialUpdateOp {
    return {
        op: 'partialUpdate',
        id: sessionId,
        index: 'session',
        script: {
            source: `
                if (ctx._source.feedback != null) {
                    for (int i = 0; i < ctx._source.feedback.length; i++) {
                        if (ctx._source.feedback[i].feedback_id == params.feedbackId) {
                            ctx._source.feedback[i] = params.feedback;
                            break;
                        }
                    }
                }
                ctx._source.last_index_date = params.currentDate;
            `,
            params: {
                feedback,
                feedbackId,
                currentDate: new Date().toISOString()
            }
        }
    };
}

/**
 * Create a script-based partial update for removing feedback from a session
 */
function createRemoveFeedbackOperation(sessionId: string, feedbackId: string): PartialUpdateOp {
    return {
        op: 'partialUpdate',
        id: sessionId,
        index: 'session',
        script: {
            source: `
                if (ctx._source.feedback != null) {
                    ctx._source.feedback.removeIf(item -> item.feedback_id == params.feedbackId);
                }
                ctx._source.last_index_date = params.currentDate;
            `,
            params: {
                feedbackId,
                currentDate: new Date().toISOString()
            }
        }
    };
}
