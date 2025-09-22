import { ChatSession, RecordOrUndef, SessionInsights } from 'pika-shared/types/chatbot/chatbot-types';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Context, DynamoDBStreamEvent } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { convertChatSessionToCamelFromSnakeCase, isTTLDeletion } from '../../lib/utils';
import { chatSessionUpdated, getExistingDocumentsByIds } from '../../lib/opensearch/opensearch';
import { SnakeCase, convertToCamelCase } from 'pika-shared/util/chatbot-shared-utils';

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

/**
 * This lambda function handles changes to the chat session table.
 * It replicates session changes to OpenSearch and stages TTL-deleted sessions for batch archival.
 *
 * @param event - The event object from the DynamoDB stream.
 * @param _context - The context object from the Lambda function.
 */
export async function handler(event: DynamoDBStreamEvent, _context: Context) {
    console.log(`Processing ${event.Records.length} session records from DynamoDB stream...`);

    const stagingTableName = process.env.STAGING_TABLE_NAME;
    if (!stagingTableName) {
        throw new Error('STAGING_TABLE_NAME is not set');
    }

    // Track changes for OpenSearch replication
    const newObjects: ChatSession<RecordOrUndef>[] = [];
    const updatedObjects: ChatSession<RecordOrUndef>[] = [];
    const deletedObjects: ChatSession<RecordOrUndef>[] = [];

    // First pass: collect sessions by event type so we can batch-check existence for MODIFY
    const modifySessions: ChatSession<RecordOrUndef>[] = [];
    const modifyOldSessionsById: Map<string, ChatSession<RecordOrUndef> | undefined> = new Map();

    for (const record of event.Records) {
        console.log(`Event ID: ${record.eventID}`);
        console.log(`Event Name: ${record.eventName}`);
        console.log('DynamoDB Record: ', JSON.stringify(record.dynamodb, null, 2));

        try {
            switch (record.eventName) {
                case 'INSERT':
                    if (record.dynamodb?.NewImage) {
                        const newSession = convertChatSessionToCamelFromSnakeCase<RecordOrUndef>(
                            unmarshall(record.dynamodb.NewImage as any) as SnakeCase<ChatSession<RecordOrUndef>>
                        );
                        console.log(`New session created: ${newSession.sessionId}`);

                        // If the session is a test session, skip it
                        if (newSession.testType === 'mock') {
                            console.log(`Skipping test session: ${newSession.sessionId}`);
                            continue;
                        }

                        // Handle insights for new sessions that might already have insights URLs
                        const processedSession = await processInsightsChanges(newSession);
                        newObjects.push(processedSession);
                    }
                    break;

                case 'MODIFY':
                    if (record.dynamodb?.NewImage) {
                        const modifiedSession = convertChatSessionToCamelFromSnakeCase<RecordOrUndef>(
                            unmarshall(record.dynamodb.NewImage as any) as SnakeCase<ChatSession<RecordOrUndef>>
                        );
                        const oldSession = record.dynamodb?.OldImage
                            ? convertChatSessionToCamelFromSnakeCase<RecordOrUndef>(unmarshall(record.dynamodb.OldImage as any) as SnakeCase<ChatSession<RecordOrUndef>>)
                            : undefined;

                        // If the session is a test session, skip it
                        if (modifiedSession.testType === 'mock') {
                            console.log(`Skipping test session: ${modifiedSession.sessionId}`);
                            continue;
                        }

                        console.log(`Session modified: ${modifiedSession.sessionId}`);

                        // Defer processing until we know if it exists in OpenSearch
                        modifySessions.push(modifiedSession);
                        modifyOldSessionsById.set(modifiedSession.sessionId, oldSession);
                    }
                    break;

                case 'REMOVE':
                    if (record.dynamodb?.OldImage) {
                        const deletedSession = convertChatSessionToCamelFromSnakeCase<RecordOrUndef>(
                            unmarshall(record.dynamodb.OldImage as any) as SnakeCase<ChatSession<RecordOrUndef>>
                        );

                        // If the session is a test session, skip it
                        if (deletedSession.testType === 'mock') {
                            console.log(`Skipping test session: ${deletedSession.sessionId}`);
                            continue;
                        }

                        if (isTTLDeletion(record)) {
                            console.log(`Session ${deletedSession.sessionId} was deleted due to TTL expiration`);

                            // Stage the TTL-deleted record for batch archival
                            await stageTTLDeletion(deletedSession, 'session', record.eventSourceARN?.split('/')[1] || 'chat-sessions', stagingTableName);
                        } else {
                            console.log(`Session ${deletedSession.sessionId} was manually deleted`);
                        }

                        // Always add to deleted objects for OpenSearch cleanup
                        deletedObjects.push(deletedSession);
                    }
                    break;

                default:
                    console.log(`Unhandled event type: ${record.eventName}`);
            }
        } catch (error) {
            console.error(`Error processing record ${record.eventID}:`, error);
            // Continue processing other records rather than failing the entire batch
        }
    }

    // Pre-process MODIFY records: batch existence check in OpenSearch to decide insert vs partial update
    if (modifySessions.length > 0) {
        try {
            const ids = modifySessions.map((s) => s.sessionId);
            const existing = await getExistingDocumentsByIds('session', ids);

            for (const session of modifySessions) {
                const oldSession = modifyOldSessionsById.get(session.sessionId);

                if (existing.has(session.sessionId)) {
                    // Exists in OpenSearch → process as update with insights-change handling
                    const processed = await processInsightsChanges(session, oldSession);
                    updatedObjects.push(processed);
                } else {
                    // Missing in OpenSearch → insert full document.
                    // Always try to populate insights from S3 if a URL is present, regardless of whether it changed.
                    let sessionToInsert = session;
                    if (session.insightsS3Url) {
                        const insights = await readInsightsFromS3(session.insightsS3Url);
                        sessionToInsert = { ...session, insights };
                    }
                    newObjects.push(sessionToInsert);
                }
            }
        } catch (error) {
            console.error('Failed batch existence check for MODIFY sessions; falling back to updates:', error);
            // Best-effort fallback: treat all modifies as updates
            for (const session of modifySessions) {
                const processed = await processInsightsChanges(session, modifyOldSessionsById.get(session.sessionId));
                updatedObjects.push(processed);
            }
        }
    }

    // Replicate changes to OpenSearch
    if (newObjects.length > 0 || updatedObjects.length > 0 || deletedObjects.length > 0) {
        try {
            console.log(`Replicating to OpenSearch: ${newObjects.length} new, ${updatedObjects.length} updated, ${deletedObjects.length} deleted`);

            await chatSessionUpdated({
                newObjects: newObjects.length > 0 ? newObjects : undefined,
                updatedObjects: updatedObjects.length > 0 ? updatedObjects : undefined,
                deletedObjects: deletedObjects.length > 0 ? deletedObjects : undefined
            });

            console.log('Successfully replicated session changes to OpenSearch');
        } catch (error) {
            console.error('Failed to replicate session changes to OpenSearch:', error);
            // Don't throw here - we want archival to succeed even if OpenSearch fails
        }
    } else {
        console.log('No session changes to replicate to OpenSearch');
    }
}

