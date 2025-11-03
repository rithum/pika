import { ChatMessage } from 'pika-shared/types/chatbot/chatbot-types';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { Context, DynamoDBStreamEvent } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { deleteS3Object, getS3ObjectTagging, updateS3ObjectTagging } from '../../lib/s3';
import { isTTLDeletion } from '../../lib/utils';
import {
    convertChatMessageToSnakeFromCamelCase,
    convertChatMessageToCamelFromSnakeCase,
    type MessageSummaryEntry,
    type MessagesAnalysis,
    ChatMessageOs
} from '../../lib/opensearch/types';
import { gunzipBase64EncodedString } from 'pika-shared/util/server-utils';
import type { Trace } from '@aws-sdk/client-bedrock-agent-runtime';
import opensearchClient from '../../lib/opensearch/opensearch-client';

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const CHAT_TAG = 'chat';
const CONFIRMED_TAG = 'confirmed';

/**
 * This lambda function is used to handle the changes to the chat message table.
 * It is used to ensure s3 objects that are actually used in a chat message are marked as confirmed
 * and that a message's s3 objects are deleted when the message is deleted.
 *
 * @param event - The event object from the DynamoDB stream.
 * @param _context - The context object from the Lambda function.
 */
export async function handler(event: DynamoDBStreamEvent, _context: Context) {
    console.log(`Processing ${event.Records.length} records from DynamoDB stream...`);

    const pikaS3Bucket = process.env.PIKA_S3_BUCKET;
    const stagingTableName = process.env.STAGING_TABLE_NAME;

    if (!pikaS3Bucket) {
        throw new Error('PIKA_S3_BUCKET is not set');
    }
    if (!stagingTableName) {
        throw new Error('STAGING_TABLE_NAME is not set');
    }

    for (const record of event.Records) {
        console.log(`Event ID: ${record.eventID}`);
        console.log(`Event Name: ${record.eventName}`); // INSERT, MODIFY, REMOVE
        console.log('DynamoDB Record: ', JSON.stringify(record.dynamodb, null, 2));

        // Determine the type of operation
        switch (record.eventName) {
            case 'INSERT':
                if (record.dynamodb?.NewImage) {
                    // Unmarshall the DynamoDB NewImage (returns snake_case) and convert to camelCase
                    const newItemSnakeCase = unmarshall(record.dynamodb.NewImage as any);
                    const newItem = convertChatMessageToCamelFromSnakeCase(newItemSnakeCase as ChatMessageOs);

                    // Replicate message to OpenSearch (message index + session updates)
                    await replicateMessageToOpenSearch(newItem);

                    // Handle S3 file confirmation
                    for (const file of newItem.files ?? []) {
                        if (file.locationType === 's3') {
                            if (file.s3Bucket !== pikaS3Bucket) {
                                console.warn(`Skipping S3 object ${file.s3Key} in bucket ${file.s3Bucket} because it is not the upload bucket`);
                                continue;
                            }
                            try {
                                // Make sure that any chat s3 object is marked as confirmed if it isn't already
                                const tags = await getS3ObjectTagging(file.s3Bucket, file.s3Key);
                                const chatTag = tags?.find((t) => t.Key === CHAT_TAG);
                                if (tags && chatTag && chatTag.Value === 'true') {
                                    let confirmedTag = tags?.find((t) => t.Key === CONFIRMED_TAG);
                                    if (!confirmedTag) {
                                        confirmedTag = { Key: CONFIRMED_TAG, Value: 'false' };
                                        tags.push(confirmedTag);
                                    }
                                    if (confirmedTag.Value === 'false') {
                                        confirmedTag.Value = 'true';
                                        await updateS3ObjectTagging(file.s3Bucket, file.s3Key, tags ?? []);
                                    }
                                }
                            } catch (error) {
                                console.error(`Error updating S3 object ${file.s3Key}: ${error}`);
                            }
                        }
                    }
                }
                break;
            case 'MODIFY':
                // Intentionally skip MODIFY events - we do not update OpenSearch on message modifications
                // Message replication only happens on INSERT events
                console.log(`Skipping MODIFY event for message (no OpenSearch update)`);
                break;
            case 'REMOVE':
                if (record.dynamodb?.OldImage) {
                    // Unmarshall the deleted message (returns snake_case) and convert to camelCase
                    const deletedItemSnakeCase = unmarshall(record.dynamodb.OldImage as any);
                    const deletedItem = convertChatMessageToCamelFromSnakeCase(deletedItemSnakeCase as ChatMessageOs);

                    // Check if this deletion was caused by TTL expiration
                    const isTTL = isTTLDeletion(record);
                    if (isTTL) {
                        console.log(`Message ${deletedItem.messageId} was deleted due to TTL expiration`);

                        // Stage the TTL-deleted record for batch archival
                        await stageTTLDeletion(deletedItem, 'message', record.eventSourceARN?.split('/')[1] || 'chat-messages', stagingTableName);

                        // Note: We're NOT deleting S3 files here - they'll be handled by the archive processor
                        // This prevents race conditions and ensures all data is archived together
                    } else {
                        console.log(`Message ${deletedItem.messageId} was manually deleted`);
                        // Delete assets from S3 referenced by the message
                        for (const asset of deletedItem.files ?? []) {
                            if (asset.locationType === 's3') {
                                if (asset.s3Bucket !== pikaS3Bucket) {
                                    console.warn(`Skipping S3 object ${asset.s3Key} in bucket ${asset.s3Bucket} because it is not the upload bucket`);
                                    continue;
                                }
                                try {
                                    await deleteS3Object(asset.s3Bucket, asset.s3Key);
                                    console.log(`Deleted S3 object ${asset.s3Key} (TTL deletion: ${isTTL})`);
                                } catch (error) {
                                    console.error(`Error deleting S3 object ${asset.s3Key}: ${error}`);
                                }
                            }
                        }
                    }
                }
                break;
            default:
                console.warn(`Unhandled event type: ${record.eventName}`);
                break;
        }
    }
}

