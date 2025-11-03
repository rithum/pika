import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, ScanCommandInput, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Migration tool to add userType to chat session records.
 * Looks up the user from the chat-user table and adds their userType to the session.
 * Defaults to 'external-user' if the user is not found.
 */

interface ChatSession {
    session_id: string;
    user_id: string;
    user_type?: string;
    [key: string]: any;
}

interface ChatUser {
    user_id: string;
    user_type?: string;
    [key: string]: any;
}

interface MigrationStats {
    scanned: number;
    updated: number;
    skipped: number;
    errors: number;
    userCacheLookups: number;
    userDbLookups: number;
}

async function loadEnvironment(): Promise<{ stage: string; projectName: string }> {
    // Look for .env.local in services/pika/ directory (go up two levels from tools/add-user-type-to-chat-user/)
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

async function getUserType(docClient: DynamoDBDocumentClient, userTableName: string, userId: string, userCache: Map<string, string>, stats: MigrationStats): Promise<string> {
    // Check cache first
    const cachedUserType = userCache.get(userId);
    if (cachedUserType) {
        stats.userCacheLookups++;
        return cachedUserType;
    }

    // Look up user from database
    stats.userDbLookups++;
    try {
        const response = await docClient.send(
            new GetCommand({
                TableName: userTableName,
                Key: {
                    user_id: userId
                }
            })
        );

        const user = response.Item as ChatUser | undefined;
        const userType = user?.user_type ?? 'external-user';

        // Cache the result
        userCache.set(userId, userType);

        if (!user) {
            console.warn(`\n User not found: ${userId}, defaulting to 'external-user'`);
            // TODO: Should we be throwing an exception if the user doesn't really exist? I think so
        }

        return userType;
    } catch (error) {
        console.warn(`\n Error looking up user ${userId}:`, error instanceof Error ? error.message : error);
        // Default to external-user on error
        const defaultType = 'external-user';
        userCache.set(userId, defaultType);
        return defaultType;
    }
}

async function migrateSession(
    docClient: DynamoDBDocumentClient,
    sessionTableName: string,
    userTableName: string,
    session: ChatSession,
    userCache: Map<string, string>,
    stats: MigrationStats
): Promise<boolean> {
    try {
        // Skip if userType already set
        if (session.user_type) {
            return false; // Skipped
        }

        // Look up user's userType
        const userType = await getUserType(docClient, userTableName, session.user_id, userCache, stats);

        // Update session with userType
        await docClient.send(
            new UpdateCommand({
                TableName: sessionTableName,
                Key: {
                    session_id: session.session_id,
                    user_id: session.user_id
                },
                UpdateExpression: 'SET user_type = :userType',
                ExpressionAttributeValues: {
                    ':userType': userType
                }
            })
        );

        return true; // Updated
    } catch (error) {
        console.error(`\nFailed to update session ${session.session_id}:`, error instanceof Error ? error.message : error);
        throw error;
    }
}

async function scanAndMigrate(docClient: DynamoDBDocumentClient, sessionTableName: string, userTableName: string): Promise<MigrationStats> {
    const stats: MigrationStats = {
        scanned: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        userCacheLookups: 0,
        userDbLookups: 0
    };

    // Cache for user lookups
    const userCache = new Map<string, string>();

    let lastEvaluatedKey: Record<string, any> | undefined = undefined;
    let pageNumber = 0;

    do {
        pageNumber++;
        console.log(`\nScanning page ${pageNumber}...`);

        const scanParams: ScanCommandInput = {
            TableName: sessionTableName,
            ExclusiveStartKey: lastEvaluatedKey
        };

        try {
            const response = await docClient.send(new ScanCommand(scanParams));

            if (response.Items && response.Items.length > 0) {
                stats.scanned += response.Items.length;
                console.log(`  Found ${response.Items.length} sessions on this page`);

                for (const item of response.Items as ChatSession[]) {
                    try {
                        const wasUpdated = await migrateSession(docClient, sessionTableName, userTableName, item, userCache, stats);
                        if (wasUpdated) {
                            stats.updated++;
                            process.stdout.write('.');
                        } else {
                            stats.skipped++;
                            process.stdout.write('s');
                        }
                    } catch (error) {
                        stats.errors++;
                        process.stdout.write('E');
                    }
                }

                console.log(''); // New line after progress indicators
                console.log(`  Cache stats: ${stats.userCacheLookups} cache hits, ${stats.userDbLookups} DB lookups`);
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
    console.log('Chat Session UserType Backfill Tool');
    console.log('====================================\n');

    // Load environment
    const { stage, projectName } = await loadEnvironment();
    const sessionTableName = `chat-session-${projectName}-${stage}`;
    const userTableName = `chat-user-${projectName}-${stage}`;

    console.log('Configuration:');
    console.log(`  Stage: ${stage}`);
    console.log(`  Project Name: ${projectName}`);
    console.log(`  Session Table Name: ${sessionTableName}`);
    console.log(`  User Table Name: ${userTableName}`);
    console.log('');

    // Initialize DynamoDB client
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);

    console.log('Starting backfill...');
    console.log('Progress: . = updated, s = skipped (already has userType), E = error\n');

    const startTime = Date.now();

    try {
        const stats = await scanAndMigrate(docClient, sessionTableName, userTableName);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n====================================');
        console.log('Backfill Complete!');
        console.log('====================================');
        console.log(`Total sessions scanned: ${stats.scanned}`);
        console.log(`Sessions updated: ${stats.updated}`);
        console.log(`Sessions skipped: ${stats.skipped}`);
        console.log(`Errors: ${stats.errors}`);
        console.log(`User cache hits: ${stats.userCacheLookups}`);
        console.log(`User DB lookups: ${stats.userDbLookups}`);
        console.log(`Duration: ${duration}s`);

        if (stats.errors > 0) {
            console.log('\n Some errors occurred during backfill. Please review the logs above.');
            process.exit(1);
        }

        console.log('\n✓ Backfill completed successfully!');
        console.log('\nNote: The DynamoDB stream will automatically replicate these changes to OpenSearch.');
    } catch (error) {
        console.error('\n====================================');
        console.error('Backfill Failed!');
        console.error('====================================');
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

// Run the backfill
main();
