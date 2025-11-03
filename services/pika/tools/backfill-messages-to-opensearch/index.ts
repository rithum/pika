#!/usr/bin/env node
/**
 * Backfill Messages to OpenSearch
 *
 * This tool populates the message index and updates session documents with
 * messages_summary and messages_analysis fields for existing sessions.
 *
 * Usage:
 *   npx tsx tools/backfill-messages-to-opensearch/index.ts [options]
 *
 * Options:
 *   --dry-run              Preview changes without applying them
 *   --start-date YYYY-MM-DD  Only process sessions created after this date
 *   --end-date YYYY-MM-DD    Only process sessions created before this date
 *   --session-id ID          Process only this specific session
 *   --skip-message-index     Skip indexing to message index (only update sessions)
 *   --skip-session-update    Skip updating session documents (only index messages)
 *   --concurrency N          Number of sessions to process in parallel (default: 10)
 *   --message-batch-size N   Number of messages to index in one bulk operation (default: 100)
 *   --session-batch-size N   Number of sessions to update in one bulk operation (default: 50)
 */

import { DynamoDBClient, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { convertChatMessageToSnakeFromCamelCase, type MessageSummaryEntry, type MessagesAnalysis } from '../../src/lib/opensearch/types';
import opensearchClient from '../../src/lib/opensearch/opensearch-client';
import { gunzipBase64EncodedString } from 'pika-shared/util/server-utils';
import type { Trace } from '@aws-sdk/client-bedrock-agent-runtime';
import pMap from 'p-map';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local if present (located at services/pika/.env.local)
const envPath = path.join(__dirname, '..', '..', '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`Loaded environment variables from ${envPath}\n`);
}

// Ensure required env vars are present
const requiredEnv = ['stage', 'AWS_REGION', 'PIKA_SERVICE_PROJ_NAME_KEBAB_CASE'] as const;
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
    console.error(`\nMissing required environment variables: ${missingEnv.join(', ')}`);
    console.error('\nMake sure .env.local exists with:');
    console.error('  stage=<your-stage>');
    console.error('  AWS_REGION=<your-region>');
    console.error('  PIKA_SERVICE_PROJ_NAME_KEBAB_CASE=<your-project-name>');
    console.error('  PIKA_DOMAIN_ENDPOINT=<your-opensearch-endpoint>\n');
    process.exit(1);
}

const stage = process.env.stage;
const projectName = process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE;
const region = process.env.AWS_REGION;

// Construct table names
const CHAT_SESSION_TABLE_NAME = `chat-session-${projectName}-${stage}`;
const CHAT_MESSAGE_TABLE_NAME = `chat-message-${projectName}-${stage}`;

const ddbClient = new DynamoDBClient({ region });

// Local interfaces for DynamoDB records (snake_case as stored in DDB)
interface ChatSession {
    session_id: string;
    user_id: string;
    invocation_mode?: string;
    create_date?: string;
    [key: string]: any;
}

interface ChatMessage {
    message_id: string;
    user_id: string;
    session_id: string;
    timestamp: string;
    source: 'user' | 'assistant';
    model?: string;
    invocation_mode?: string;
    user_type?: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
        inputCost: number;
        outputCost: number;
        totalCost: number;
    };
    execution_duration?: number;
    traces?: Trace[];
    [key: string]: any;
}

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const START_DATE = args.find((arg, i) => args[i - 1] === '--start-date');
const END_DATE = args.find((arg, i) => args[i - 1] === '--end-date');
const SESSION_ID = args.find((arg, i) => args[i - 1] === '--session-id');
const SKIP_MESSAGE_INDEX = args.includes('--skip-message-index');
const SKIP_SESSION_UPDATE = args.includes('--skip-session-update');
const CONCURRENCY = parseInt(args.find((arg, i) => args[i - 1] === '--concurrency') || '10', 10);
const MESSAGE_BATCH_SIZE = parseInt(args.find((arg, i) => args[i - 1] === '--message-batch-size') || '100', 10);
const SESSION_BATCH_SIZE = parseInt(args.find((arg, i) => args[i - 1] === '--session-batch-size') || '50', 10);

