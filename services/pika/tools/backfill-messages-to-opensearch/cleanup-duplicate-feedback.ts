#!/usr/bin/env node
/**
 * Cleanup Duplicate Feedback Tool
 *
 * This tool removes duplicate feedback entries from OpenSearch session documents.
 * It deduplicates based on feedback_id, keeping only the first occurrence.
 *
 * Usage:
 *   npx tsx tools/backfill-messages-to-opensearch/cleanup-duplicate-feedback.ts [options]
 *
 * Options:
 *   --dry-run           Preview changes without applying them
 *   --session-id ID     Clean only this specific session
 *   --report-file PATH  Use a specific report file (auto-finds latest if not specified)
 *   --batch-size N      Number of sessions to update in one bulk operation (default: 10)
 */

import opensearchClient from '../../src/lib/opensearch/opensearch-client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local if present
const envPath = path.join(__dirname, '..', '..', '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`Loaded environment variables from ${envPath}\n`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SESSION_ID = args.find((arg, i) => args[i - 1] === '--session-id');
const REPORT_FILE = args.find((arg, i) => args[i - 1] === '--report-file');
const BATCH_SIZE = parseInt(args.find((arg, i) => args[i - 1] === '--batch-size') || '10', 10);

interface CleanupStats {
    sessionsProcessed: number;
    sessionsUpdated: number;
    feedbackRemoved: number;
    feedbackKept: number;
    errors: number;
}

async function main() {
    console.log('='.repeat(80));
    console.log('Cleanup Duplicate Feedback');
    console.log('='.repeat(80));
    console.log(`Dry Run: ${DRY_RUN}`);
    console.log(`Batch Size: ${BATCH_SIZE}`);
    if (SESSION_ID) {
        console.log(`Session ID: ${SESSION_ID}`);
    }
    console.log('='.repeat(80));
    console.log('');

    if (DRY_RUN) {
        console.log('DRY RUN MODE - No changes will be made\n');
    }

    const stats: CleanupStats = {
        sessionsProcessed: 0,
        sessionsUpdated: 0,
        feedbackRemoved: 0,
        feedbackKept: 0,
        errors: 0
    };

    const startTime = Date.now();

    try {
        let sessionIds: string[] = [];

        if (SESSION_ID) {
            // Process single session
            sessionIds = [SESSION_ID];
        } else if (REPORT_FILE) {
            // Load sessions from report file
            const reportData = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf-8'));
            sessionIds = reportData.sessions.map((s: any) => s.sessionId);
            console.log(`Loaded ${sessionIds.length} sessions from report file\n`);
        } else {
            // Auto-find latest report file
            const reportFiles = fs
                .readdirSync(__dirname)
                .filter((f) => f.startsWith('custom-excessive-feedback-') && f.endsWith('.json'))
                .sort()
                .reverse();

            if (reportFiles.length > 0) {
                const latestReport = path.join(__dirname, reportFiles[0]);
                console.log(`Using latest report: ${reportFiles[0]}\n`);
                const reportData = JSON.parse(fs.readFileSync(latestReport, 'utf-8'));
                sessionIds = reportData.sessions.map((s: any) => s.sessionId);
            } else {
                console.log('No report file found. Scanning OpenSearch for sessions with excessive feedback...\n');
                sessionIds = await findSessionsWithExcessiveFeedback();
            }
        }

        if (sessionIds.length === 0) {
            console.log('No sessions to process.');
            return;
        }

        console.log(`Processing ${sessionIds.length} sessions...\n`);

        // Process in batches
        for (let i = 0; i < sessionIds.length; i += BATCH_SIZE) {
            const batch = sessionIds.slice(i, i + BATCH_SIZE);
            await processBatch(batch, stats);

            if ((i + batch.length) % 50 === 0 || i + batch.length === sessionIds.length) {
                console.log(`Progress: ${i + batch.length}/${sessionIds.length} sessions, ` + `${stats.feedbackRemoved.toLocaleString()} duplicates removed`);
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log('\n' + '='.repeat(80));
        console.log('Cleanup Complete');
        console.log('='.repeat(80));
        console.log(`Duration: ${duration}s`);
        console.log(`Sessions Processed: ${stats.sessionsProcessed}`);
        console.log(`Sessions Updated: ${stats.sessionsUpdated}`);
        console.log(`Feedback Kept: ${stats.feedbackKept.toLocaleString()}`);
        console.log(`Feedback Removed: ${stats.feedbackRemoved.toLocaleString()}`);
        console.log(`Errors: ${stats.errors}`);
        console.log('='.repeat(80));
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

async function findSessionsWithExcessiveFeedback(): Promise<string[]> {
    const sessionIds: string[] = [];
    const FEEDBACK_THRESHOLD = 100;

    try {
        const osClient = await opensearchClient.getClient();
        let scrollId: string | undefined;

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
                const feedback = hit._source?.feedback;
                if (feedback && Array.isArray(feedback) && feedback.length > FEEDBACK_THRESHOLD && hit._source?.session_id) {
                    sessionIds.push(hit._source.session_id);
                }
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
                break;
            }
        }

        // Clear scroll
        if (scrollId) {
            try {
                await osClient.clearScroll({ scroll_id: scrollId });
            } catch (e) {
                // Ignore
            }
        }
    } catch (error) {
        console.error('Error finding sessions:', error);
    }

    return sessionIds;
}

async function processBatch(sessionIds: string[], stats: CleanupStats): Promise<void> {
    try {
        const osClient = await opensearchClient.getClient();

        // Fetch all sessions in batch
        const response = await osClient.mget({
            index: 'session',
            body: {
                ids: sessionIds
            }
        });

        const updates: Array<{ sessionId: string; cleanedFeedback: any[] }> = [];

        for (const doc of response.body.docs) {
            // Type guard: check if doc has the expected structure
            if (!('found' in doc) || !doc.found || !('_source' in doc) || !doc._source?.feedback) {
                continue;
            }

            const sessionId = doc._id;
            const feedback = doc._source.feedback;

            stats.sessionsProcessed++;

            if (!Array.isArray(feedback) || feedback.length === 0) {
                continue;
            }

            // Deduplicate by feedback_id (keep first occurrence)
            const seen = new Set<string>();
            const cleanedFeedback: any[] = [];

            for (const entry of feedback) {
                const feedbackId = entry.feedback_id || entry.feedbackId;
                if (!feedbackId || !seen.has(feedbackId)) {
                    if (feedbackId) {
                        seen.add(feedbackId);
                    }
                    cleanedFeedback.push(entry);
                    stats.feedbackKept++;
                } else {
                    stats.feedbackRemoved++;
                }
            }

            // Only update if there were duplicates
            if (cleanedFeedback.length < feedback.length) {
                updates.push({ sessionId, cleanedFeedback });
                console.log(
                    `  ${sessionId}: ${feedback.length} → ${cleanedFeedback.length} feedback entries ` + `(removed ${feedback.length - cleanedFeedback.length} duplicates)`
                );
            }
        }

        // Perform bulk update
        if (updates.length > 0 && !DRY_RUN) {
            const body: any[] = [];

            for (const { sessionId, cleanedFeedback } of updates) {
                body.push({ update: { _index: 'session', _id: sessionId } });
                body.push({ doc: { feedback: cleanedFeedback } });
            }

            const bulkResponse = await osClient.bulk({ body });

            if (bulkResponse.body.errors) {
                console.error(`Bulk update had errors`);
                bulkResponse.body.items.forEach((item: any) => {
                    if (item.update?.error) {
                        console.error(`  Error: ${item.update.error.reason}`);
                        stats.errors++;
                    }
                });
            } else {
                stats.sessionsUpdated += updates.length;
            }
        } else if (updates.length > 0 && DRY_RUN) {
            console.log(`[DRY RUN] Would update ${updates.length} sessions`);
        }
    } catch (error) {
        console.error('Error processing batch:', error);
        stats.errors++;
    }
}

// Run the script
main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
