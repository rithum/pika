#!/usr/bin/env node
/**
 * Diagnose Excessive Feedback
 * 
 * This tool examines sessions with excessive feedback to understand what's happening
 * and generates a detailed report.
 */

import opensearchClient from '../../src/lib/opensearch/opensearch-client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local if present
const envPath = path.join(__dirname, '..', '..', '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

const FEEDBACK_THRESHOLD = 100;

interface FeedbackSample {
    feedback_id?: string;
    feedbackId?: string;
    message_id?: string;
    messageId?: string;
    timestamp?: string;
    [key: string]: any;
}

interface SessionDiagnostic {
    sessionId: string;
    feedbackCount: number;
    uniqueFeedbackIds: number;
    uniqueMessageIds: number;
    hasDuplicateFeedbackIds: boolean;
    hasDuplicateMessageIds: boolean;
    samples: {
        first3: FeedbackSample[];
        last3: FeedbackSample[];
        pattern: string;
    };
}

async function main() {
    console.log('='.repeat(80));
    console.log('Diagnose Excessive Feedback');
    console.log('='.repeat(80));
    console.log('');

    const sessions: SessionDiagnostic[] = [];
    
    try {
        const osClient = await opensearchClient.getClient();
        let scrollId: string | undefined;

        console.log('Scanning OpenSearch for sessions with excessive feedback...\n');

        // Initial search
        let response = await osClient.search({
            index: 'session',
            scroll: '2m',
            size: 100,
            body: {
                query: { match_all: {} },
                _source: ['session_id', 'feedback']
            }
        });

        scrollId = response.body._scroll_id;
        let hits = response.body.hits.hits;
        let scanned = 0;

        while (hits.length > 0) {
            for (const hit of hits) {
                scanned++;
                const feedback = hit._source?.feedback;
                const sessionId = hit._source?.session_id;
                
                if (feedback && Array.isArray(feedback) && feedback.length > FEEDBACK_THRESHOLD && sessionId) {
                    const diagnostic = analyzeFeedback(sessionId, feedback);
                    sessions.push(diagnostic);
                    console.log(`Found: ${sessionId} - ${feedback.length} feedback entries`);
                }
            }

            if (scanned % 1000 === 0) {
                console.log(`Scanned ${scanned} sessions, found ${sessions.length} with excessive feedback...`);
            }

            // Continue scrolling
            try {
                response = await osClient.scroll({
                    scroll_id: scrollId,
                    scroll: '2m'
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

        console.log(`\nScanned ${scanned} total sessions`);
        console.log(`Found ${sessions.length} sessions with >${FEEDBACK_THRESHOLD} feedback entries\n`);

        // Generate report
        const report = {
            generated: new Date().toISOString(),
            threshold: FEEDBACK_THRESHOLD,
            totalSessionsScanned: scanned,
            affectedSessionsCount: sessions.length,
            analysis: analyzePatterns(sessions),
            sessions: sessions
        };

        const reportFile = path.join(__dirname, `excessive-feedback-diagnosis-${new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')}.json`);
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        
        console.log('='.repeat(80));
        console.log('Report Generated');
        console.log('='.repeat(80));
        console.log(`File: ${path.basename(reportFile)}`);
        console.log('');
        console.log('ANALYSIS:');
        console.log('-'.repeat(80));
        console.log(report.analysis.summary);
        console.log('');
        console.log('RECOMMENDATIONS:');
        console.log('-'.repeat(80));
        console.log(report.analysis.recommendation);
        console.log('='.repeat(80));

    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

function analyzeFeedback(sessionId: string, feedback: any[]): SessionDiagnostic {
    const feedbackIds = new Set<string>();
    const messageIds = new Set<string>();
    const feedbackIdCounts = new Map<string, number>();
    const messageIdCounts = new Map<string, number>();

    for (const entry of feedback) {
        const fid = entry.feedback_id || entry.feedbackId;
        const mid = entry.message_id || entry.messageId;
        
        if (fid) {
            feedbackIds.add(fid);
            feedbackIdCounts.set(fid, (feedbackIdCounts.get(fid) || 0) + 1);
        }
        if (mid) {
            messageIds.add(mid);
            messageIdCounts.set(mid, (messageIdCounts.get(mid) || 0) + 1);
        }
    }

    const hasDuplicateFeedbackIds = Array.from(feedbackIdCounts.values()).some(count => count > 1);
    const hasDuplicateMessageIds = Array.from(messageIdCounts.values()).some(count => count > 1);

    // Determine pattern
    let pattern = '';
    if (hasDuplicateFeedbackIds) {
        const maxCount = Math.max(...Array.from(feedbackIdCounts.values()));
        pattern = `Duplicate feedback_ids (max ${maxCount} copies of same feedback)`;
    } else if (hasDuplicateMessageIds && messageIds.size < 10) {
        pattern = `Multiple feedback entries for same messages (${messageIds.size} unique messages)`;
    } else if (messageIds.size > 50) {
        pattern = `Large number of unique feedback entries (${messageIds.size} unique messages)`;
    } else {
        pattern = `Unclear pattern (${feedbackIds.size} unique feedback_ids, ${messageIds.size} unique message_ids)`;
    }

    return {
        sessionId,
        feedbackCount: feedback.length,
        uniqueFeedbackIds: feedbackIds.size,
        uniqueMessageIds: messageIds.size,
        hasDuplicateFeedbackIds,
        hasDuplicateMessageIds,
        samples: {
            first3: feedback.slice(0, 3),
            last3: feedback.slice(-3),
            pattern
        }
    };
}

function analyzePatterns(sessions: SessionDiagnostic[]): { summary: string; recommendation: string } {
    const patterns = {
        duplicateFeedbackIds: 0,
        duplicateMessageIds: 0,
        largeUnique: 0,
        unclear: 0
    };

    for (const session of sessions) {
        if (session.samples.pattern.includes('Duplicate feedback_ids')) {
            patterns.duplicateFeedbackIds++;
        } else if (session.samples.pattern.includes('Multiple feedback')) {
            patterns.duplicateMessageIds++;
        } else if (session.samples.pattern.includes('Large number')) {
            patterns.largeUnique++;
        } else {
            patterns.unclear++;
        }
    }

    let summary = `Found ${sessions.length} sessions with excessive feedback:\n`;
    summary += `  - ${patterns.duplicateFeedbackIds} sessions with duplicate feedback_ids\n`;
    summary += `  - ${patterns.duplicateMessageIds} sessions with multiple feedback per message\n`;
    summary += `  - ${patterns.largeUnique} sessions with large number of unique feedback\n`;
    summary += `  - ${patterns.unclear} sessions with unclear patterns\n`;

    let recommendation = '';
    if (patterns.duplicateFeedbackIds > 0) {
        recommendation += `ISSUE: Duplicate feedback_ids detected - likely caused by repeated insertion\n`;
        recommendation += `  of the same feedback (e.g., backfill script running multiple times).\n`;
        recommendation += `ACTION: Deduplicate by feedback_id (keep first occurrence).\n\n`;
    }
    if (patterns.duplicateMessageIds > 0 || patterns.largeUnique > 0) {
        recommendation += `ISSUE: Excessive legitimate feedback entries detected.\n`;
        recommendation += `  This could be from repeated backfill operations or a bug in feedback recording.\n`;
        recommendation += `ACTION: Consider keeping only recent feedback (last 50-100 entries) or\n`;
        recommendation += `  filtering by timestamp to remove old/stale entries.\n\n`;
    }

    return { summary, recommendation };
}

main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});