interface BackfillStats {
    sessionsProcessed: number;
    sessionsUpdated: number;
    sessionsSkipped: number;
    messagesProcessed: number;
    messagesIndexed: number;
    errors: number;
    errorDetails: Array<{ sessionId: string; error: string }>;
    messageIndexErrors: Array<{ messageId: string; sessionId: string; error: any }>;
    sessionUpdateErrors: Array<{ sessionId: string; error: any }>;
}

interface ProcessedSession {
    sessionId: string;
    messages: ChatMessage[];
    messagesSummary: MessageSummaryEntry[];
    messagesAnalysis: MessagesAnalysis;
}

// Global batches for bulk operations
let messageBatch: Array<{ message: ChatMessage; llmInstructions?: string }> = [];
let sessionUpdateBatch: Array<{ sessionId: string; messagesSummary: MessageSummaryEntry[]; messagesAnalysis: MessagesAnalysis }> = [];

// Global set of problematic session IDs to skip
let problematicSessionIds: Set<string> = new Set();

/**
 * Detect sessions with excessive feedback entries in OpenSearch
 */
async function detectProblematicFeedback(): Promise<
    Array<{
        sessionId: string;
        feedbackCount: number;
        duplicateTypes: Record<string, number>;
        sample: any[];
    }>
> {
    const problematic: Array<{
        sessionId: string;
        feedbackCount: number;
        duplicateTypes: Record<string, number>;
        sample: any[];
    }> = [];

    const FEEDBACK_THRESHOLD = 100; // Flag sessions with more than 100 feedback entries

    try {
        const osClient = await opensearchClient.getClient();

        // Scroll through all sessions and check feedback count
        let scrollId: string | undefined;
        let processed = 0;

        // Initial search
        let response = await osClient.search({
            index: 'session',
            scroll: '1m',
            size: 100,
            body: {
                query: { match_all: {} },
                _source: ['session_id', 'feedback']
            }
        });

        scrollId = response.body._scroll_id;
        let hits = response.body.hits.hits;

        while (hits.length > 0) {
            for (const hit of hits) {
                const sessionId = hit._source?.session_id;
                const feedback = hit._source?.feedback;

                if (feedback && Array.isArray(feedback) && feedback.length > FEEDBACK_THRESHOLD) {
                    // Analyze duplicates
                    const typeCount: Record<string, number> = {};
                    feedback.forEach((f: any) => {
                        const type = f.type || 'unknown';
                        typeCount[type] = (typeCount[type] || 0) + 1;
                    });

                    problematic.push({
                        sessionId,
                        feedbackCount: feedback.length,
                        duplicateTypes: typeCount,
                        sample: feedback.slice(0, 5) // First 5 for inspection
                    });

                    console.log(`  Found: ${sessionId} with ${feedback.length} feedback entries`);
                }

                processed++;
            }

            if (processed % 1000 === 0) {
                console.log(`  Scanned ${processed} sessions...`);
            }

            // Continue scrolling
            try {
                response = await osClient.scroll({
                    scroll_id: scrollId,
                    scroll: '1m'
                });
                scrollId = response.body._scroll_id;
                hits = response.body.hits.hits;
            } catch (scrollError) {
                console.error('Error during scroll:', scrollError);
                break;
            }
        }

        // Clear scroll
        if (scrollId) {
            try {
                await osClient.clearScroll({ scroll_id: scrollId });
            } catch (e) {
                // Ignore clear scroll errors
            }
        }

        console.log(`Scanned ${processed} total sessions`);
    } catch (error) {
        console.error('Error detecting problematic feedback:', error);
    }

    return problematic;
}

