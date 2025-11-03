import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, ScanCommandInput, GetCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import pMap from 'p-map';

/**
 * Migration tool to add invocationMode and userType to chat message records.
 * Looks up the session and copies both invocationMode and userType from the session to the message.
 * Defaults: invocationMode='chat-app', userType='internal-user' if not found.
 *
 * Optimized with batch writes and parallel processing for high performance.
 */

const BATCH_SIZE = 25; // DynamoDB BatchWrite limit
const CONCURRENCY = 10; // Number of parallel batch operations
const SCAN_LIMIT = 500; // Scan more items at once

interface ChatMessage {
    user_id: string;
    message_id: string;
    session_id: string;
    invocation_mode?: string;
    user_type?: string;
    [key: string]: any;
}

interface ChatSession {
    session_id: string;
    user_id: string;
    invocation_mode?: string;
    user_type?: string;
    [key: string]: any;
}

interface MigrationStats {
    scanned: number;
    updated: number;
    skipped: number;
    errors: number;
    sessionCacheLookups: number;
    sessionDbLookups: number;
    batchWriteCount: number;
}

async function loadEnvironment(): Promise<{ stage: string; projectName: string }> {
    // Look for .env.local in services/pika/ directory
    const envPath = path.join(__dirname, '..', '..', '.env.local');

    if (!fs.existsSync(envPath)) {
        console.error('ERROR: .env.local file not found!');
        console.error(`Expected location: ${envPath}`);
        console.error('\nPlease create a .env.local file in services/pika/ with the following variables:');
        console.error('  stage=<your-stage>');
        console.error('  PIKA_SERVICE_PROJ_NAME_KEBAB_CASE=<your-project-name>');
        process.exit(1);
    }

    dotenv.config({ path: envPath });

    const stage = process.env.stage;
    const projectName = process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE;

    if (!stage || !projectName) {
        console.error('ERROR: Missing required environment variables in .env.local');
        console.error('\nRequired variables:');
        console.error(`  stage: ${stage ? '✓' : '✗ MISSING'}`);
        console.error(`  PIKA_SERVICE_PROJ_NAME_KEBAB_CASE: ${projectName ? '✓' : '✗ MISSING'}`);
        process.exit(1);
    }

    return { stage, projectName };
}

async function getSessionMetadata(
    docClient: DynamoDBDocumentClient,
    sessionTableName: string,
    sessionId: string,
    userId: string,
    sessionCache: Map<string, { invocationMode: string; userType: string }>,
    stats: MigrationStats
): Promise<{ invocationMode: string; userType: string }> {
    // Check cache first
    const cacheKey = `${userId}:${sessionId}`;
    const cachedMetadata = sessionCache.get(cacheKey);
    if (cachedMetadata) {
        stats.sessionCacheLookups++;
        return cachedMetadata;
    }

    // Look up session from database
    stats.sessionDbLookups++;
    try {
        const response = await docClient.send(
            new GetCommand({
                TableName: sessionTableName,
                Key: {
                    user_id: userId,
                    session_id: sessionId
                }
            })
        );

        const session = response.Item as ChatSession | undefined;
        const metadata = {
            invocationMode: session?.invocation_mode ?? 'chat-app',
            userType: session?.user_type ?? 'internal-user'
        };

        // Cache the result
        sessionCache.set(cacheKey, metadata);

        if (!session) {
            console.warn(`\n⚠ Session not found: ${sessionId}, using defaults`);
        }

        return metadata;
    } catch (error) {
        console.warn(`\n⚠ Error looking up session ${sessionId}:`, error instanceof Error ? error.message : error);
        // Default values on error
        const defaultMetadata = {
            invocationMode: 'chat-app',
            userType: 'internal-user'
        };
        sessionCache.set(cacheKey, defaultMetadata);
        return defaultMetadata;
    }
}

async function prepareMessageForUpdate(
    docClient: DynamoDBDocumentClient,
    sessionTableName: string,
    message: ChatMessage,
    sessionCache: Map<string, { invocationMode: string; userType: string }>,
    stats: MigrationStats
): Promise<{ needsUpdate: boolean; updatedMessage: ChatMessage | null }> {
    // Skip if both fields already set
    if (message.invocation_mode && message.user_type) {
        return { needsUpdate: false, updatedMessage: null };
    }

    // Look up session metadata
    const { invocationMode, userType } = await getSessionMetadata(docClient, sessionTableName, message.session_id, message.user_id, sessionCache, stats);

    // Check if we need to update anything
    const needsInvocationMode = !message.invocation_mode;
    const needsUserType = !message.user_type;

    if (!needsInvocationMode && !needsUserType) {
        return { needsUpdate: false, updatedMessage: null };
    }

    // Create updated message (full item for BatchWrite)
    const updatedMessage = { ...message };
    if (needsInvocationMode) {
        updatedMessage.invocation_mode = invocationMode;
    }
    if (needsUserType) {
        updatedMessage.user_type = userType;
    }

    return { needsUpdate: true, updatedMessage };
}

/**
 * Batch write messages to DynamoDB (up to 25 items per batch)
 */