/**
 * Stages a TTL-deleted record for batch archival
 * @param record The deleted record
 * @param recordType Type of record (message or session)
 * @param sourceTable Source DynamoDB table name
 * @param stagingTableName Name of the staging table
 */
async function stageTTLDeletion(record: any, recordType: 'message' | 'session', sourceTable: string, stagingTableName: string): Promise<void> {
    const ttlExpiredAt = record.exp_date_unix_seconds || Math.floor(Date.now() / 1000);
    const now = new Date();

    // Create staging record
    const stagingItem = {
        // Partition key - using timestamp prefix for even distribution
        staging_id: { S: `${now.toISOString()}_${randomUUID()}` },
        // Sort key - preserve original keys
        record_id: { S: `${record.userId || record.user_id}#${record.messageId || record.message_id || record.sessionId || record.session_id}` },
        // Metadata
        pk: { S: record.userId || record.user_id || '' },
        sk: { S: record.messageId || record.message_id || record.sessionId || record.session_id || '' },
        record_type: { S: recordType },
        source_table: { S: sourceTable },
        archived_at: { S: now.toISOString() },
        partition_hour: { S: now.toISOString().substring(0, 13) }, // YYYY-MM-DDTHH
        ttl_expired_at: { N: String(ttlExpiredAt) },
        // Store the complete record as JSON
        data: { S: JSON.stringify(record) },
        // TTL for staging records (7 days)
        exp_date_unix_seconds: { N: String(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60) }
    };

    try {
        await ddbClient.send(
            new PutItemCommand({
                TableName: stagingTableName,
                Item: stagingItem
            })
        );

        console.log(`Staged ${recordType} record: ${stagingItem.record_id.S}`);
    } catch (error) {
        console.error(`Failed to stage ${recordType} record: ${error}`);
        throw error;
    }
}

// ============================================================================
// OpenSearch Message Replication
// ============================================================================

/**
 * Check if we should skip replication based on invocation mode
 */
function shouldSkipReplication(invocationMode?: string): boolean {
    // Skip if invocation mode is direct-agent-invoke or chat-app-component
    return invocationMode === 'direct-agent-invoke' || invocationMode === 'chat-app-component';
}

/**
 * Extract and decompress LLM instructions from traces array.
 * This happens in the Lambda, NOT at message creation time.
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
                console.warn('Failed to extract LLM instructions from trace:', e instanceof Error ? e.message : e);
            }
        }
    }

    return undefined;
}

/**
 * Index message to OpenSearch message index for searchability
 */
