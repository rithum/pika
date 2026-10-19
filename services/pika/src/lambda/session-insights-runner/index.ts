import { ConditionalCheckFailedException, DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { ChatSession, ChatSessionFeedback, ChatSessionLiteForUpdate, RecordOrUndef } from 'pika-shared/types/chatbot/chatbot-types';
import { Context } from 'aws-lambda';
import chunk from 'lodash.chunk';
import pMap from 'p-map';
import pRetry, { AbortError } from 'p-retry';
import { addChatSessionFeedback } from '../../lib/chat-admin-apis';
import { getSessionsThatNeedInsightsAnalysisIterator, setSessionsInsightsAnalysisInBatch } from '../../lib/chat-admin-ddb';
import { getChatSessionByUserIdAndSessionId } from '../../lib/chat-ddb';
import { getSessionQualityHooks, safeHook } from '../../lib/session-quality';
import type { PendingNotification, SessionQualityHooks } from '../../lib/session-quality-base';
import { analyzeSession } from './insights-analyzer';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const LOCK_NAME = 'session-insights-runner';
const START_FLOOR_LOCK_NAME = 'session-insights-runner#start-floor';
const LOCK_TTL_MINUTES = 20; // Longer than lambda timeout for safety

interface PipelineConfig {
    queryPageSize: number; // DynamoDB pagination: 100-500
    insightBatchSize: number; // Parallel insight generation within page: 5-15
    dbBatchSize: number; // Frequent flush threshold: 10-15
    insightConcurrency: number; // Concurrent insights within batch: 2-5
    feedbackConcurrency: number; // Concurrent feedback writes: 2-5
    timeoutBufferMs: number; // Reserve time buffer: 30000 (30s)
    maxRetries: number; // Per operation: 3
    chatAppAllowlist: Set<string> | undefined; // undefined = every chat app
    insightsStartFloor?: string; // ISO date: only sweep sessions active on/after this
}

interface ProcessingResults {
    totalProcessed: number;
    totalFailed: number;
    errors: string[];
}

export async function handler(_event: { sessionId?: string; userId?: string } | undefined, context: Context) {
    console.log('Session insights runner started at:', new Date().toISOString());

    if (!process.env.SESSION_RUNNER_MUTEX_TABLE) {
        console.error('SESSION_RUNNER_MUTEX_TABLE is not set');
        throw new Error('SESSION_RUNNER_MUTEX_TABLE is not set');
    }

    if (!process.env.WAIT_TO_COMPUTE_INSIGHTS_MS) {
        console.error('WAIT_TO_COMPUTE_INSIGHTS_MS is not set');
        throw new Error('WAIT_TO_COMPUTE_INSIGHTS_MS is not set');
    }

    if (!process.env.AWS_REGION) {
        console.error('AWS_REGION is not set');
        throw new Error('AWS_REGION is not set');
    }

    // Explicit session invoke bypasses the sweep gates and the start floor, but shares the sweep lock so a session is never analyzed twice at once.
    if (_event?.sessionId && _event?.userId) {
        console.log(`[SINGLE-SESSION] Manual invocation for session: ${_event.sessionId}, user: ${_event.userId}`);
        if (!(await acquireLock(LOCK_NAME, context.awsRequestId))) {
            console.warn(`[SINGLE-SESSION] Sweep lock held; not analyzing session ${_event.sessionId}`);
            return { busy: true, sessionId: _event.sessionId };
        }
        try {
            return await runSingleSession(_event.userId, _event.sessionId);
        } finally {
            await releaseLock(LOCK_NAME);
        }
    }

    const hooks = getSessionQualityHooks();
    if (!(await safeHook('isSweepEnabled', () => hooks.isSweepEnabled(), false))) {
        console.log('[CONFIG] scheduled insights sweep disabled; skipping');
        return;
    }

    // Try to acquire lock
    const lockAcquired = await acquireLock(LOCK_NAME, context.awsRequestId);
    if (!lockAcquired) {
        console.log('Another instance is already running. Exiting gracefully.');
        return;
    }

    try {
        console.log('Lock acquired. Starting insights processing...');

        // Check NOOP_EXECUTION first
        if (process.env.NOOP_EXECUTION === '1' || process.env.NOOP_EXECUTION === 'true') {
            console.log('NOOP_EXECUTION is set - skipping processing');
            return;
        }

        const insightsStartFloor = await resolveStartFloor(hooks);
        if (insightsStartFloor === null) {
            return;
        }
        const chatAppAllowlist = await safeHook('getChatAppAllowlist', () => hooks.getChatAppAllowlist(), new Set<string>());
        if (chatAppAllowlist && chatAppAllowlist.size === 0) {
            console.warn('[CONFIG] chat-app allowlist is empty; skipping sweep');
            return;
        }
        if (chatAppAllowlist) {
            console.log(`[CONFIG] chat-app allowlist has ${chatAppAllowlist.size} entries: ${[...chatAppAllowlist].join(', ')}`);
        }

        // Calculate date based on WAIT_TO_COMPUTE_INSIGHTS_MS
        const waitTime = parseInt(process.env.WAIT_TO_COMPUTE_INSIGHTS_MS || '3600000'); // 1 hour default
        const cutoffDate = new Date(Date.now() - waitTime);

        // Calculate 20% timeout buffer as specified in requirements
        const timeoutBufferMs = Math.floor(context.getRemainingTimeInMillis() * 0.2);

        console.log(`Processing sessions with messages before: ${cutoffDate.toISOString()}`);
        console.log(`Timeout buffer: ${timeoutBufferMs}ms (20% of ${context.getRemainingTimeInMillis()}ms)`);

        // Configure hybrid pipeline with optimized values
        const config: PipelineConfig = {
            queryPageSize: 200, // DynamoDB pagination - good balance
            insightBatchSize: 10, // Bedrock API calls - conservative for rate limits
            dbBatchSize: 12, // Frequent flush threshold - reduced for atomicity
            insightConcurrency: 3, // Concurrent Bedrock calls - conservative
            feedbackConcurrency: 3, // Concurrent feedback writes - matches session processing
            timeoutBufferMs,
            maxRetries: 3,
            chatAppAllowlist,
            insightsStartFloor
        };

        // Run the hybrid pipeline
        const results = await processInsightsWithPipeline(cutoffDate, config, context);
        console.log('Hybrid pipeline completed successfully:', results);
    } catch (error) {
        console.error('Hybrid pipeline failed:', error);
    } finally {
        // Always release the lock
        await releaseLock(LOCK_NAME);
    }
}

async function runSingleSession(userId: string, sessionId: string): Promise<{ found: boolean; sessionId: string }> {
    const session = await getChatSessionByUserIdAndSessionId(userId, sessionId);
    if (!session) {
        console.warn(`[SINGLE-SESSION] Session not found: userId=${userId} sessionId=${sessionId}`);
        return { found: false, sessionId };
    }
    const feedbackBatch: ChatSessionFeedback[] = [];
    const outcome = await analyzeSession(session, feedbackBatch);
    const sessionUpdates = new Map<string, ChatSessionLiteForUpdate>();
    const pendingNotifications = new Map<string, PendingNotification>();
    if (outcome.update) sessionUpdates.set(session.sessionId, outcome.update);
    if (outcome.notification) pendingNotifications.set(session.sessionId, outcome.notification);
    if (sessionUpdates.size > 0 || feedbackBatch.length > 0) {
        const singleConfig: PipelineConfig = {
            queryPageSize: 1,
            insightBatchSize: 1,
            dbBatchSize: 1,
            insightConcurrency: 1,
            feedbackConcurrency: 1,
            timeoutBufferMs: 0,
            maxRetries: 3,
            chatAppAllowlist: undefined
        };
        await flushPendingBatches(sessionUpdates, feedbackBatch, singleConfig, pendingNotifications);
    }
    console.log(`[SINGLE-SESSION] Finished session: ${sessionId}`);
    return { found: true, sessionId };
}

export async function resolveStartFloor(hooks: SessionQualityHooks): Promise<string | null> {
    let fromHook: string | undefined;
    try {
        fromHook = await hooks.getSweepStartFloor();
    } catch (err) {
        console.error('[SESSION-QUALITY] getSweepStartFloor threw; skipping sweep', err);
        return null;
    }
    if (fromHook) return fromHook;
    if (process.env.INSIGHTS_START_FLOOR) return process.env.INSIGHTS_START_FLOOR;

    const readFloor = async (): Promise<string | undefined> => {
        const existing = await dynamoClient.send(
            new GetItemCommand({
                TableName: process.env.SESSION_RUNNER_MUTEX_TABLE!,
                Key: { lock_name: { S: START_FLOOR_LOCK_NAME } },
                ConsistentRead: true
            })
        );
        return existing.Item?.floor?.S;
    };

    try {
        const stamped = await readFloor();
        if (stamped) return stamped;

        const floor = new Date().toISOString();
        try {
            await dynamoClient.send(
                new PutItemCommand({
                    TableName: process.env.SESSION_RUNNER_MUTEX_TABLE!,
                    // No ttl attribute: the lock TTL would otherwise expire the floor.
                    Item: { lock_name: { S: START_FLOOR_LOCK_NAME }, floor: { S: floor } },
                    ConditionExpression: 'attribute_not_exists(lock_name)'
                })
            );
            return floor;
        } catch (error) {
            if (!(error instanceof ConditionalCheckFailedException)) throw error;
            const raced = await readFloor();
            if (raced) return raced;
            throw new Error('start floor item missing after conditional check failure');
        }
    } catch (error) {
        console.error('[CONFIG] start floor unavailable; skipping sweep', error);
        return null;
    }
}

async function acquireLock(lockName: string, executionId: string): Promise<boolean> {
    const ttl = Math.floor(Date.now() / 1000) + LOCK_TTL_MINUTES * 60;

    try {
        await dynamoClient.send(
            new PutItemCommand({
                TableName: process.env.SESSION_RUNNER_MUTEX_TABLE!,
                Item: {
                    lock_name: { S: lockName },
                    owner: { S: executionId },
                    acquired_at: { S: new Date().toISOString() },
                    ttl: { N: ttl.toString() }
                },
                ConditionExpression: 'attribute_not_exists(lock_name)' // Only create if doesn't exist
            })
        );

        console.log(`Lock acquired successfully by ${executionId}`);
        return true;
    } catch (error) {
        if (error instanceof ConditionalCheckFailedException) {
            console.log('Lock is already held by another instance');
            return false;
        }
        console.error('Error acquiring lock:', error);
        throw error;
    }
}

async function releaseLock(lockName: string): Promise<void> {
    try {
        await dynamoClient.send(
            new DeleteItemCommand({
                TableName: process.env.SESSION_RUNNER_MUTEX_TABLE!,
                Key: {
                    lock_name: { S: lockName }
                }
            })
        );
        console.log('Lock released successfully');
    } catch (error) {
        console.error('Error releasing lock:', error);
        // Don't throw - rely on TTL for cleanup
    }
}

export async function processInsightsWithPipeline(date: Date, config: PipelineConfig, context: Context): Promise<ProcessingResults> {
    console.log('Starting hybrid insights processing pipeline', {
        date: date.toISOString(),
        config
    });

    const results = {
        totalProcessed: 0,
        totalFailed: 0,
        errors: [] as string[]
    };

    const getRemainingTimeInMillis = () => context.getRemainingTimeInMillis();

    // Stage 1: Get session pages
    const sessionPages = getSessionsThatNeedInsightsAnalysisIterator(date, config.queryPageSize, getRemainingTimeInMillis, config.timeoutBufferMs, config.insightsStartFloor);

    // Stage 2-4: Process each page through the hybrid pipeline
    for await (const sessionPage of sessionPages) {
        // Check timeout before processing each page
        if (context.getRemainingTimeInMillis() < config.timeoutBufferMs) {
            console.log('Stopping pipeline early - timeout approaching');
            break;
        }

        try {
            console.log(`[PIPELINE] Processing page with ${sessionPage.length} sessions...`);
            const pageResults = await processPageWithAtomicCompletion(sessionPage, config, context, config.chatAppAllowlist);
            results.totalProcessed += pageResults.processed;
            results.totalFailed += pageResults.failed;
            results.errors.push(...pageResults.errors);

            console.log(`[PIPELINE] Page processed: ${pageResults.processed} successful, ${pageResults.failed} failed`);
        } catch (error) {
            const errorMsg = `Page processing failed: ${error instanceof Error ? error.message : String(error)}`;
            console.error(`[PIPELINE] ${errorMsg}`);
            results.errors.push(errorMsg);
            results.totalFailed += sessionPage.length;
        }
    }

    console.log('Hybrid pipeline complete', results);
    return results;
}

export async function processPageWithAtomicCompletion(
    sessions: ChatSession<RecordOrUndef>[],
    config: PipelineConfig,
    context: Context,
    chatAppAllowlist: Set<string> | undefined
): Promise<{ processed: number; failed: number; errors: string[] }> {
    const results = { processed: 0, failed: 0, errors: [] as string[] };

    // Small batch collections that get flushed frequently
    const sessionUpdates = new Map<string, ChatSessionLiteForUpdate>();
    const pendingNotifications = new Map<string, PendingNotification>();
    const feedbackBatch: ChatSessionFeedback[] = [];

    // Process insights in controlled batches, but with atomic completion per session
    const insightBatches = chunk(sessions, config.insightBatchSize);

    for (const batch of insightBatches) {
        if (context.getRemainingTimeInMillis() < config.timeoutBufferMs) {
            console.log('Stopping batch processing - timeout approaching. Flushing pending batches...');
            results.processed += await flushPendingBatches(sessionUpdates, feedbackBatch, config, pendingNotifications);
            break;
        }

        try {
            console.log(`[BATCH] Processing insight batch with ${batch.length} sessions (concurrency: ${config.insightConcurrency})`);
            const flushedDuringBatch = await pMap(
                batch,
                async (session): Promise<number> => {
                    if (chatAppAllowlist && !chatAppAllowlist.has(session.chatAppId)) {
                        console.log(`[BATCH] Skipping session ${session.sessionId} (chatAppId=${session.chatAppId} not in allowlist) — clearing insight_status`);
                        sessionUpdates.set(session.sessionId, {
                            userId: session.userId,
                            sessionId: session.sessionId,
                            lastAnalyzedMessageId: undefined,
                            insightStatus: null,
                            insightsS3Url: undefined
                        });
                        return sessionUpdates.size >= config.dbBatchSize ? flushPendingBatches(sessionUpdates, feedbackBatch, config, pendingNotifications) : 0;
                    }
                    console.log(`[BATCH] Starting session: ${session.sessionId}`);
                    return processSessionAtomically(session, sessionUpdates, feedbackBatch, pendingNotifications, config, context);
                },
                { concurrency: config.insightConcurrency }
            );
            results.processed += flushedDuringBatch.reduce((sum, n) => sum + n, 0);

            console.log(`[BATCH] Insight batch completed: ${batch.length} sessions processed`);
        } catch (error) {
            console.error(`[BATCH] Insight generation batch failed:`, error);
            results.failed += batch.length;
            results.errors.push(`Insight batch error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Final flush of any remaining items
    if (sessionUpdates.size > 0 || feedbackBatch.length > 0) {
        try {
            // A successful flush empties the map, so count from its return value.
            results.processed += await flushPendingBatches(sessionUpdates, feedbackBatch, config, pendingNotifications);
        } catch (error) {
            console.error('Final batch flush failed:', error);
            results.failed += sessionUpdates.size;
            results.errors.push(`Final flush error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    console.log(`Page processing complete: ${results.processed} successful, ${results.failed} failed`);
    return results;
}

/**
 * Process a single session atomically - either fully complete or leave untouched
 * Includes automatic batch flushing when thresholds are reached
 */
async function processSessionAtomically(
    session: ChatSession<RecordOrUndef>,
    sessionUpdates: Map<string, ChatSessionLiteForUpdate>,
    feedbackBatch: ChatSessionFeedback[],
    pendingNotifications: Map<string, PendingNotification>,
    config: PipelineConfig,
    context: Context
): Promise<number> {
    return pRetry(
        async () => {
            // Critical timeout check before each session
            if (context.getRemainingTimeInMillis() < Math.max(config.timeoutBufferMs, 10000)) {
                throw new AbortError('Lambda timeout approaching - stopping session processing');
            }

            // Step 1: Do the analysis (S3 write happens here immediately)
            console.log(`[SESSION] Analyzing session: ${session.sessionId}`);
            const outcome = await analyzeSession(session, feedbackBatch);
            if (outcome.update) {
                sessionUpdates.set(session.sessionId, outcome.update);
            }
            if (outcome.notification) {
                pendingNotifications.set(session.sessionId, outcome.notification);
            } else {
                pendingNotifications.delete(session.sessionId);
            }
            console.log(`[SESSION] Analysis completed for session: ${session.sessionId}`);

            // Step 2: Check if we need to flush batches to prevent memory accumulation
            // and ensure timely processing. Return the count flushed so mid-batch flushes stay in `processed`.
            if (sessionUpdates.size >= config.dbBatchSize) {
                console.log(`[SESSION] Flushing batches - reached threshold of ${config.dbBatchSize} items`);
                return await flushPendingBatches(sessionUpdates, feedbackBatch, config, pendingNotifications);
            }
            return 0;
        },
        {
            retries: 3,
            factor: 2,
            minTimeout: 1000,
            maxTimeout: 5000,
            onFailedAttempt: (error) => {
                console.log(`Session processing retry for ${session.sessionId}:`, error.message);
            }
        }
    );
}

/** Persists the current batch, then sends only the flushed sessions' notifications; returns the count persisted. */
async function flushPendingBatches(
    sessionUpdates: Map<string, ChatSessionLiteForUpdate>,
    feedbackBatch: ChatSessionFeedback[],
    config: PipelineConfig,
    pendingNotifications: Map<string, PendingNotification>
): Promise<number> {
    if (sessionUpdates.size === 0 && feedbackBatch.length === 0) {
        return 0;
    }

    // Claim the batch up front: sessions run concurrently, so another flush can start while this one awaits DynamoDB.
    const flushedIds = [...sessionUpdates.keys()];
    const updates = flushedIds.map((id) => sessionUpdates.get(id)!);
    sessionUpdates.clear();
    const feedbackSlice = feedbackBatch.splice(0, feedbackBatch.length);
    console.log(`Flushing ${updates.length} session updates and ${feedbackSlice.length} feedback records`);

    try {
        await Promise.all([
            updates.length > 0 ? setSessionsInsightsAnalysisInBatch(updates) : Promise.resolve(),
            feedbackSlice.length > 0 ? processFeedbackBatch(feedbackSlice, config) : Promise.resolve()
        ]);
    } catch (error) {
        console.error('Batch flush failed:', error);
        flushedIds.forEach((id, i) => {
            if (!sessionUpdates.has(id)) sessionUpdates.set(id, updates[i]);
        });
        feedbackBatch.unshift(...feedbackSlice);
        throw error;
    }

    console.log(`Successfully flushed ${updates.length} sessions and ${feedbackSlice.length} feedback records`);
    // A session re-queued while this flush was in flight keeps its notification for the flush that writes its newer entry.
    const settledIds = flushedIds.filter((id) => !sessionUpdates.has(id));

    const toSend: PendingNotification[] = [];
    for (const id of settledIds) {
        const n = pendingNotifications.get(id);
        if (n) {
            toSend.push(n);
            pendingNotifications.delete(id);
        }
    }
    await Promise.all(toSend.map((n) => safeHook('PendingNotification.send', () => n.send(), undefined)));

    return updates.length;
}

/**
 * Process feedback records with controlled concurrency to avoid DDB throttling
 */
async function processFeedbackBatch(feedbackRecords: ChatSessionFeedback[], config: PipelineConfig): Promise<void> {
    if (feedbackRecords.length === 0) return;

    // Use controlled concurrency similar to existing session batch processing
    await pMap(feedbackRecords, (feedback) => addChatSessionFeedback(feedback), {
        concurrency: config.feedbackConcurrency,
        stopOnError: false // Continue processing other feedback even if one fails
    });
}