async function batchWriteMessages(docClient: DynamoDBDocumentClient, messageTableName: string, messages: ChatMessage[], stats: MigrationStats): Promise<void> {
    if (messages.length === 0) {
        return;
    }

    // Split into chunks of 25 (DynamoDB BatchWrite limit)
    const chunks: ChatMessage[][] = [];
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        chunks.push(messages.slice(i, i + BATCH_SIZE));
    }

    // Process chunks in parallel with concurrency limit
    await pMap(
        chunks,
        async (chunk) => {
            try {
                const writeRequests = chunk.map((message) => ({
                    PutRequest: {
                        Item: message
                    }
                }));

                await docClient.send(
                    new BatchWriteCommand({
                        RequestItems: {
                            [messageTableName]: writeRequests
                        }
                    })
                );

                stats.batchWriteCount++;
                stats.updated += chunk.length;
            } catch (error) {
                console.error(`\nFailed to batch write ${chunk.length} messages:`, error instanceof Error ? error.message : error);
                stats.errors += chunk.length;
                throw error;
            }
        },
        { concurrency: CONCURRENCY }
    );
}

async function scanAndMigrate(docClient: DynamoDBDocumentClient, messageTableName: string, sessionTableName: string): Promise<MigrationStats> {
    const stats: MigrationStats = {
        scanned: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        sessionCacheLookups: 0,
        sessionDbLookups: 0,
        batchWriteCount: 0
    };

    // Cache for session lookups
    const sessionCache = new Map<string, { invocationMode: string; userType: string }>();

    let lastEvaluatedKey: Record<string, any> | undefined = undefined;
    let pageNumber = 0;

    do {
        pageNumber++;
        console.log(`\n📄 Scanning page ${pageNumber}...`);

        const scanParams: ScanCommandInput = {
            TableName: messageTableName,
            ExclusiveStartKey: lastEvaluatedKey,
            Limit: SCAN_LIMIT
        };

        try {
            const response = await docClient.send(new ScanCommand(scanParams));

            if (response.Items && response.Items.length > 0) {
                const messages = response.Items as ChatMessage[];
                stats.scanned += messages.length;
                console.log(`  Found ${messages.length} messages on this page`);

                // Prepare all messages for update (check which ones need updates)
                const preparationPromises = messages.map((message) => prepareMessageForUpdate(docClient, sessionTableName, message, sessionCache, stats));

                const preparations = await Promise.all(preparationPromises);

                // Collect messages that need updates
                const messagesToUpdate: ChatMessage[] = [];
                preparations.forEach(({ needsUpdate, updatedMessage }, index) => {
                    if (needsUpdate && updatedMessage) {
                        messagesToUpdate.push(updatedMessage);
                        process.stdout.write('.');
                    } else {
                        stats.skipped++;
                        process.stdout.write('s');
                    }
                });

                // Batch write all messages that need updates
                if (messagesToUpdate.length > 0) {
                    try {
                        await batchWriteMessages(docClient, messageTableName, messagesToUpdate, stats);
                    } catch (error) {
                        // Error already logged in batchWriteMessages
                        process.stdout.write('E');
                    }
                }

                console.log(''); // New line after progress indicators
                console.log(
                    `  💾 Cache: ${stats.sessionCacheLookups} hits, ${stats.sessionDbLookups} lookups | ` + `Batches: ${stats.batchWriteCount} (${messagesToUpdate.length} updates)`
                );
            }

            lastEvaluatedKey = response.LastEvaluatedKey;
        } catch (error) {
            console.error('Error during scan:', error instanceof Error ? error.message : error);
            throw error;
        }
    } while (lastEvaluatedKey);

    return stats;
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  Chat Message Metadata Backfill Tool (Optimized)          ║');
    console.log('║  Adds invocationMode and userType to messages             ║');
    console.log('║  Using batch writes and parallel processing               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Load environment
    const { stage, projectName } = await loadEnvironment();
    const messageTableName = `chat-message-${projectName}-${stage}`;
    const sessionTableName = `chat-session-${projectName}-${stage}`;

    console.log('⚙️  Configuration:');
    console.log(`  Stage: ${stage}`);
    console.log(`  Project Name: ${projectName}`);
    console.log(`  Message Table: ${messageTableName}`);
    console.log(`  Session Table: ${sessionTableName}`);
    console.log(`  Batch Size: ${BATCH_SIZE} items per batch`);
    console.log(`  Concurrency: ${CONCURRENCY} parallel batches`);
    console.log(`  Scan Limit: ${SCAN_LIMIT} items per page`);
    console.log('');

    // Initialize DynamoDB client
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);

    console.log('🚀 Starting backfill...');
    console.log('Progress: . = updated, s = skipped (already has both fields), E = error\n');

    const startTime = Date.now();

    try {
        const stats = await scanAndMigrate(docClient, messageTableName, sessionTableName);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const messagesPerSec = ((stats.scanned / (Date.now() - startTime)) * 1000).toFixed(1);

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  ✅ Backfill Complete!                                    ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`\n📊 Statistics:`);
        console.log(`  Total messages scanned: ${stats.scanned} (${messagesPerSec}/sec)`);
        console.log(`  Messages updated: ${stats.updated}`);
        console.log(`  Messages skipped: ${stats.skipped}`);
        console.log(`  Errors: ${stats.errors}`);
        console.log(`  Batch write operations: ${stats.batchWriteCount}`);
        console.log(`  Session cache hits: ${stats.sessionCacheLookups}`);
        console.log(`  Session DB lookups: ${stats.sessionDbLookups}`);
        console.log(`  Duration: ${duration}s`);

        if (stats.errors > 0) {
            console.log('\n⚠️  Some errors occurred during backfill. Please review the logs above.');
            process.exit(1);
        }

        console.log('\n✅ Backfill completed successfully!');
        console.log('\n📝 Note: The DynamoDB stream will automatically replicate these changes to OpenSearch.');
    } catch (error) {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  ❌ Backfill Failed!                                      ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

// Run the backfill
main();
