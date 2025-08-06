import { ConditionalCheckFailedException, DynamoDBClient, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { ChatSession, ChatSessionFeedback, ChatSessionLiteForUpdate, RecordOrUndef } from '@pika/shared/types/chatbot/chatbot-types';
import { Context } from 'aws-lambda';
import chunk from 'lodash.chunk';
import pMap from 'p-map';
import pRetry, { AbortError } from 'p-retry';
import { addChatSessionFeedback } from '../../lib/chat-admin-apis';
import { getSessionsThatNeedInsightsAnalysisIterator, setSessionsInsightsAnalysisInBatch } from '../../lib/chat-admin-ddb';
import { analyzeSession } from './insights-analyzer';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const LOCK_NAME = 'session-insights-runner';
const LOCK_TTL_MINUTES = 20; // Longer than lambda timeout for safety

interface PipelineConfig {
    queryPageSize: number; // DynamoDB pagination: 100-500
    insightBatchSize: number; // Parallel insight generation within page: 5-15
    dbBatchSize: number; // Frequent flush threshold: 10-15
    insightConcurrency: number; // Concurrent insights within batch: 2-5
    feedbackConcurrency: number; // Concurrent feedback writes: 2-5
    timeoutBufferMs: number; // Reserve time buffer: 30000 (30s)
    maxRetries: number; // Per operation: 3
}

interface ProcessingResults {
    totalProcessed: number;
    totalFailed: number;
    errors: string[];
}

export async function handler(_event: any, context: Context) {
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
            maxRetries: 3
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
    const sessionPages = getSessionsThatNeedInsightsAnalysisIterator(date, config.queryPageSize, getRemainingTimeInMillis, config.timeoutBufferMs);

    // Stage 2-4: Process each page through the hybrid pipeline
    for await (const sessionPage of sessionPages) {
        // Check timeout before processing each page
        if (context.getRemainingTimeInMillis() < config.timeoutBufferMs) {
            console.log('Stopping pipeline early - timeout approaching');
            break;
        }

        try {
            console.log(`[PIPELINE] Processing page with ${sessionPage.length} sessions...`);
            const pageResults = await processPageWithAtomicCompletion(sessionPage, config, context);
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

async function processPageWithAtomicCompletion(
    sessions: ChatSession<RecordOrUndef>[],
    config: PipelineConfig,
    context: Context
): Promise<{ processed: number; failed: number; errors: string[] }> {
    const results = { processed: 0, failed: 0, errors: [] as string[] };

    // Small batch arrays that get flushed frequently
    const sessionUpdateBatch: ChatSessionLiteForUpdate[] = [];
    const feedbackBatch: ChatSessionFeedback[] = [];

    // Process insights in controlled batches, but with atomic completion per session
    const insightBatches = chunk(sessions, config.insightBatchSize);

    for (const batch of insightBatches) {
        if (context.getRemainingTimeInMillis() < config.timeoutBufferMs) {
            console.log('Stopping batch processing - timeout approaching. Flushing pending batches...');
            await flushPendingBatches(sessionUpdateBatch, feedbackBatch, config);
            break;
        }

        try {
            console.log(`[BATCH] Processing insight batch with ${batch.length} sessions (concurrency: ${config.insightConcurrency})`);
            // Process batch with controlled concurrency, but ensure atomic completion
            await pMap(
                batch,
                (session) => {
                    console.log(`[BATCH] Starting session: ${session.sessionId}`);
                    return processSessionAtomically(session, sessionUpdateBatch, feedbackBatch, config, context);
                },
                { concurrency: config.insightConcurrency }
            );

            console.log(`[BATCH] Insight batch completed: ${batch.length} sessions processed`);
        } catch (error) {
            console.error(`[BATCH] Insight generation batch failed:`, error);
            results.failed += batch.length;
            results.errors.push(`Insight batch error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Final flush of any remaining items
    if (sessionUpdateBatch.length > 0 || feedbackBatch.length > 0) {
        try {
            await flushPendingBatches(sessionUpdateBatch, feedbackBatch, config);
            results.processed += sessionUpdateBatch.length; // These were successfully flushed
        } catch (error) {
            console.error('Final batch flush failed:', error);
            results.failed += sessionUpdateBatch.length;
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
    sessionBatch: ChatSessionLiteForUpdate[],
    feedbackBatch: ChatSessionFeedback[],
    config: PipelineConfig,
    context: Context
): Promise<void> {
    return pRetry(
        async () => {
            // Critical timeout check before each session
            if (context.getRemainingTimeInMillis() < Math.max(config.timeoutBufferMs, 10000)) {
                throw new AbortError('Lambda timeout approaching - stopping session processing');
            }

            // Step 1: Do the analysis (S3 write happens here immediately)
            console.log(`[SESSION] Analyzing session: ${session.sessionId}`);
            await analyzeSession(session, sessionBatch, feedbackBatch);
            console.log(`[SESSION] Analysis completed for session: ${session.sessionId}`);

            // Step 2: Check if we need to flush batches to prevent memory accumulation
            // and ensure timely processing
            if (sessionBatch.length >= config.dbBatchSize) {
                console.log(`[SESSION] Flushing batches - reached threshold of ${config.dbBatchSize} items`);
                await flushPendingBatches(sessionBatch, feedbackBatch, config);
            }
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

/**
 * Flush pending batches transactionally to maintain consistency
 * Clears the arrays after successful processing
 */
async function flushPendingBatches(sessionBatch: ChatSessionLiteForUpdate[], feedbackBatch: ChatSessionFeedback[], config: PipelineConfig): Promise<void> {
    if (sessionBatch.length === 0 && feedbackBatch.length === 0) {
        return; // Nothing to flush
    }

    console.log(`Flushing ${sessionBatch.length} session updates and ${feedbackBatch.length} feedback records`);

    try {
        // Process both updates transactionally - both succeed or both fail
        // This maintains consistency between session status and feedback records
        await Promise.all([
            sessionBatch.length > 0 ? setSessionsInsightsAnalysisInBatch([...sessionBatch]) : Promise.resolve(),
            feedbackBatch.length > 0 ? processFeedbackBatch([...feedbackBatch], config) : Promise.resolve()
        ]);

        console.log(`Successfully flushed ${sessionBatch.length} sessions and ${feedbackBatch.length} feedback records`);

        // Clear arrays only after successful processing
        sessionBatch.length = 0;
        feedbackBatch.length = 0;
    } catch (error) {
        console.error('Batch flush failed:', error);
        // Don't clear arrays on failure - they'll be retried
        throw error;
    }
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
