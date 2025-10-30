#!/usr/bin/env tsx

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, type ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tool to update firstName and lastName in the chat-user table based on data from all-users.jsonl.
 * 
 * Process:
 * 1. Load all users from all-users.jsonl into memory (Map for fast lookup)
 * 2. Scan the chat-user table
 * 3. For each user, check if we have firstName/lastName from DSCO
 * 4. Update ONLY firstName and lastName if we have data (don't touch anything else)
 */

interface UserWithNames {
    user_id: string;
    first_name: string;
    last_name: string;
}

interface ChatUser {
    user_id: string;
    first_name?: string;
    last_name?: string;
    [key: string]: any;
}

interface UpdateStats {
    scanned: number;
    updated: number;
    skipped: number;
    errors: number;
    pages: number;
}

async function loadEnvironment(): Promise<{ stage: string; projectName: string; chatUserTableName: string }> {
    // Load .env.local from apps/pika-chat root
    const envPath = path.join(__dirname, '..', '..', '.env.local');

    if (!fs.existsSync(envPath)) {
        console.error('ERROR: .env.local file not found!');
        console.error(`Expected location: ${envPath}`);
        console.error('\nPlease create a .env.local file in apps/pika-chat/ with:');
        console.error('  STAGE=<your-stage>');
        console.error('  PIKA_SERVICE_PROJ_NAME_KEBAB_CASE=<your-project-name>');
        process.exit(1);
    }

    dotenv.config({ path: envPath });

    const stage = process.env.STAGE;
    const projectName = process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE;

    if (!stage || !projectName) {
        console.error('ERROR: Missing required environment variables in .env.local');
        console.error('\nRequired variables:');
        console.error(`  STAGE: ${stage ? '✓' : '✗ MISSING'}`);
        console.error(`  PIKA_SERVICE_PROJ_NAME_KEBAB_CASE: ${projectName ? '✓' : '✗ MISSING'}`);
        process.exit(1);
    }

    const chatUserTableName = `chat-user-${projectName}-${stage}`;

    return { stage, projectName, chatUserTableName };
}

/**
 * Load all users from all-users.jsonl into a Map for fast lookup
 */
async function loadUsersFromFile(filePath: string): Promise<Map<string, UserWithNames>> {
    const userMap = new Map<string, UserWithNames>();

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let lineCount = 0;
    for await (const line of rl) {
        if (line.trim()) {
            try {
                const user: UserWithNames = JSON.parse(line);
                userMap.set(user.user_id, user);
                lineCount++;
            } catch (e) {
                console.error(`Error parsing line: ${line}`, e);
            }
        }
    }

    console.log(`Loaded ${lineCount} users from ${filePath}`);
    return userMap;
}

/**
 * Update a chat user's firstName and lastName if we have data from DSCO
 */
async function updateChatUser(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    chatUser: ChatUser,
    dscoUser: UserWithNames
): Promise<boolean> {
    // Check if update is needed
    const needsUpdate = 
        chatUser.first_name !== dscoUser.first_name || 
        chatUser.last_name !== dscoUser.last_name;

    if (!needsUpdate) {
        return false; // No update needed
    }

    // Update only firstName and lastName
    await docClient.send(
        new UpdateCommand({
            TableName: tableName,
            Key: {
                user_id: chatUser.user_id
            },
            UpdateExpression: 'SET first_name = :firstName, last_name = :lastName',
            ExpressionAttributeValues: {
                ':firstName': dscoUser.first_name,
                ':lastName': dscoUser.last_name
            }
        })
    );

    return true; // Updated
}

/**
 * Scan the chat-user table and update users with data from DSCO
 */
async function scanAndUpdate(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    userMap: Map<string, UserWithNames>
): Promise<UpdateStats> {
    const stats: UpdateStats = {
        scanned: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        pages: 0
    };

    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    do {
        stats.pages++;
        console.log(`\nScanning page ${stats.pages}...`);

        const scanParams: ScanCommandInput = {
            TableName: tableName,
            ExclusiveStartKey: lastEvaluatedKey
        };

        try {
            const response = await docClient.send(new ScanCommand(scanParams));

            if (response.Items && response.Items.length > 0) {
                stats.scanned += response.Items.length;
                console.log(`  Found ${response.Items.length} chat users on this page`);

                for (const item of response.Items as ChatUser[]) {
                    try {
                        // Look up user in DSCO data
                        const dscoUser = userMap.get(item.user_id);

                        if (dscoUser) {
                            // We have DSCO data for this user, try to update
                            const wasUpdated = await updateChatUser(docClient, tableName, item, dscoUser);
                            if (wasUpdated) {
                                stats.updated++;
                                process.stdout.write('.');
                            } else {
                                stats.skipped++;
                                process.stdout.write('s');
                            }
                        } else {
                            // No DSCO data for this user
                            stats.skipped++;
                            process.stdout.write('n');
                        }
                    } catch (error) {
                        stats.errors++;
                        process.stdout.write('E');
                        console.error(`\nError updating user ${item.user_id}:`, error instanceof Error ? error.message : error);
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
    console.log('Chat User Name Update Tool');
    console.log('==========================\n');

    // Load environment
    const { stage, projectName, chatUserTableName } = await loadEnvironment();
    const usersFile = path.join(__dirname, 'all-users.jsonl');

    console.log('Configuration:');
    console.log(`  Stage: ${stage}`);
    console.log(`  Project Name: ${projectName}`);
    console.log(`  Chat User Table: ${chatUserTableName}`);
    console.log(`  DSCO Users File: ${usersFile}`);
    console.log('');

    // Check if users file exists
    if (!fs.existsSync(usersFile)) {
        console.error('ERROR: all-users.jsonl file not found!');
        console.error(`Expected location: ${usersFile}`);
        console.error('\nPlease run fetch-dsco-users.ts first to generate the file.');
        process.exit(1);
    }

    // Load users from file
    console.log('Loading DSCO users from file...');
    const userMap = await loadUsersFromFile(usersFile);
    console.log('');

    // Initialize DynamoDB client
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);

    console.log('Starting update...');
    console.log('Progress: . = updated, s = skipped (no change needed), n = no DSCO data, E = error\n');

    const startTime = Date.now();

    try {
        const stats = await scanAndUpdate(docClient, chatUserTableName, userMap);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n==========================');
        console.log('Update Complete!');
        console.log('==========================');
        console.log(`Total chat users scanned: ${stats.scanned}`);
        console.log(`Users updated: ${stats.updated}`);
        console.log(`Users skipped: ${stats.skipped}`);
        console.log(`Pages scanned: ${stats.pages}`);
        console.log(`Errors: ${stats.errors}`);
        console.log(`Duration: ${duration}s`);

        if (stats.errors > 0) {
            console.log('\n⚠ Some errors occurred during update. Please review the logs above.');
            process.exit(1);
        }

        console.log('\n✓ Update completed successfully!');
    } catch (error) {
        console.error('\n==========================');
        console.error('Update Failed!');
        console.error('==========================');
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

// Run the update
main();