async function indexMessageToOpenSearch(message: ChatMessage): Promise<void> {
    // Extract llmInstructions for assistant messages with traces
    // This only goes to OpenSearch, NOT DynamoDB (to avoid bloating DynamoDB)
    let llmInstructions: string | undefined;
    if (message.source === 'assistant' && message.traces) {
        llmInstructions = extractLLMInstructions(message.traces);
        if (llmInstructions) {
            console.log('Extracted LLM instructions for OpenSearch:', {
                messageId: message.messageId,
                instructionsLength: llmInstructions.length
            });
        }
    }

    // Add llmInstructions to message before conversion (temporary, only for OpenSearch)
    const messageWithInstructions = llmInstructions ? { ...message, llmInstructions } : message;

    // Convert to snake_case OS format
    const messageOs = convertChatMessageToSnakeFromCamelCase(messageWithInstructions);

    // Get OpenSearch client
    const osClient = await opensearchClient.getClient();

    // Index to message index
    await osClient.index({
        index: 'message',
        id: message.messageId,
        body: messageOs
    });

    console.log('Indexed message to OpenSearch:', {
        messageId: message.messageId,
        sessionId: message.sessionId,
        source: message.source
    });
}

/**
 * Append message summary entry to session's messages_summary array
 */
async function appendToMessagesSummary(message: ChatMessage): Promise<void> {
    const entry: MessageSummaryEntry = {
        message_id: message.messageId,
        timestamp: message.timestamp,
        source: message.source
    };

    // Only populate usage metrics for assistant messages
    if (message.source === 'assistant' && message.usage) {
        entry.model = message.model;
        entry.input_tokens = message.usage.inputTokens;
        entry.output_tokens = message.usage.outputTokens;
        entry.input_cost = message.usage.inputCost;
        entry.output_cost = message.usage.outputCost;
        entry.total_cost = message.usage.totalCost;
        entry.execution_duration = message.executionDuration;
    }

    // Get OpenSearch client
    const osClient = await opensearchClient.getClient();

    // Append to array using Painless script
    await osClient.update({
        index: 'session',
        id: message.sessionId,
        retry_on_conflict: 3,
        body: {
            script: {
                source: `
                    if (ctx._source.messages_summary == null) {
                        ctx._source.messages_summary = [];
                    }
                    ctx._source.messages_summary.add(params.entry);
                `,
                params: {
                    entry: entry
                }
            },
            upsert: {
                // If session doesn't exist in OS yet, this shouldn't happen
                // but handle gracefully
                session_id: message.sessionId,
                user_id: message.userId,
                messages_summary: [entry]
            }
        }
    });

    console.log('Appended to messages_summary:', {
        messageId: message.messageId,
        sessionId: message.sessionId
    });
}

/**
 * Create initial messages_analysis state for first message
 */
function createInitialState(firstMessage: ChatMessage): MessagesAnalysis {
    return {
        timing_stats: {
            total_messages: 1,
            total_user_messages: firstMessage.source === 'user' ? 1 : 0,
            total_assistant_messages: firstMessage.source === 'assistant' ? 1 : 0,
            conversation_duration_ms: 0,
            first_message_timestamp: firstMessage.timestamp,
            last_message_timestamp: firstMessage.timestamp,
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
        },
        last_message: {
            timestamp: firstMessage.timestamp,
            source: firstMessage.source,
            message_id: firstMessage.messageId
        },
        last_updated: new Date().toISOString()
    };
}

/**
 * Update session's messages_analysis with atomic Painless script
 */
