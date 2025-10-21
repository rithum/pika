import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Migration tool to update chat session records with composite sort key.
 * Adds/updates the chat_app_sk attribute with format: chatAppId#source#lastUpdate
 * where source is either 'user' or 'component'
 */

interface ChatSession {
    session_id: string;
    user_id: string;
    chat_app_id: string;
    last_update: number;
    source?: string;
    chat_app_sk?: string;
    [key: string]: any;
}

interface MigrationStats {
    scanned: number;
    updated: number;
    skipped: number;
    errors: number;
}

async function loadEnvironment(): Promise<{ stage: string; projectName: string }> {
    const envPath = path.join(process.cwd(), '.env.local');

    if (!fs.existsSync(envPath)) {
        console.error('ERROR: .env.local file not found!');
        console.error(`Expected location: ${envPath}`);
        console.error('\nPlease create a .env.local file with the following variables:');
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

function createCompositeKey(chatAppId: string, source: string | undefined, lastUpdate: number): string {
    // Map source to the value used in composite key
    // If source is missing, 'user', or 'component-as-user', use 'user' in the key
    // If source is 'component', use 'component' in the key
    const sourceForKey = !source || source === 'user' || source === 'component-as-user' ? 'user' : 'component';
    return `${chatAppId}#${sourceForKey}#${lastUpdate}`;
}

async function migrateSession(docClient: DynamoDBDocumentClient, tableName: string, session: ChatSession): Promise<boolean> {
    try {
        // Default source to 'user' if not present
        const source = session.source || 'user';
        const compositeKey = createCompositeKey(session.chat_app_id, source, session.last_update);

        // Check what needs to be updated
        const needsCompositeKey = session.chat_app_sk !== compositeKey;
        const needsSource = !session.source;

        // Skip if nothing needs updating
        if (!needsCompositeKey && !needsSource) {
            return false; // Skipped
        }

        // Build update expression
        const setExpressions: string[] = [];
        const expressionAttributeValues: any = {};
        const expressionAttributeNames: any = {};

        // Add composite key if needed
        if (needsCompositeKey) {
            setExpressions.push('chat_app_sk = :composite');
            expressionAttributeValues[':composite'] = compositeKey;
        }

        // Add source if needed
        if (needsSource) {
            setExpressions.push('#source = :source');
            expressionAttributeNames['#source'] = 'source';
            expressionAttributeValues[':source'] = 'user';
        }

        const updateParams: any = {
            TableName: tableName,
            Key: {
                session_id: session.session_id,
                user_id: session.user_id
            },
            UpdateExpression: `SET ${setExpressions.join(', ')}`,
            ExpressionAttributeValues: expressionAttributeValues
        };

        // Add ExpressionAttributeNames only if we're setting source
        if (needsSource) {
            updateParams.ExpressionAttributeNames = expressionAttributeNames;
        }

        await docClient.send(new UpdateCommand(updateParams));

        return true; // Updated
    } catch (error) {
        console.error(`Failed to update session ${session.session_id}:`, error instanceof Error ? error.message : error);
        throw error;
    }
}

async function scanAndMigrate(docClient: DynamoDBDocumentClient, tableName: string): Promise<MigrationStats> {
    const stats: MigrationStats = {
        scanned: 0,
        updated: 0,
        skipped: 0,
        errors: 0
    };

    let lastEvaluatedKey: Record<string, any> | undefined = undefined;
    let pageNumber = 0;

    do {
        pageNumber++;
        console.log(`\nScanning page ${pageNumber}...`);

        const scanParams: ScanCommandInput = {
            TableName: tableName,
            ExclusiveStartKey: lastEvaluatedKey
        };

        try {
            const response = await docClient.send(new ScanCommand(scanParams));

            if (response.Items && response.Items.length > 0) {
                stats.scanned += response.Items.length;
                console.log(`  Found ${response.Items.length} sessions on this page`);

                for (const item of response.Items as ChatSession[]) {
                    try {
                        const wasUpdated = await migrateSession(docClient, tableName, item);
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
    console.log('Chat Session Composite Key Migration Tool');
    console.log('==========================================\n');

    // Load environment
    const { stage, projectName } = await loadEnvironment();
    const tableName = `chat-session-${projectName}-${stage}`;

    console.log('Configuration:');
    console.log(`  Stage: ${stage}`);
    console.log(`  Project Name: ${projectName}`);
    console.log(`  Table Name: ${tableName}`);
    console.log('');

    // Initialize DynamoDB client
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);

    console.log('Starting migration...');
    console.log('Progress: . = updated, s = skipped (already migrated), E = error\n');

    const startTime = Date.now();

    try {
        const stats = await scanAndMigrate(docClient, tableName);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n==========================================');
        console.log('Migration Complete!');
        console.log('==========================================');
        console.log(`Total sessions scanned: ${stats.scanned}`);
        console.log(`Sessions updated: ${stats.updated}`);
        console.log(`Sessions skipped: ${stats.skipped}`);
        console.log(`Errors: ${stats.errors}`);
        console.log(`Duration: ${duration}s`);

        if (stats.errors > 0) {
            console.log('\n⚠️  Some errors occurred during migration. Please review the logs above.');
            process.exit(1);
        }

        console.log('\n✓ Migration completed successfully!');
    } catch (error) {
        console.error('\n==========================================');
        console.error('Migration Failed!');
        console.error('==========================================');
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

// Run the migration
main();