async function main() {
    console.log('='.repeat(80));
    console.log('Backfill Messages to OpenSearch');
    console.log('='.repeat(80));
    console.log('Configuration:');
    console.log(`  Stage: ${stage}`);
    console.log(`  Project: ${projectName}`);
    console.log(`  Region: ${region}`);
    console.log(`  Session Table: ${CHAT_SESSION_TABLE_NAME}`);
    console.log(`  Message Table: ${CHAT_MESSAGE_TABLE_NAME}`);
    console.log(`  Dry Run: ${DRY_RUN}`);
    console.log(`  Start Date: ${START_DATE || 'none'}`);
    console.log(`  End Date: ${END_DATE || 'none'}`);
    console.log(`  Session ID: ${SESSION_ID || 'none'}`);
    console.log(`  Skip Message Index: ${SKIP_MESSAGE_INDEX}`);
    console.log(`  Skip Session Update: ${SKIP_SESSION_UPDATE}`);
    console.log(`  Concurrency: ${CONCURRENCY} sessions`);
    console.log(`  Message Batch Size: ${MESSAGE_BATCH_SIZE}`);
    console.log(`  Session Batch Size: ${SESSION_BATCH_SIZE}`);
    console.log('='.repeat(80));
    console.log('');

    if (DRY_RUN) {
        console.log('DRY RUN MODE - No changes will be made\n');
    }

    // Pre-flight check: Detect sessions with excessive feedback
    console.log('Running pre-flight check for sessions with excessive feedback...\n');
    const problematicSessions = await detectProblematicFeedback();

    // Store problematic session IDs for skipping during processing
    problematicSessions.forEach((s) => problematicSessionIds.add(s.sessionId));

    if (problematicSessions.length > 0) {
        console.log(`\n  Found ${problematicSessions.length} sessions with excessive feedback!`);
        console.log('These sessions will be skipped during backfill to prevent OpenSearch errors.\n');

        // Write report
        const reportPath = path.join(__dirname, `custom-excessive-feedback-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalProblematicSessions: problematicSessions.length,
                totalFeedbackEntries: problematicSessions.reduce((sum, s) => sum + s.feedbackCount, 0)
            },
            sessions: problematicSessions,
            recommendation: 'Run the cleanup tool: npx tsx tools/backfill-messages-to-opensearch/cleanup-duplicate-feedback.ts'
        };

        try {
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            console.log(` Excessive feedback report written to: ${reportPath}\n`);
        } catch (writeError) {
            console.error(`Failed to write report: ${writeError}`);
        }
    } else {
        console.log(' No sessions with excessive feedback found.\n');
    }

    const stats: BackfillStats = {
        sessionsProcessed: 0,
        sessionsUpdated: 0,
        sessionsSkipped: 0,
        messagesProcessed: 0,
        messagesIndexed: 0,
        errors: 0,
        errorDetails: [],
        messageIndexErrors: [],
        sessionUpdateErrors: []
    };

    const startTime = Date.now();

    try {
        if (SESSION_ID) {
            // Process single session
            await processSingleSession(SESSION_ID, stats);
        } else {
            // Process all sessions (with optional date filtering)
            await processAllSessions(stats);
        }

        // Flush any remaining batches
        if (!DRY_RUN) {
            await flushMessageBatch(stats);
            await flushSessionBatch(stats);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const sessionsPerSec = ((stats.sessionsProcessed / (Date.now() - startTime)) * 1000).toFixed(1);
        const messagesPerSec = ((stats.messagesProcessed / (Date.now() - startTime)) * 1000).toFixed(1);

        console.log('\n' + '='.repeat(80));
        console.log('Backfill Complete');
        console.log('='.repeat(80));
        console.log(`Duration: ${duration}s`);
        console.log(`Sessions Processed: ${stats.sessionsProcessed} (${sessionsPerSec}/s)`);
        console.log(`Sessions Updated: ${stats.sessionsUpdated}`);
        console.log(`Sessions Skipped: ${stats.sessionsSkipped}`);
        console.log(`Messages Processed: ${stats.messagesProcessed} (${messagesPerSec}/s)`);
        console.log(`Messages Indexed: ${stats.messagesIndexed}`);
        console.log(`Message Index Errors: ${stats.messageIndexErrors.length}`);
        console.log(`Session Update Errors: ${stats.sessionUpdateErrors.length}`);
        console.log(`General Errors: ${stats.errorDetails.length}`);

        // Error summary by type
        if (stats.messageIndexErrors.length > 0 || stats.sessionUpdateErrors.length > 0) {
            console.log('\n' + '='.repeat(80));
            console.log('Error Summary');
            console.log('='.repeat(80));

            // Summarize message index errors by type
            if (stats.messageIndexErrors.length > 0) {
                console.log('\nMessage Index Errors:');
                const messageErrorTypes = new Map<string, number>();
                stats.messageIndexErrors.forEach((err) => {
                    const errorType = err.error.type || 'unknown';
                    messageErrorTypes.set(errorType, (messageErrorTypes.get(errorType) || 0) + 1);
                });
                messageErrorTypes.forEach((count, errorType) => {
                    console.log(`  ${errorType}: ${count} occurrences`);
                });
            }

            // Summarize session update errors by type
            if (stats.sessionUpdateErrors.length > 0) {
                console.log('\nSession Update Errors:');
                const sessionErrorTypes = new Map<string, number>();
                stats.sessionUpdateErrors.forEach((err) => {
                    const errorType = err.error.type || 'unknown';
                    sessionErrorTypes.set(errorType, (sessionErrorTypes.get(errorType) || 0) + 1);
                });
                sessionErrorTypes.forEach((count, errorType) => {
                    console.log(`  ${errorType}: ${count} occurrences`);
                });
            }

            // Write detailed errors to file
            const errorFilePath = path.join(__dirname, `custom-backfill-errors-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
            const errorReport = {
                timestamp: new Date().toISOString(),
                summary: {
                    totalMessageIndexErrors: stats.messageIndexErrors.length,
                    totalSessionUpdateErrors: stats.sessionUpdateErrors.length,
                    totalGeneralErrors: stats.errorDetails.length
                },
                messageIndexErrors: stats.messageIndexErrors,
                sessionUpdateErrors: stats.sessionUpdateErrors,
                generalErrors: stats.errorDetails
            };

            try {
                fs.writeFileSync(errorFilePath, JSON.stringify(errorReport, null, 2));
                console.log(`\n Detailed errors written to: ${errorFilePath}`);
            } catch (writeError) {
                console.error(`Failed to write error file: ${writeError}`);
            }
        }

        console.log('='.repeat(80));
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

async function processSingleSession(sessionId: string, stats: BackfillStats) {
    console.log(`Processing single session: ${sessionId}\n`);

    try {
        // Scan for session (inefficient but works for single session lookup)
        const scanResult = await ddbClient.send(
            new ScanCommand({
                TableName: CHAT_SESSION_TABLE_NAME,
                FilterExpression: 'session_id = :sessionId',
                ExpressionAttributeValues: {
                    ':sessionId': { S: sessionId }
                },
                Limit: 1
            })
        );

        if (!scanResult.Items || scanResult.Items.length === 0) {
            console.error(`Session ${sessionId} not found in DynamoDB`);
            return;
        }

        const session = unmarshall(scanResult.Items[0]) as ChatSession;
        await processSession(session, stats);
    } catch (error) {
        console.error(`Failed to process session ${sessionId}:`, error);
        stats.errors++;
        stats.errorDetails.push({
            sessionId,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

async function processAllSessions(stats: BackfillStats) {
    let lastEvaluatedKey: Record<string, any> | undefined;
    let batchCount = 0;

    console.log('Scanning all sessions...\n');

    do {
        const scanParams: any = {
            TableName: CHAT_SESSION_TABLE_NAME,
            Limit: 200 // Get more sessions per scan
        };

        if (lastEvaluatedKey) {
            scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }

        const scanResult = await ddbClient.send(new ScanCommand(scanParams));

        if (scanResult.Items) {
            // Filter sessions based on date criteria
            const sessionsToProcess = scanResult.Items.map((item) => unmarshall(item) as ChatSession).filter((session) => {
                if (START_DATE && session.create_date && session.create_date < START_DATE) {
                    stats.sessionsSkipped++;
                    return false;
                }
                if (END_DATE && session.create_date && session.create_date > END_DATE) {
                    stats.sessionsSkipped++;
                    return false;
                }
                return true;
            });

            // Process sessions in parallel with concurrency limit
            await pMap(
                sessionsToProcess,
                async (session) => {
                    await processSession(session, stats);
                },
                { concurrency: CONCURRENCY }
            );
        }

        lastEvaluatedKey = scanResult.LastEvaluatedKey;
        batchCount++;

        if (batchCount % 5 === 0) {
            console.log(`Progress: ${stats.sessionsProcessed} sessions processed, ${stats.messagesProcessed} messages`);
        }
    } while (lastEvaluatedKey);
}

async function processSession(session: ChatSession, stats: BackfillStats) {
    try {
        stats.sessionsProcessed++;

        // Validate session has required fields (using snake_case from DynamoDB)
        if (!session.session_id || !session.user_id) {
            console.warn(`Skipping session with missing fields: session_id=${session.session_id}, user_id=${session.user_id}`);
            stats.sessionsSkipped++;
            return;
        }

        // Skip if session is in the problematic list (excessive feedback)
        if (problematicSessionIds.has(session.session_id)) {
            console.log(`Skipping session ${session.session_id} (excessive feedback detected)`);
            stats.sessionsSkipped++;
            return;
        }

        // Get all messages for this session
        const messages = await getMessagesForSession(session.session_id, session.user_id);

        if (messages.length === 0) {
            stats.sessionsSkipped++;
            return; // No messages to process
        }

        // Filter messages by invocationMode
        const invocationMode = session.invocation_mode || 'chat-app';
        if (invocationMode === 'direct-agent-invoke' || invocationMode === 'chat-app-component') {
            stats.sessionsSkipped++;
            return;
        }

        // Check if session already has messages_summary (resume capability)
        if (!DRY_RUN && !SKIP_SESSION_UPDATE) {
            const alreadyProcessed = await checkIfSessionAlreadyProcessed(session.session_id);
            if (alreadyProcessed) {
                stats.sessionsSkipped++;
                return;
            }
        }

        // Add messages to batch for indexing
        if (!SKIP_MESSAGE_INDEX) {
            for (const message of messages) {
                if (!DRY_RUN) {
                    // Extract llmInstructions for assistant messages with traces
                    let llmInstructions: string | undefined;
                    if (message.source === 'assistant' && message.traces) {
                        llmInstructions = extractLLMInstructions(message.traces);
                    }
                    messageBatch.push({ message, llmInstructions });
                }
                stats.messagesProcessed++;
            }

            // Flush message batch if it reaches the batch size
            if (!DRY_RUN && messageBatch.length >= MESSAGE_BATCH_SIZE) {
                await flushMessageBatch(stats);
            }
        }

        // Build messages_summary array
        const messagesSummary = messages.map((msg) => buildMessageSummaryEntry(msg));

        // Calculate messages_analysis statistics
        const messagesAnalysis = calculateMessagesAnalysis(messages);

        // Add session update to batch
        if (!SKIP_SESSION_UPDATE && !DRY_RUN) {
            sessionUpdateBatch.push({
                sessionId: session.session_id,
                messagesSummary,
                messagesAnalysis
            });

            // Flush session batch if it reaches the batch size
            if (sessionUpdateBatch.length >= SESSION_BATCH_SIZE) {
                await flushSessionBatch(stats);
            }
        }

        if (DRY_RUN) {
            console.log(`[DRY RUN] Would process session ${session.session_id}: ${messages.length} messages`);
        }
    } catch (error) {
        stats.errors++;
        stats.errorDetails.push({
            sessionId: session.session_id,
            error: error instanceof Error ? error.message : String(error)
        });
        console.error(`Failed to process session ${session.session_id}:`, error);
    }
}

/**
 * Flush accumulated messages to OpenSearch using bulk API
 */
async function flushMessageBatch(stats: BackfillStats): Promise<void> {
    if (messageBatch.length === 0) {
        return;
    }

    try {
        const osClient = await opensearchClient.getClient();
        const body: any[] = [];

        for (const { message, llmInstructions } of messageBatch) {
            // Add llmInstructions temporarily for OpenSearch indexing (already in snake_case from DDB)
            const messageOs = llmInstructions ? { ...message, llm_instructions: llmInstructions } : message;

            // Add bulk operation (index action + document)
            body.push({ index: { _index: 'message', _id: message.message_id } });
            body.push(messageOs);
        }

        const bulkResponse = await osClient.bulk({ body });

        if (bulkResponse.body.errors) {
            // Capture individual error details
            let batchErrorCount = 0;
            bulkResponse.body.items.forEach((item: any, index: number) => {
                if (item.index?.error) {
                    // Safety check: ensure the batch item exists at this index
                    const batchItem = messageBatch[index];
                    if (batchItem && batchItem.message) {
                        stats.messageIndexErrors.push({
                            messageId: batchItem.message.message_id,
                            sessionId: batchItem.message.session_id,
                            error: item.index.error
                        });
                    } else {
                        // Fallback: record error without message details
                        stats.messageIndexErrors.push({
                            messageId: `unknown-${index}`,
                            sessionId: 'unknown',
                            error: item.index.error
                        });
                    }
                    batchErrorCount++;
                }
            });
            const successCount = messageBatch.length - batchErrorCount;
            console.error(`Bulk message indexing had ${batchErrorCount} errors out of ${messageBatch.length} messages`);
            stats.messagesIndexed += successCount;
        } else {
            stats.messagesIndexed += messageBatch.length;
        }

        messageBatch = []; // Clear the batch
    } catch (error) {
        console.error(`Failed to flush message batch of ${messageBatch.length} messages:`, error);
        messageBatch = []; // Clear the batch even on error to prevent retry loops
    }
}

/**
 * Flush accumulated session updates to OpenSearch using bulk API
 */
async function flushSessionBatch(stats: BackfillStats): Promise<void> {
    if (sessionUpdateBatch.length === 0) {
        return;
    }

    try {
        const osClient = await opensearchClient.getClient();
        const body: any[] = [];

        for (const { sessionId, messagesSummary, messagesAnalysis } of sessionUpdateBatch) {
            // Add bulk operation (update action + doc)
            body.push({ update: { _index: 'session', _id: sessionId } });
            body.push({
                doc: {
                    messages_summary: messagesSummary,
                    messages_analysis: messagesAnalysis
                }
            });
        }

        const bulkResponse = await osClient.bulk({ body });

        if (bulkResponse.body.errors) {
            // Capture individual error details
            let batchErrorCount = 0;
            bulkResponse.body.items.forEach((item: any, index: number) => {
                if (item.update?.error) {
                    // Safety check: ensure the batch item exists at this index
                    const sessionData = sessionUpdateBatch[index];
                    if (sessionData && sessionData.sessionId) {
                        stats.sessionUpdateErrors.push({
                            sessionId: sessionData.sessionId,
                            error: item.update.error
                        });
                    } else {
                        // Fallback: record error without session details
                        stats.sessionUpdateErrors.push({
                            sessionId: `unknown-${index}`,
                            error: item.update.error
                        });
                    }
                    batchErrorCount++;
                }
            });
            const successCount = sessionUpdateBatch.length - batchErrorCount;
            console.error(`Bulk session update had ${batchErrorCount} errors out of ${sessionUpdateBatch.length} sessions`);
            stats.sessionsUpdated += successCount;
        } else {
            stats.sessionsUpdated += sessionUpdateBatch.length;
        }

        sessionUpdateBatch = []; // Clear the batch
    } catch (error) {
        console.error(`Failed to flush session batch of ${sessionUpdateBatch.length} sessions:`, error);
        sessionUpdateBatch = []; // Clear the batch even on error to prevent retry loops
    }
}

async function getMessagesForSession(sessionId: string, userId: string): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
        const queryParams: any = {
            TableName: CHAT_MESSAGE_TABLE_NAME,
            KeyConditionExpression: 'user_id = :userId AND begins_with(message_id, :sessionPrefix)',
            ExpressionAttributeValues: {
                ':userId': { S: userId },
                ':sessionPrefix': { S: sessionId }
            }
        };

        if (lastEvaluatedKey) {
            queryParams.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await ddbClient.send(new QueryCommand(queryParams));

        if (result.Items) {
            messages.push(...result.Items.map((item) => unmarshall(item) as ChatMessage));
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Sort by timestamp
    return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

async function checkIfSessionAlreadyProcessed(sessionId: string): Promise<boolean> {
    try {
        const osClient = await opensearchClient.getClient();
        const result = await osClient.get({
            index: 'session',
            id: sessionId,
            _source: ['messages_summary']
        });

        return result.body._source?.messages_summary && result.body._source.messages_summary.length > 0;
    } catch (error: any) {
        if (error.statusCode === 404) {
            return false; // Session not in OpenSearch yet
        }
        throw error;
    }
}

function buildMessageSummaryEntry(message: ChatMessage): MessageSummaryEntry {
    const entry: MessageSummaryEntry = {
        message_id: message.message_id,
        timestamp: message.timestamp,
        source: message.source
    };

    // Only populate for assistant messages
    if (message.source === 'assistant' && message.usage) {
        entry.model = message.model;
        entry.input_tokens = message.usage.inputTokens;
        entry.output_tokens = message.usage.outputTokens;
        entry.input_cost = message.usage.inputCost;
        entry.output_cost = message.usage.outputCost;
        entry.total_cost = message.usage.totalCost;
        entry.execution_duration = message.execution_duration;
    }

    return entry;
}

function calculateMessagesAnalysis(messages: ChatMessage[]): MessagesAnalysis {
    if (messages.length === 0) {
        throw new Error('Cannot calculate analysis for empty message array');
    }

    const stats = {
        total_messages: messages.length,
        total_user_messages: messages.filter((m) => m.source === 'user').length,
        total_assistant_messages: messages.filter((m) => m.source === 'assistant').length,
        conversation_duration_ms: 0,
        first_message_timestamp: messages[0].timestamp,
        last_message_timestamp: messages[messages.length - 1].timestamp,
        avg_gap_ms: 0,
        total_gap_time_ms: 0,
        total_gap_count: 0,
        avg_response_time_ms: 0,
        response_time_total_ms: 0,
        response_time_count: 0,
        avg_think_time_ms: 0,
        think_time_total_ms: 0,
        think_time_count: 0,
        gaps_over_1h: 0,
        gaps_over_1d: 0,
        gaps_over_1w: 0
    };

    // Calculate conversation duration
    if (messages.length > 1) {
        stats.conversation_duration_ms = new Date(messages[messages.length - 1].timestamp).getTime() - new Date(messages[0].timestamp).getTime();
    }

    // Calculate gaps
    for (let i = 1; i < messages.length; i++) {
        const gapMs = new Date(messages[i].timestamp).getTime() - new Date(messages[i - 1].timestamp).getTime();

        stats.total_gap_time_ms += gapMs;
        stats.total_gap_count += 1;

        // Categorize gap
        const prevSource = messages[i - 1].source;
        const currSource = messages[i].source;

        if (prevSource === 'user' && currSource === 'assistant') {
            stats.response_time_total_ms += gapMs;
            stats.response_time_count += 1;
        } else if (prevSource === 'assistant' && currSource === 'user') {
            stats.think_time_total_ms += gapMs;
            stats.think_time_count += 1;
        }

        // Count long gaps
        if (gapMs > 3600000) stats.gaps_over_1h += 1;
        if (gapMs > 86400000) stats.gaps_over_1d += 1;
        if (gapMs > 604800000) stats.gaps_over_1w += 1;
    }

    // Calculate averages
    if (stats.total_gap_count > 0) {
        stats.avg_gap_ms = stats.total_gap_time_ms / stats.total_gap_count;
    }
    if (stats.response_time_count > 0) {
        stats.avg_response_time_ms = stats.response_time_total_ms / stats.response_time_count;
    }
    if (stats.think_time_count > 0) {
        stats.avg_think_time_ms = stats.think_time_total_ms / stats.think_time_count;
    }

    return {
        timing_stats: stats,
        last_message: {
            timestamp: messages[messages.length - 1].timestamp,
            source: messages[messages.length - 1].source,
            message_id: messages[messages.length - 1].message_id
        },
        last_updated: new Date().toISOString()
    };
}

/**
 * Extract and decompress LLM instructions from traces.
 * Same function as in message-changed Lambda.
 */
function extractLLMInstructions(traces?: Trace[]): string | undefined {
    if (!traces || traces.length === 0) {
        return undefined;
    }

    for (const trace of traces) {
        const text = trace.orchestrationTrace?.rationale?.text;
        if (text && text.includes('"type":"llm-instruction"')) {
            try {
                const data = JSON.parse(text);
                if (data.type === 'llm-instruction' && data.compressedData) {
                    return gunzipBase64EncodedString(data.compressedData);
                }
            } catch (e) {
                console.warn('Failed to extract LLM instructions:', e);
            }
        }
    }
    return undefined;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the script
main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