async function updateMessagesAnalysis(message: ChatMessage): Promise<void> {
    // Get OpenSearch client
    const osClient = await opensearchClient.getClient();

    await osClient.update({
        index: 'session',
        id: message.sessionId,
        retry_on_conflict: 3,
        body: {
            script: {
                source: `
                    // Initialize if needed
                    if (ctx._source.messages_analysis == null) {
                        ctx._source.messages_analysis = params.initial_state;
                        return;
                    }
                    
                    def analysis = ctx._source.messages_analysis;
                    def stats = analysis.timing_stats;
                    def last = analysis.last_message;
                    
                    // Always update message counts first (regardless of order)
                    stats.total_messages += 1;
                    if (params.new_message.source == 'user') {
                        stats.total_user_messages += 1;
                    } else {
                        stats.total_assistant_messages += 1;
                    }
                    
                    // Determine if this message is in order (chronologically after last tracked message)
                    boolean isInOrder = false;
                    long gapMs = 0;
                    
                    if (last != null) {
                        def lastTime = ZonedDateTime.parse(last.timestamp);
                        def newTime = ZonedDateTime.parse(params.new_message.timestamp);
                        gapMs = ChronoUnit.MILLIS.between(lastTime, newTime);
                        isInOrder = gapMs > 0;
                    } else {
                        // First message - always "in order"
                        isInOrder = true;
                    }
                    
                    // Only process timing if message is in chronological order
                    if (isInOrder && last != null) {
                        // Update gap totals
                        stats.total_gap_time_ms += gapMs;
                        stats.total_gap_count += 1;
                        
                        // Categorize gap (response time vs think time)
                        if (last.source == 'user' && params.new_message.source == 'assistant') {
                            // Response time (user → assistant)
                            stats.response_time_total_ms += gapMs;
                            stats.response_time_count += 1;
                        } else if (last.source == 'assistant' && params.new_message.source == 'user') {
                            // Think time (assistant → user)
                            stats.think_time_total_ms += gapMs;
                            stats.think_time_count += 1;
                        }
                        
                        // Update long gap counters
                        if (gapMs > 3600000) stats.gaps_over_1h += 1;
                        if (gapMs > 86400000) stats.gaps_over_1d += 1;
                        if (gapMs > 604800000) stats.gaps_over_1w += 1;
                    }
                    
                    // Calculate averages (safe even if counts are 0)
                    if (stats.total_gap_count > 0) {
                        stats.avg_gap_ms = stats.total_gap_time_ms / stats.total_gap_count;
                    }
                    if (stats.response_time_count > 0) {
                        stats.avg_response_time_ms = stats.response_time_total_ms / stats.response_time_count;
                    }
                    if (stats.think_time_count > 0) {
                        stats.avg_think_time_ms = stats.think_time_total_ms / stats.think_time_count;
                    }
                    
                    // Update last_message tracker (only if in order OR first message)
                    if (isInOrder) {
                        analysis.last_message = params.new_message_meta;
                    }
                    
                    // Update first/last timestamps (check both directions for out-of-order)
                    if (stats.first_message_timestamp == null) {
                        stats.first_message_timestamp = params.new_message.timestamp;
                        stats.last_message_timestamp = params.new_message.timestamp;
                    } else {
                        def firstTime = ZonedDateTime.parse(stats.first_message_timestamp);
                        def lastTime = ZonedDateTime.parse(stats.last_message_timestamp);
                        def newTime = ZonedDateTime.parse(params.new_message.timestamp);
                        
                        // Update first if this message is earlier
                        if (ChronoUnit.MILLIS.between(newTime, firstTime) > 0) {
                            stats.first_message_timestamp = params.new_message.timestamp;
                        }
                        
                        // Update last if this message is later
                        if (ChronoUnit.MILLIS.between(lastTime, newTime) > 0) {
                            stats.last_message_timestamp = params.new_message.timestamp;
                        }
                    }
                    
                    // Update conversation duration based on actual first/last timestamps
                    if (stats.first_message_timestamp != null && stats.last_message_timestamp != null) {
                        def firstTime = ZonedDateTime.parse(stats.first_message_timestamp);
                        def lastTime = ZonedDateTime.parse(stats.last_message_timestamp);
                        stats.conversation_duration_ms = ChronoUnit.MILLIS.between(firstTime, lastTime);
                    }
                    
                    // Always update last_updated
                    analysis.last_updated = params.update_time;
                `,
                params: {
                    new_message: {
                        timestamp: message.timestamp,
                        source: message.source
                    },
                    new_message_meta: {
                        timestamp: message.timestamp,
                        source: message.source,
                        message_id: message.messageId
                    },
                    update_time: new Date().toISOString(),
                    initial_state: createInitialState(message)
                }
            }
        }
    });

    console.log('Updated messages_analysis:', {
        messageId: message.messageId,
        sessionId: message.sessionId
    });
}

/**
 * Replicate new message to OpenSearch (message index + session updates)
 * Used for INSERT events only (MODIFY events are skipped)
 */
async function replicateMessageToOpenSearch(message: ChatMessage): Promise<void> {
    try {
        // 1. Check if we should replicate (filter by invocationMode)
        if (shouldSkipReplication(message.invocationMode)) {
            console.log('Skipping replication for invocationMode:', {
                messageId: message.messageId,
                invocationMode: message.invocationMode
            });
            return;
        }

        // 2. Index to message index (separate index for search)
        await indexMessageToOpenSearch(message);

        // 3. Update session's messages_summary (append entry)
        await appendToMessagesSummary(message);

        // 4. Update session's messages_analysis (atomic script)
        await updateMessagesAnalysis(message);

        console.log('SUCCESS_REPLICATION', {
            messageId: message.messageId,
            sessionId: message.sessionId,
            source: message.source,
            operations: ['message_index', 'messages_summary', 'messages_analysis'],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('FAILED_REPLICATION', {
            messageId: message.messageId,
            sessionId: message.sessionId,
            userId: message.userId,
            source: message.source,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            fullMessage: message, // Include for replay
            timestamp: new Date().toISOString()
        });
        // Don't throw - let stream continue processing other messages
    }
}
