import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pMap from 'p-map';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { getChatSessionTable } from '../../src/lib/utils';
import { getExistingDocumentsByIds, getDocumentsByIds } from '../../src/lib/opensearch/opensearch';
import { setSessionsInsightsAnalysisInBatch, touchChatFeedback, touchChatSession } from '../../src/lib/chat-admin-ddb';
import { getFeedbackBySessionId } from '../../src/lib/chat-ddb';

// Env is loaded conditionally inside main() from a local .env.local file if present

type SessionRow = {
    user_id: string;
    session_id: string;
    chat_app_id?: string;
    last_message_id?: string;
    last_analyzed_message_id?: string;
    insights_s3_url?: string;
};

type CliFlags = {
    dryRun: boolean;
    concurrency: number;
    limit?: number;
    eligibleOnly: boolean;
};

function parseFlags(argv: string[]): CliFlags {
    const flags: CliFlags = { dryRun: false, concurrency: 5, eligibleOnly: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run' || a === '-n') flags.dryRun = true;
        else if (a.startsWith('--concurrency=')) flags.concurrency = Math.max(1, parseInt(a.split('=')[1] || '5', 10));
        else if (a === '--concurrency') flags.concurrency = Math.max(1, parseInt(argv[++i] || '5', 10));
        else if (a.startsWith('--limit=')) flags.limit = Math.max(1, parseInt(a.split('=')[1] || '0', 10)) || undefined;
        else if (a === '--limit') flags.limit = Math.max(1, parseInt(argv[++i] || '0', 10)) || undefined;
        else if (a === '--eligible-only') flags.eligibleOnly = true;
    }
    return flags;
}

function createDdbDocClient(): ReturnType<typeof DynamoDBDocument.from> {
    const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
    return DynamoDBDocument.from(ddb, {
        marshallOptions: { convertEmptyValues: true, removeUndefinedValues: true }
    });
}

async function* scanSessions(limit?: number): AsyncGenerator<SessionRow[], void, undefined> {
    const ddb = createDdbDocClient();
    const tableName = getChatSessionTable();
    let lastEvaluatedKey: Record<string, any> | undefined;
    let remaining = typeof limit === 'number' ? limit : Number.POSITIVE_INFINITY;
    const pageSize = 500;

    while (remaining > 0) {
        const thisLimit = Math.min(pageSize, remaining);
        const resp = await ddb.scan({
            TableName: tableName,
            ProjectionExpression: 'user_id, session_id, chat_app_id, last_message_id, last_analyzed_message_id, insights_s3_url',
            ExclusiveStartKey: lastEvaluatedKey,
            Limit: thisLimit
        });
        const items = (resp.Items || []) as SessionRow[];
        if (items.length > 0) {
            yield items;
        }
        remaining -= items.length;
        lastEvaluatedKey = resp.LastEvaluatedKey;
        if (!lastEvaluatedKey) break;
    }
}

function computeCutoffDate(): Date {
    const waitMs = parseInt(process.env.WAIT_TO_COMPUTE_INSIGHTS_MS || '3600000', 10);
    return new Date(Date.now() - waitMs);
}

async function syncFeedback(): Promise<void> {
    console.log('Starting syncFeedback...');
    const flags = parseFlags(process.argv.slice(3));
    const concurrency = flags.concurrency;

    let processedSessions = 0;
    let touchedFeedback = 0;

    for await (const page of scanSessions(flags.limit)) {
        const ids = page.map((s) => s.session_id);
        const osDocs = await getDocumentsByIds('session', ids);

        await pMap(
            page,
            async (s) => {
                processedSessions++;
                const osDoc = osDocs[s.session_id] as any | undefined;
                const osFeedbackIds = new Set<string>((osDoc?.feedback || []).map((f: any) => f.feedbackId || f.feedback_id));

                const ddbFeedback = await getFeedbackBySessionId(s.session_id);
                const missing = ddbFeedback.filter((f) => !osFeedbackIds.has(f.feedbackId));
                if (missing.length === 0) return;

                if (flags.dryRun) {
                    console.log(`Would touch ${missing.length} feedback record(s) for session ${s.session_id}`);
                    return;
                }

                await pMap(
                    missing,
                    async (f) => {
                        console.log(`Touching feedback to trigger OS sync: feedbackId=${f.feedbackId} sessionId=${f.sessionId}`);
                        await touchChatFeedback(f.feedbackId);
                        touchedFeedback++;
                    },
                    { concurrency }
                );
            },
            { concurrency }
        );
    }

    console.log(`syncFeedback complete. Sessions scanned: ${processedSessions}. Feedback touched: ${touchedFeedback}.`);
}