/**
 * Parses an S3 URL to extract bucket and key
 * @param s3Url S3 URL in format s3://bucket-name/key
 * @returns Object with bucket and key, or null if invalid
 */
function parseS3Url(s3Url: string): { bucket: string; key: string } | null {
    try {
        if (!s3Url.startsWith('s3://')) {
            return null;
        }

        const urlParts = s3Url.slice(5).split('/'); // Remove 's3://' and split
        if (urlParts.length < 2) {
            return null;
        }

        const bucket = urlParts[0];
        const key = urlParts.slice(1).join('/');

        return { bucket, key };
    } catch (error) {
        console.error(`Error parsing S3 URL ${s3Url}:`, error);
        return null;
    }
}

/**
 * Reads insights from S3 and converts to ChatSession format
 * @param s3Url S3 URL where insights are stored
 * @returns SessionInsights object or undefined if error
 */
async function readInsightsFromS3(s3Url: string): Promise<SessionInsights | undefined> {
    try {
        const s3Location = parseS3Url(s3Url);
        if (!s3Location) {
            console.error(`Invalid S3 URL format: ${s3Url}`);
            return undefined;
        }

        console.log(`Reading insights from S3: ${s3Url}`);

        const getObjectCommand = new GetObjectCommand({
            Bucket: s3Location.bucket,
            Key: s3Location.key
        });

        const response = await s3Client.send(getObjectCommand);

        if (!response.Body) {
            console.error(`No body in S3 response for: ${s3Url}`);
            return undefined;
        }

        // Convert the stream to string
        const bodyString = await response.Body.transformToString();
        const insightsData = JSON.parse(bodyString) as SnakeCase<SessionInsights>;

        // Convert from snake_case to camelCase
        const insights = convertToCamelCase<SessionInsights>(insightsData);

        console.log(`Successfully read insights from S3: ${s3Url}`);
        return insights;
    } catch (error) {
        console.error(`Error reading insights from S3 ${s3Url}:`, error);
        return undefined;
    }
}

/**
 * Processes insights changes by comparing old and new sessions and reading S3 data when needed
 * @param newSession The new session from DynamoDB stream
 * @param oldSession The old session from DynamoDB stream (if available)
 * @returns Updated session with insights populated if needed
 */
async function processInsightsChanges(newSession: ChatSession<RecordOrUndef>, oldSession?: ChatSession<RecordOrUndef>): Promise<ChatSession<RecordOrUndef>> {
    const newInsightsUrl = newSession.insightsS3Url;
    const oldInsightsUrl = oldSession?.insightsS3Url;

    // Case 1: No insights URL changes - preserve existing insights if any
    if (newInsightsUrl === oldInsightsUrl) {
        // No change in insights URL, don't modify the insights field
        // This ensures we don't overwrite existing insights in OpenSearch
        return newSession;
    }

    // Case 2: Insights URL was removed (was set, now undefined/null)
    if (oldInsightsUrl && !newInsightsUrl) {
        console.log(`Session ${newSession.sessionId}: Insights URL removed, clearing insights`);
        return {
            ...newSession,
            insights: undefined // Explicitly remove insights
        };
    }

    // Case 3: Insights URL was added or changed
    if (newInsightsUrl) {
        console.log(`Session ${newSession.sessionId}: Insights URL ${oldInsightsUrl ? 'changed' : 'added'}: ${newInsightsUrl}`);

        const insights = await readInsightsFromS3(newInsightsUrl);
        return {
            ...newSession,
            insights
        };
    }

    // Case 4: No insights URL in either (should not happen but handle gracefully)
    return newSession;
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
        record_id: { S: `${record.userId || record.user_id}#${record.sessionId || record.session_id}` },
        // Metadata
        pk: { S: record.userId || record.user_id || '' },
        sk: { S: record.sessionId || record.session_id || '' },
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
