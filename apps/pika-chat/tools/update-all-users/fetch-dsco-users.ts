#!/usr/bin/env tsx

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, type ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import anotherNameParser from 'another-name-parser';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tool to fetch all users from the DSCO Leo Auth DynamoDB table and export them to a JSONL file.
 * This reads the LEO_AUTH_USER_TABLE_NAME from .env.local and streams the results to all-users.jsonl.
 * 
 * Only exports users that have context.user_id and context.full_name.
 * Parses the full_name and writes: user_id, first_name, last_name
 */

interface DscoUser {
    context: any;
}

interface UserWithNames {
    user_id: string;
    first_name: string;
    last_name: string;
}

/**
 * Transform a DSCO user record into a user with parsed names.
 * Returns undefined if the user doesn't have the required fields.
 */
function transformDscoUser(dscoUser: DscoUser): UserWithNames | undefined {
    // Check if context exists
    if (!dscoUser.context) {
        return undefined;
    }

    // Parse the context if it's a string
    let context = dscoUser.context;
    if (typeof context === 'string') {
        try {
            context = JSON.parse(context);
        } catch (e) {
            console.error('Failed to parse context:', e);
            return undefined;
        }
    }

    // Check if user_id and full_name exist
    if (!context.user_id || !context.full_name) {
        return undefined;
    }

    // Parse the full_name using the same logic as auth-provider
    let firstName: string | undefined = undefined;
    let lastName: string | undefined = undefined;

    try {
        const parsedName = anotherNameParser(context.full_name);
        firstName = parsedName.first || undefined;
        lastName = (parsedName.middle ? `${parsedName.middle} ` : '') + parsedName.last + (parsedName.suffix ? ` ${parsedName.suffix}` : '') || undefined;
    } catch (e) {
        console.error(`Failed to parse name "${context.full_name}":`, e);
        return undefined;
    }

    // Return undefined if we couldn't parse a firstName or lastName
    if (!firstName || !lastName) {
        return undefined;
    }

    return {
        user_id: context.user_id.toString(),
        first_name: firstName,
        last_name: lastName
    };
}

interface ScanStats {
    scanned: number;
    written: number;
    skipped: number;
    pages: number;
    errors: number;
}

async function loadEnvironment(): Promise<{ tableName: string }> {
    // Load .env.local from apps/pika-chat root
    const envPath = path.join(__dirname, '..', '..', '.env.local');

    if (!fs.existsSync(envPath)) {
        console.error('ERROR: .env.local file not found!');
        console.error(`Expected location: ${envPath}`);
        console.error('\nPlease create a .env.local file in apps/pika-chat/ with:');
        console.error('  LEO_AUTH_USER_TABLE_NAME=<your-leo-auth-table-name>');
        process.exit(1);
    }

    dotenv.config({ path: envPath });

    const tableName = process.env.LEO_AUTH_USER_TABLE_NAME;

    if (!tableName) {
        console.error('ERROR: Missing required environment variable in .env.local');
        console.error('\nRequired variable:');
        console.error(`  LEO_AUTH_USER_TABLE_NAME: ✗ MISSING`);
        process.exit(1);
    }

    return { tableName };
}

async function scanAndExport(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    outputFile: string
): Promise<ScanStats> {
    const stats: ScanStats = {
        scanned: 0,
        written: 0,
        skipped: 0,
        pages: 0,
        errors: 0
    };

    // Open file for writing (overwrite if exists)
    const writeStream = fs.createWriteStream(outputFile, { flags: 'w', encoding: 'utf8' });

    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    try {
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
                    console.log(`  Found ${response.Items.length} users on this page`);

                    for (const item of response.Items as DscoUser[]) {
                        try {
                            // Transform the DSCO user to extract user_id, first_name, last_name
                            const transformedUser = transformDscoUser(item);
                            
                            if (transformedUser) {
                                // Write as JSON line (one JSON object per line)
                                writeStream.write(JSON.stringify(transformedUser) + '\n');
                                stats.written++;
                                process.stdout.write('.');
                            } else {
                                // Skip users without required fields
                                stats.skipped++;
                                process.stdout.write('s');
                            }
                        } catch (error) {
                            stats.errors++;
                            process.stdout.write('E');
                            console.error(`\nError processing item:`, error instanceof Error ? error.message : error);
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

        // Close the write stream
        writeStream.end();

        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => resolve(stats));
            writeStream.on('error', reject);
        });
    } catch (error) {
        writeStream.end();
        throw error;
    }
}

async function main() {
    console.log('DSCO Leo Auth User Export Tool');
    console.log('================================\n');

    // Load environment
    const { tableName } = await loadEnvironment();
    const outputFile = path.join(__dirname, 'all-users.jsonl');

    console.log('Configuration:');
    console.log(`  Table Name: ${tableName}`);
    console.log(`  Output File: ${outputFile}`);
    console.log('');

    // Initialize DynamoDB client
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);

    console.log('Starting export...');
    console.log('Progress: . = written, s = skipped (no full_name or user_id), E = error\n');

    const startTime = Date.now();

    try {
        const stats = await scanAndExport(docClient, tableName, outputFile);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n================================');
        console.log('Export Complete!');
        console.log('================================');
        console.log(`Total users scanned: ${stats.scanned}`);
        console.log(`Users written: ${stats.written}`);
        console.log(`Users skipped: ${stats.skipped}`);
        console.log(`Pages scanned: ${stats.pages}`);
        console.log(`Errors: ${stats.errors}`);
        console.log(`Duration: ${duration}s`);
        console.log(`Output file: ${outputFile}`);

        if (stats.errors > 0) {
            console.log('\n⚠ Some errors occurred during export. Please review the logs above.');
            process.exit(1);
        }

        console.log('\n✓ Export completed successfully!');
    } catch (error) {
        console.error('\n================================');
        console.error('Export Failed!');
        console.error('================================');
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

// Run the export
main();

