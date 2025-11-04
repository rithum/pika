#!/usr/bin/env node
/**
 * Clear Corrupted Feedback
 * 
 * This tool completely removes feedback from sessions that have hit the 10K limit,
 * as this indicates corrupted auto-generated feedback from repeated backfill operations.
 * It also checks and fixes any stale lastMessageId values in DynamoDB.
 * 
 * Usage:
 *   npx tsx tools/backfill-messages-to-opensearch/clear-corrupted-feedback.ts [options]
 * 
 * Options:
 *   --dry-run           Preview changes without applying them
 *   --threshold N       Feedback count threshold (default: 5000)
 *   --report-file PATH  Use a specific diagnostic report file
 * 
 * This tool performs two operations:
 * 1. Clears all feedback from corrupted sessions in OpenSearch
 * 2. Fixes stale lastMessageId values in DynamoDB when lastMessageId < lastAnalyzedMessageId
 */

import opensearchClient from '../../src/lib/opensearch/opensearch-client';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Load .env.local if present
const envPath = path.join(__dirname, '..', '..', '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`Loaded environment variables from ${envPath}\n`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const THRESHOLD = parseInt(args.find((arg, i) => args[i - 1] === '--threshold') || '200', 10);
const REPORT_FILE = args.find((arg, i) => args[i - 1] === '--report-file');

interface CleanupStats {
    sessionsProcessed: number;
    sessionsCleared: number;
    totalFeedbackRemoved: number;
    sessionsWithFixedLastMessageId: number;
    errors: number;
}

async function main() {
    console.log('='.repeat(80));
    console.log('Clear Corrupted Feedback');
    console.log('='.repeat(80));
    console.log(`Dry Run: ${DRY_RUN}`);
    console.log(`Threshold: ${THRESHOLD} feedback entries`);
    console.log('='.repeat(80));
    console.log('');

    if (DRY_RUN) {
        console.log('DRY RUN MODE - No changes will be made\n');
    }

    const stats: CleanupStats = {
        sessionsProcessed: 0,
        sessionsCleared: 0,
        totalFeedbackRemoved: 0,
        sessionsWithFixedLastMessageId: 0,
        errors: 0
    };

    const startTime = Date.now();

    try {
        let sessionsToClean: Array<{ sessionId: string; feedbackCount: number }> = [];

        if (REPORT_FILE) {
            // Load from diagnostic report
            const reportData = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf-8'));
            sessionsToClean = reportData.sessions
                .filter((s: any) => s.feedbackCount >= THRESHOLD)
                .map((s: any) => ({
                    sessionId: s.sessionId,
                    feedbackCount: s.feedbackCount
                }));
            console.log(`Loaded ${sessionsToClean.length} sessions from report file\n`);
        } else {
            // Auto-find latest diagnostic report
            const reportFiles = fs
                .readdirSync(__dirname)
                .filter((f) => f.startsWith('excessive-feedback-diagnosis-') && f.endsWith('.json'))
                .sort()
                .reverse();

            if (reportFiles.length > 0) {
                const latestReport = path.join(__dirname, reportFiles[0]);
                console.log(`Using latest diagnostic report: ${reportFiles[0]}\n`);
                const reportData = JSON.parse(fs.readFileSync(latestReport, 'utf-8'));
                sessionsToClean = reportData.sessions
                    .filter((s: any) => s.feedbackCount >= THRESHOLD)
                    .map((s: any) => ({
                        sessionId: s.sessionId,
                        feedbackCount: s.feedbackCount
                    }));
            } else {
                console.error('No diagnostic report found. Please run diagnose-excessive-feedback.ts first.');
                process.exit(1);
            }
        }

        if (sessionsToClean.length === 0) {
            console.log('No sessions to clean.');
            return;
        }

        console.log(`Found ${sessionsToClean.length} sessions to clean:\n`);
        for (const session of sessionsToClean) {
            console.log(`  ${session.sessionId}: ${session.feedbackCount.toLocaleString()} feedback entries`);
        }
        console.log('');

        // Confirm action
        console.log('This will COMPLETELY REMOVE all feedback from these sessions.');
        console.log('All feedback in these sessions is auto-generated and corrupted.\n');

        if (!DRY_RUN) {
            console.log('Starting cleanup...\n');
        }

        // Process each session
        const osClient = await opensearchClient.getClient();

        for (const session of sessionsToClean) {
            stats.sessionsProcessed++;

            try {
                // Step 1: Get session data from OpenSearch to check lastMessageId
                const sessionData = await osClient.get({
                    index: 'session',
                    id: session.sessionId,
                    _source: ['user_id', 'last_message_id', 'last_analyzed_message_id']
                });

                const userId = sessionData.body._source?.user_id;
                const lastMessageId = sessionData.body._source?.last_message_id;
                const lastAnalyzedMessageId = sessionData.body._source?.last_analyzed_message_id;

                // Step 2: Clear feedback from OpenSearch
                if (!DRY_RUN) {
                    await osClient.update({
                        index: 'session',
                        id: session.sessionId,
                        body: {
                            doc: {
                                feedback: []
                            }
                        }
                    });
                    stats.sessionsCleared++;
                    stats.totalFeedbackRemoved += session.feedbackCount;
                    console.log(`✓ Cleared ${session.sessionId} (removed ${session.feedbackCount.toLocaleString()} entries)`);
                } else {
                    console.log(`[DRY RUN] Would clear ${session.sessionId} (${session.feedbackCount.toLocaleString()} entries)`);
                    stats.totalFeedbackRemoved += session.feedbackCount;
                }

                // Step 3: Check if lastMessageId needs fixing (data corruption)
                if (lastMessageId && lastAnalyzedMessageId && lastMessageId < lastAnalyzedMessageId) {
                    console.log(`  ⚠️  Data corruption detected: lastMessageId (${lastMessageId}) < lastAnalyzedMessageId (${lastAnalyzedMessageId})`);
                    
                    if (!DRY_RUN) {
                        // Fix the stale lastMessageId in DynamoDB
                        const chatSessionTable = process.env.CHAT_SESSION_TABLE;
                        if (!chatSessionTable) {
                            console.error('  ✗ CHAT_SESSION_TABLE environment variable not set');
                        } else {
                            await ddbDocClient.send(
                                new UpdateCommand({
                                    TableName: chatSessionTable,
                                    Key: {
                                        user_id: userId,
                                        session_id: session.sessionId
                                    },
                                    UpdateExpression: 'SET last_message_id = :lastMessageId',
                                    ExpressionAttributeValues: {
                                        ':lastMessageId': lastAnalyzedMessageId
                                    }
                                })
                            );
                            stats.sessionsWithFixedLastMessageId++;
                            console.log(`  ✓ Fixed lastMessageId: ${lastMessageId} → ${lastAnalyzedMessageId}`);
                        }
                    } else {
                        console.log(`  [DRY RUN] Would fix lastMessageId: ${lastMessageId} → ${lastAnalyzedMessageId}`);
                        stats.sessionsWithFixedLastMessageId++;
                    }
                } else if (lastMessageId && lastAnalyzedMessageId) {
                    console.log(`  ✓ lastMessageId is correct (${lastMessageId})`);
                }

            } catch (error) {
                console.error(`✗ Error processing ${session.sessionId}:`, error);
                stats.errors++;
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log('\n' + '='.repeat(80));
        console.log('Cleanup Complete');
        console.log('='.repeat(80));
        console.log(`Duration: ${duration}s`);
        console.log(`Sessions Processed: ${stats.sessionsProcessed}`);
        console.log(`Sessions Cleared: ${stats.sessionsCleared}`);
        console.log(`Total Feedback Removed: ${stats.totalFeedbackRemoved.toLocaleString()}`);
        console.log(`Sessions with Fixed lastMessageId: ${stats.sessionsWithFixedLastMessageId}`);
        console.log(`Errors: ${stats.errors}`);
        console.log('='.repeat(80));

        if (DRY_RUN) {
            console.log('\nThis was a DRY RUN. Run without --dry-run to apply changes.');
        }
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run the script
main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});

