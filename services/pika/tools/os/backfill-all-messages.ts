import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import pMap from 'p-map';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import OsClient from '../../src/lib/opensearch/opensearch-client';
import { getIndexMeta } from '../../src/lib/opensearch/types';
import type { MessageSummaryEntry } from '../../src/lib/opensearch/types';

// Load .env.local if present
const envPath = path.join(__dirname, '..', '..', '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`Loaded environment variables from ${envPath}`);
}

function createDdbDocClient(): ReturnType<typeof DynamoDBDocument.from> {
    const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
    return DynamoDBDocument.from(ddb, {
        marshallOptions: { convertEmptyValues: true, removeUndefinedValues: true }
    });
}

type SessionRow = {
    user_id: string;
    session_id: string;
};

async function* scanAllSessions(limit?: number): AsyncGenerator<SessionRow[], void, undefined> {
    const ddb = createDdbDocClient();
    const tableName = `chat-session-${process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE}-${process.env.stage}`;
    
    let lastEvaluatedKey: Record<string, any> | undefined;
    let remaining = typeof limit === 'number' ? limit : Number.POSITIVE_INFINITY;
    const pageSize = 100;

    console.log(`Scanning table: ${tableName}\n`);

    while (remaining > 0) {
        const thisLimit = Math.min(pageSize, remaining);
        const resp = await ddb.scan({
            TableName: tableName,
            ProjectionExpression: 'user_id, session_id',
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

async function backfillSessionMessages(
    sessionId: string,
    userId: string,
    dryRun: boolean,
    verbose: boolean
): Promise<{ success: boolean; messageCount: number; assistantCount: number; totalCost: number }> {
    const ddb = createDdbDocClient();
    const messageTableName = `chat-message-${process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE}-${process.env.stage}`;

    try {
        // 1. Fetch all messages for this session from DynamoDB
        const result = await ddb.query({
            TableName: messageTableName,
            KeyConditionExpression: 'user_id = :userId AND begins_with(message_id, :sessionIdPrefix)',
            ExpressionAttributeValues: {
                ':userId': userId,
                ':sessionIdPrefix': `${sessionId}:`
            }
        });

        const messages = result.Items ?? [];

        if (messages.length === 0) {
            if (verbose) {
                console.log(`  [${sessionId}] No messages found`);
            }
            return { success: true, messageCount: 0, assistantCount: 0, totalCost: 0 };
        }

        // 2. Build messages_summary array from DynamoDB data
        const messagesSummary: MessageSummaryEntry[] = messages.map((msg: any) => {
            const entry: MessageSummaryEntry = {
                message_id: msg.message_id,
                timestamp: msg.timestamp,
                source: msg.source
            };

            // Only populate usage metrics for assistant messages
            if (msg.source === 'assistant' && msg.usage) {
                entry.model = msg.model;
                // DynamoDB stores in snake_case nested under 'usage'
                entry.input_tokens = msg.usage.input_tokens;
                entry.output_tokens = msg.usage.output_tokens;
                entry.input_cost = msg.usage.input_cost;
                entry.output_cost = msg.usage.output_cost;
                entry.total_cost = msg.usage.total_cost;
                entry.execution_duration = msg.execution_duration;
            }

            return entry;
        });

        // Calculate stats
        const assistantMessages = messagesSummary.filter(m => m.source === 'assistant');
        const totalCost = assistantMessages.reduce((sum, m) => sum + (m.total_cost ?? 0), 0);

        if (verbose) {
            console.log(`  [${sessionId}] ${messages.length} messages, ${assistantMessages.length} assistant, $${totalCost.toFixed(4)}`);
        }

        if (dryRun) {
            return { 
                success: true, 
                messageCount: messages.length, 
                assistantCount: assistantMessages.length, 
                totalCost 
            };
        }

        // 3. Update OpenSearch session document
        const osClient = await OsClient.getClient();
        const sessionIndexName = getIndexMeta('session').name;

        await osClient.update({
            index: sessionIndexName,
            id: sessionId,
            retry_on_conflict: 3,
            body: {
                doc: {
                    messages_summary: messagesSummary
                },
                doc_as_upsert: false // Don't create if doesn't exist
            }
        } as any);

        return { 
            success: true, 
            messageCount: messages.length, 
            assistantCount: assistantMessages.length, 
            totalCost 
        };
    } catch (error: any) {
        if (error?.meta?.statusCode === 404 || error?.statusCode === 404) {
            // Session doesn't exist in OpenSearch yet - skip silently
            if (verbose) {
                console.log(`  [${sessionId}] Not in OpenSearch yet (skipping)`);
            }
            return { success: true, messageCount: 0, assistantCount: 0, totalCost: 0 };
        }
        
        console.error(`  ❌ [${sessionId}] Error: ${error.message}`);
        return { success: false, messageCount: 0, assistantCount: 0, totalCost: 0 };
    }
}

async function backfillAllSessions(options: {
    dryRun: boolean;
    limit?: number;
    concurrency: number;
    verbose: boolean;
}): Promise<void> {
    console.log('\n=== Backfilling ALL Sessions from DynamoDB ===\n');
    console.log(`Dry Run: ${options.dryRun}`);
    console.log(`Concurrency: ${options.concurrency}`);
    console.log(`Verbose: ${options.verbose}`);
    if (options.limit) console.log(`Limit: ${options.limit} sessions`);
    console.log('');

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalErrors = 0;
    let totalMessages = 0;
    let totalAssistantMessages = 0;
    let totalCost = 0;

    const startTime = Date.now();

    for await (const page of scanAllSessions(options.limit)) {
        // Process page in parallel with concurrency limit
        const results = await pMap(
            page,
            async (session) => {
                return await backfillSessionMessages(
                    session.session_id,
                    session.user_id,
                    options.dryRun,
                    options.verbose
                );
            },
            { concurrency: options.concurrency }
        );

        // Aggregate results
        for (const result of results) {
            totalProcessed++;
            if (result.success) {
                totalSuccess++;
                totalMessages += result.messageCount;
                totalAssistantMessages += result.assistantCount;
                totalCost += result.totalCost;
            } else {
                totalErrors++;
            }
        }

        // Progress update every page
        if (!options.verbose) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            process.stdout.write(`\rProcessed: ${totalProcessed} sessions | Messages: ${totalMessages} | Assistant: ${totalAssistantMessages} | Cost: $${totalCost.toFixed(2)} | Time: ${elapsed}s`);
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n\n=== Backfill Complete ===');
    console.log(`Total Sessions Processed: ${totalProcessed}`);
    console.log(`Success: ${totalSuccess}`);
    console.log(`Errors: ${totalErrors}`);
    console.log(`Total Messages: ${totalMessages}`);
    console.log(`Total Assistant Messages: ${totalAssistantMessages}`);
    console.log(`Total Cost: $${totalCost.toFixed(4)}`);
    console.log(`Time: ${elapsed}s`);
    console.log(`Rate: ${(totalProcessed / parseFloat(elapsed)).toFixed(1)} sessions/sec`);
}

async function main() {
    // Ensure required env vars are present
    const requiredEnv = ['stage', 'AWS_REGION', 'PIKA_SERVICE_PROJ_NAME_KEBAB_CASE', 'PIKA_DOMAIN_ENDPOINT'] as const;
    const missing = requiredEnv.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}. ` +
                `Create services/pika/.env.local with these keys or export them in your shell.`
        );
    }

    const args = process.argv.slice(2);
    const dryRunFlag = args.includes('--dry-run') || args.includes('-n');
    const verboseFlag = args.includes('--verbose') || args.includes('-v');
    
    const limitIdx = args.findIndex(arg => arg === '--limit');
    const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] || '0', 10) || undefined : undefined;
    
    const concurrencyIdx = args.findIndex(arg => arg === '--concurrency');
    const concurrency = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1] || '5', 10) : 5;

    const cmd = args[0]?.toLowerCase();

    if (cmd === 'help' || cmd === '-h' || cmd === '--help' || !cmd) {
        console.log([
            'Usage:',
            '  pnpm tsx tools/os/backfill-all-messages.ts [options]',
            '',
            'Options:',
            '  --dry-run, -n              Preview changes without applying',
            '  --verbose, -v              Show detailed output for each session',
            '  --limit N                  Limit number of sessions to process',
            '  --concurrency N            Number of concurrent operations (default: 5)',
            '',
            'Examples:',
            '  # Preview what will be updated (first 10 sessions)',
            '  pnpm tsx tools/os/backfill-all-messages.ts --dry-run --limit 10 --verbose',
            '',
            '  # Backfill first 100 sessions',
            '  pnpm tsx tools/os/backfill-all-messages.ts --limit 100',
            '',
            '  # Backfill ALL sessions (this could take a while)',
            '  pnpm tsx tools/os/backfill-all-messages.ts',
            '',
            '  # Backfill with higher concurrency for speed',
            '  pnpm tsx tools/os/backfill-all-messages.ts --concurrency 10',
            '',
            'Notes:',
            '  - Scans ALL sessions from DynamoDB chat-session table',
            '  - Fetches messages from DynamoDB chat-message table',
            '  - Updates messages_summary in OpenSearch session documents',
            '  - Skips sessions that don\'t exist in OpenSearch yet',
            '  - Safe to run multiple times (idempotent)'
        ].join('\n'));
        return;
    }

    await backfillAllSessions({
        dryRun: dryRunFlag,
        limit,
        concurrency,
        verbose: verboseFlag
    });
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