async function syncSessionInsights(): Promise<void> {
    console.log('Starting syncSessionInsights...');
    const flags = parseFlags(process.argv.slice(3));
    const concurrency = flags.concurrency;
    const cutoffDate = computeCutoffDate();

    let sessionsScanned = 0;
    let sessionsMissingInOs = 0;
    let sessionsTouched = 0;
    let sessionsMarkedForInsights = 0;

    for await (const page of scanSessions(flags.limit)) {
        sessionsScanned += page.length;

        // Task 1: ensure present in OpenSearch
        const ids = page.map((s) => s.session_id);
        const existing = await getExistingDocumentsByIds('session', ids);
        const missing = page.filter((s) => !existing.has(s.session_id));
        sessionsMissingInOs += missing.length;

        if (missing.length > 0) {
            if (flags.dryRun) {
                console.log(`Would touch ${missing.length} missing session(s) to trigger OS indexing`);
            } else {
                await pMap(
                    missing,
                    async (s) => {
                        console.log(`Touching session to trigger OS indexing: userId=${s.user_id} sessionId=${s.session_id}`);
                        await touchChatSession({ userId: s.user_id, sessionId: s.session_id });
                        sessionsTouched++;
                    },
                    { concurrency }
                );
            }
        }

        // Task 2: ensure insights have been generated
        const updates = page
            .map((s) => {
                const hasLast = !!s.last_message_id;
                const hasAnalyzed = !!s.last_analyzed_message_id;
                const needsInsights = hasLast && !hasAnalyzed;
                const needsRecompute = hasLast && hasAnalyzed && s.last_message_id !== s.last_analyzed_message_id;
                const eligible = !flags.eligibleOnly || (s.last_message_id ? s.last_message_id <= cutoffDate.toISOString() : false);
                if (!eligible) return undefined;
                if (needsInsights) {
                    return {
                        userId: s.user_id,
                        sessionId: s.session_id,
                        lastAnalyzedMessageId: undefined,
                        insightStatus: 'NEEDS_INSIGHTS_ANALYSIS' as const,
                        insightsS3Url: undefined
                    };
                }
                if (needsRecompute) {
                    return {
                        userId: s.user_id,
                        sessionId: s.session_id,
                        lastAnalyzedMessageId: null,
                        insightStatus: 'NEEDS_INSIGHTS_ANALYSIS' as const,
                        insightsS3Url: undefined
                    };
                }
                return undefined;
            })
            .filter((u): u is NonNullable<typeof u> => !!u);

        if (updates.length > 0) {
            if (flags.dryRun) {
                console.log(`Would mark ${updates.length} session(s) for insights analysis`);
            } else {
                for (const u of updates) {
                    const action = u.lastAnalyzedMessageId === null ? 'recompute' : 'needsInsights';
                    console.log(`Marking session for insights: userId=${u.userId} sessionId=${u.sessionId} action=${action} insightStatus=${u.insightStatus}`);
                }
                await setSessionsInsightsAnalysisInBatch(updates);
                sessionsMarkedForInsights += updates.length;
            }
        }
    }

    console.log(
        `syncSessionInsights complete. Sessions scanned: ${sessionsScanned}. Missing in OS: ${sessionsMissingInOs}. Sessions touched: ${sessionsTouched}. Marked for insights: ${sessionsMarkedForInsights}.`
    );
}

async function main(): Promise<void> {
    // Load .env.local if present (located at services/pika/.env.local)
    const envPath = path.join(__dirname, '..', '..', '.env.local');
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`Loaded environment variables from ${envPath}`);
    }

    // Ensure required env vars are present
    const requiredEnv = ['stage', 'AWS_REGION', 'PIKA_SERVICE_PROJ_NAME_KEBAB_CASE', 'PIKA_CHAT_PROJ_NAME_KEBAB_CASE', 'PIKA_DOMAIN_ENDPOINT'] as const;
    const missing = requiredEnv.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}. ` + `Create services/pika/.env.local with these keys or export them in your shell.`);
    }

    const ddbTableSuffix = `-${process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE}-${process.env.stage}`;
    process.env.CHAT_SESSION_TABLE = `chat-session${ddbTableSuffix}`;
    process.env.CHAT_SESSION_FEEDBACK_TABLE = `chat-session-feedback${ddbTableSuffix}`;

    const [, , cmdRaw] = process.argv;
    const cmd = (cmdRaw ?? 'help').toLowerCase();

    switch (cmd) {
        case 'syncfeedback':
        case 'sync-feedback':
        case 'feedback':
            await syncFeedback();
            break;
        case 'syncsessioninsights':
        case 'sync-session-insights':
        case 'sessioninsights':
        case 'insights':
            await syncSessionInsights();
            break;
        case 'help':
        default:
            console.log(
                [
                    'Usage:',
                    '  pnpm tsx tools/os/ddb-tools.ts <command> [--dry-run] [--concurrency N] [--limit N] [--eligible-only]',
                    '',
                    'Commands:',
                    '  syncFeedback            Backfill missing feedback into OpenSearch',
                    '  syncSessionInsights     Ensure sessions exist in OpenSearch and are marked for insights (with settling period enforcement)'
                ].join('\n')
            );
            if (cmd !== 'help') {
                throw new Error(`Unknown command: ${cmd}.`);
            }
            break;
    }
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
