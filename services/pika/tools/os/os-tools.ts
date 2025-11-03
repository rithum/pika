import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDomainExists } from '../../src/lib/opensearch/index-initializer';
import { deleteIndex, getDocumentsByIds } from '../../src/lib/opensearch/opensearch';
import OsClient from '../../src/lib/opensearch/opensearch-client';
import { type DomainIndex, DomainIndices, SessionIndex, getIndexMeta } from '../../src/lib/opensearch/types';

// Env is now loaded conditionally inside main() from a local .env.local file if present

function toDomainIndex(indexName: string): DomainIndex {
    const idx = DomainIndices.find((v) => v === indexName);
    if (!idx) {
        throw new Error(`Invalid index name: ${indexName}. Valid options: ${DomainIndices.join(', ')}`);
    }
    return idx;
}

async function deleteOpenSearchIndex(indexName: string) {
    const idx = toDomainIndex(indexName);
    console.log(`Deleting OpenSearch index '${idx}'...`);
    await deleteIndex(idx);
    console.log(`Deleted OpenSearch index '${idx}'.`);
}

async function createOpenSearchIndex(indexName: string) {
    const idx = toDomainIndex(indexName);
    console.log(`Ensuring OpenSearch index '${idx}' exists (creating if missing)...`);
    await ensureDomainExists(idx);
    console.log(`OpenSearch index '${idx}' is ready.`);
}

async function ensureOpenSearchIndex(indexName: string, dryRun = false) {
    const idx = toDomainIndex(indexName);
    console.log(`Ensuring OpenSearch index '${idx}' exists and is up to date${dryRun ? ' (dry run)' : ''}...`);
    await ensureDomainExists(idx, { dryRun });
    console.log(`Checked OpenSearch index '${idx}'.`);
}

async function getDocuments(indexName: string, ids: string[]) {
    const idx = toDomainIndex(indexName);
    if (!ids || ids.length === 0) {
        throw new Error('Please provide one or more IDs after the index name. Example: get session id1 id2');
    }
    console.log(`Fetching ${ids.length} document(s) from index '${idx}'...`);
    const result = await getDocumentsByIds(idx, ids);
    console.log(JSON.stringify(result, null, 2));
}

async function getDocumentsRaw(indexName: string, ids: string[]) {
    const idx = toDomainIndex(indexName);
    if (!ids || ids.length === 0) {
        throw new Error('Please provide one or more IDs after the index name. Example: get-raw session id1 id2');
    }
    console.log(`Fetching RAW ${ids.length} document(s) from index '${idx}'...`);

    const client = await OsClient.getClient();
    const indexMeta = getIndexMeta(idx);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await client.mget({ index: indexMeta.name, body: { ids }, _source: true } as any);

    const docs = (resp as any)?.body?.docs ?? (resp as any)?.docs ?? [];
    const results: Record<string, any> = {};

    for (const doc of docs) {
        if (doc && (doc.found === true || doc.found === 'true')) {
            results[String(doc._id)] = doc._source;
        }
    }

    console.log(JSON.stringify(results, null, 2));
}

async function countDocumentsForIndex(index: DomainIndex): Promise<number> {
    const client = await OsClient.getClient();
    const indexName = getIndexMeta(index).name;
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resp = await client.count({ index: indexName, body: { query: { match_all: {} } } } as any);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const count = (resp as any)?.body?.count ?? (resp as any)?.count;
        return typeof count === 'number' ? count : 0;
    } catch (err: any) {
        const type = err?.meta?.body?.error?.type;
        if (type === 'index_not_found_exception') return 0;
        throw err;
    }
}

async function countAllDocuments(): Promise<{ total: number; byIndex: Record<string, number> }> {
    let total = 0;
    const byIndex: Record<string, number> = {};
    for (const idx of DomainIndices) {
        const c = await countDocumentsForIndex(idx);
        byIndex[idx] = c;
        total += c;
    }
    return { total, byIndex };
}

function bytesToMB(bytes: number): number {
    return bytes / (1024 * 1024);
}

async function getStoreSizeBytesForIndex(index: DomainIndex): Promise<number> {
    const client = await OsClient.getClient();
    const indexName = getIndexMeta(index).name;
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resp = await client.indices.stats({ index: indexName, metric: ['store'] } as any);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const indices = (resp as any)?.body?.indices ?? (resp as any)?.indices;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const stats = indices?.[indexName]?.total ?? indices?.[indexName]?.primaries ?? (resp as any)?.body?.total ?? (resp as any)?.total;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        const sizeInBytes = stats?.store?.size_in_bytes ?? stats?.store?.total_data_set_size_in_bytes;
        const bytesNum = typeof sizeInBytes === 'number' ? sizeInBytes : Number(sizeInBytes ?? 0);
        return Number.isFinite(bytesNum) ? bytesNum : 0;
    } catch (err: any) {
        const type = err?.meta?.body?.error?.type;
        if (type === 'index_not_found_exception') return 0;
        throw err;
    }
}

async function getStoreSizeAll(): Promise<{ totalBytes: number; totalMB: number; byIndex: Record<string, { bytes: number; mb: number }> }> {
    let totalBytes = 0;
    const byIndex: Record<string, { bytes: number; mb: number }> = {};
    for (const idx of DomainIndices) {
        const bytes = await getStoreSizeBytesForIndex(idx);
        const mb = bytesToMB(bytes);
        byIndex[idx] = { bytes, mb: Number(mb.toFixed(3)) };
        totalBytes += bytes;
    }
    const totalMB = bytesToMB(totalBytes);
    return { totalBytes, totalMB: Number(totalMB.toFixed(3)), byIndex };
}

interface DiagnoseOptions {
    dateStart?: string;
    dateEnd?: string;
    userType?: string;
    invocationMode?: string;
    chatAppId?: string;
    entityAttribute?: string;
    entityValue?: string;
}

async function diagnoseSessionData(options: DiagnoseOptions = {}) {
    const client = await OsClient.getClient();
    const indexName = getIndexMeta(SessionIndex).name;

    console.log('\n=== OpenSearch Session Index Diagnostics ===\n');

    // 1. Check if index exists
    try {
        const exists = await client.indices.exists({ index: indexName } as any);
        console.log(`Index '${indexName}' exists: ${exists.body ?? exists}`);
    } catch (err) {
        console.error(`Error checking if index exists:`, err);
        return;
    }

    // 2. Total document count
    try {
        const countResp = await client.count({ index: indexName, body: { query: { match_all: {} } } } as any);
        const totalCount = (countResp as any)?.body?.count ?? (countResp as any)?.count;
        console.log(`Total documents in index: ${totalCount}\n`);
    } catch (err) {
        console.error('Error counting documents:', err);
    }

    // 3. Get sample documents (first 5)
    try {
        console.log('=== Sample Documents (first 5) ===');
        const sampleResp = await client.search({
            index: indexName,
            body: {
                query: { match_all: {} },
                size: 5,
                sort: [{ create_date: { order: 'desc' } }]
            }
        } as any);
        const hits = (sampleResp as any)?.body?.hits?.hits ?? (sampleResp as any)?.hits?.hits ?? [];
        hits.forEach((hit: any, idx: number) => {
            console.log(`\nSample ${idx + 1}:`);
            console.log(JSON.stringify(hit._source, null, 2));
        });
    } catch (err) {
        console.error('Error fetching sample documents:', err);
    }

    // 4. Aggregate field values to understand the data
    console.log('\n=== Field Value Analysis ===');

    try {
        const aggsResp = await client.search({
            index: indexName,
            body: {
                size: 0,
                aggs: {
                    user_types: {
                        terms: { field: 'user_type_keyword', size: 20, missing: '_missing' }
                    },
                    invocation_modes: {
                        terms: { field: 'invocation_mode_keyword', size: 20, missing: '_missing' }
                    },
                    chat_apps: {
                        terms: { field: 'chat_app_id', size: 20 }
                    },
                    date_range: {
                        stats: { field: 'create_date' }
                    }
                }
            }
        } as any);

        const aggs = (aggsResp as any)?.body?.aggregations ?? (aggsResp as any)?.aggregations;

        console.log('\nUser Types:');
        aggs?.user_types?.buckets?.forEach((b: any) => {
            console.log(`  ${b.key}: ${b.doc_count}`);
        });

        console.log('\nInvocation Modes:');
        aggs?.invocation_modes?.buckets?.forEach((b: any) => {
            console.log(`  ${b.key}: ${b.doc_count}`);
        });

        console.log('\nChat App IDs:');
        aggs?.chat_apps?.buckets?.forEach((b: any) => {
            console.log(`  ${b.key}: ${b.doc_count}`);
        });

        console.log('\nDate Range:');
        if (aggs?.date_range) {
            console.log(`  Min: ${new Date(aggs.date_range.min).toISOString()}`);
            console.log(`  Max: ${new Date(aggs.date_range.max).toISOString()}`);
            console.log(`  Count: ${aggs.date_range.count}`);
        }
    } catch (err) {
        console.error('Error analyzing field values:', err);
    }

    // 5. Test filtered query with the provided options
    if (options.dateStart || options.userType || options.invocationMode) {
        console.log('\n=== Testing Filtered Query ===');
        console.log('Filters:', JSON.stringify(options, null, 2));

        const filters: any[] = [];

        if (options.dateStart && options.dateEnd) {
            filters.push({
                range: {
                    create_date: {
                        gte: options.dateStart,
                        lte: options.dateEnd
                    }
                }
            });
        }

        if (options.userType) {
            filters.push({
                term: { user_type_keyword: options.userType }
            });
        }

        if (options.invocationMode) {
            if (options.invocationMode === 'undefined' || options.invocationMode === '_missing') {
                filters.push({
                    bool: {
                        must_not: { exists: { field: 'invocation_mode_keyword' } }
                    }
                });
            } else {
                filters.push({
                    term: { invocation_mode_keyword: options.invocationMode }
                });
            }
        }

        if (options.chatAppId) {
            filters.push({
                term: { chat_app_id: options.chatAppId }
            });
        }

        if (options.entityAttribute && options.entityValue) {
            const entityField = `session_attributes.${options.entityAttribute}`;
            filters.push({
                term: { [entityField]: options.entityValue }
            });
        }

        try {
            const filteredResp = await client.search({
                index: indexName,
                body: {
                    query: {
                        bool: {
                            filter: filters
                        }
                    },
                    size: 5,
                    sort: [{ create_date: { order: 'desc' } }]
                }
            } as any);

            const totalHits = (filteredResp as any)?.body?.hits?.total?.value ?? (filteredResp as any)?.hits?.total?.value ?? 0;
            console.log(`\nFiltered query matched ${totalHits} documents`);

            const hits = (filteredResp as any)?.body?.hits?.hits ?? (filteredResp as any)?.hits?.hits ?? [];
            if (hits.length > 0) {
                console.log('\nFirst matching document:');
                console.log(JSON.stringify(hits[0]._source, null, 2));
            }
        } catch (err) {
            console.error('Error running filtered query:', err);
        }
    }

    console.log('\n=== Diagnostics Complete ===\n');
}

async function fixKeywordFields() {
    const client = await OsClient.getClient();
    const indexName = getIndexMeta(SessionIndex).name;

    console.log('\n=== Fixing Missing Keyword Fields ===\n');
    console.log('This will update all sessions to ensure user_type_keyword, invocation_mode_keyword, and source_keyword are set.\n');

    // Update by query to set keyword fields from their base fields
    const updateScript = `
        if (ctx._source.user_type != null && ctx._source.user_type_keyword == null) {
            ctx._source.user_type_keyword = ctx._source.user_type;
        }
        if (ctx._source.invocation_mode != null && ctx._source.invocation_mode_keyword == null) {
            ctx._source.invocation_mode_keyword = ctx._source.invocation_mode;
        }
        if (ctx._source.source != null && ctx._source.source_keyword == null) {
            ctx._source.source_keyword = ctx._source.source;
        }
        ctx._source.last_index_date = params.now;
    `;

    try {
        console.log('Running update_by_query to fix keyword fields...');

        const response = await client.updateByQuery({
            index: indexName,
            body: {
                script: {
                    source: updateScript,
                    lang: 'painless',
                    params: {
                        now: new Date().toISOString()
                    }
                },
                query: {
                    bool: {
                        should: [
                            {
                                bool: {
                                    must: [{ exists: { field: 'user_type' } }, { bool: { must_not: { exists: { field: 'user_type_keyword' } } } }]
                                }
                            },
                            {
                                bool: {
                                    must: [{ exists: { field: 'invocation_mode' } }, { bool: { must_not: { exists: { field: 'invocation_mode_keyword' } } } }]
                                }
                            },
                            {
                                bool: {
                                    must: [{ exists: { field: 'source' } }, { bool: { must_not: { exists: { field: 'source_keyword' } } } }]
                                }
                            }
                        ],
                        minimum_should_match: 1
                    }
                }
            },
            refresh: true,
            wait_for_completion: true
        } as any);

        const updated = (response as any)?.body?.updated ?? (response as any)?.updated ?? 0;
        const total = (response as any)?.body?.total ?? (response as any)?.total ?? 0;

        console.log(`\n✅ Successfully updated ${updated} out of ${total} sessions`);
        console.log('\nKeyword fields have been fixed!');
    } catch (error) {
        console.error('Error fixing keyword fields:', error);
        throw error;
    }
}

async function resetSessionForTesting(sessionId: string, dryRun = false) {
    const client = await OsClient.getClient();
    const messageIndexName = getIndexMeta('message').name;
    const sessionIndexName = getIndexMeta('session').name;

    console.log('\n=== Resetting Session for Testing ===\n');
    console.log(`Session ID: ${sessionId}`);
    if (dryRun) {
        console.log('⚠️  DRY RUN MODE - No changes will be made\n');
    }

    // Step 1: Get all messages for this session from message index
    console.log('\n--- Finding Messages ---');
    try {
        const searchResp = await client.search({
            index: messageIndexName,
            body: {
                query: {
                    term: { session_id: sessionId }
                },
                size: 1000,
                _source: false
            }
        } as any);

        const hits = (searchResp as any)?.body?.hits?.hits ?? (searchResp as any)?.hits?.hits ?? [];
        const messageIds = hits.map((hit: any) => hit._id);

        console.log(`Found ${messageIds.length} messages in message index`);

        // Step 2: Delete all messages from message index
        if (messageIds.length > 0 && !dryRun) {
            console.log('\n--- Deleting Messages from Message Index ---');
            for (const messageId of messageIds) {
                try {
                    await client.delete({
                        index: messageIndexName,
                        id: messageId
                    } as any);
                    console.log(`  Deleted message: ${messageId}`);
                } catch (error: any) {
                    if (error?.meta?.statusCode === 404 || error?.statusCode === 404) {
                        console.log(`  Message ${messageId} already deleted`);
                    } else {
                        console.error(`  Error deleting message ${messageId}:`, error);
                    }
                }
            }
        } else if (dryRun && messageIds.length > 0) {
            console.log(`\n[DRY RUN] Would delete ${messageIds.length} messages from message index:`);
            messageIds.forEach((id: string) => console.log(`  - ${id}`));
        }
    } catch (error: any) {
        if (error?.meta?.body?.error?.type === 'index_not_found_exception') {
            console.log('Message index does not exist yet');
        } else {
            console.error('Error searching for messages:', error);
            throw error;
        }
    }

    // Step 3: Remove messages_summary and messages_analysis from session
    console.log('\n--- Updating Session Document ---');
    try {
        const sessionResp = await client.get({
            index: sessionIndexName,
            id: sessionId
        } as any);

        const sessionDoc = (sessionResp as any)?.body?._source ?? (sessionResp as any)?._source;

        if (sessionDoc?.messages_summary || sessionDoc?.messages_analysis) {
            if (!dryRun) {
                await client.update({
                    index: sessionIndexName,
                    id: sessionId,
                    body: {
                        script: {
                            source: `
                                ctx._source.remove('messages_summary');
                                ctx._source.remove('messages_analysis');
                            `
                        }
                    }
                } as any);
                console.log('✅ Removed messages_summary and messages_analysis from session');
            } else {
                console.log('[DRY RUN] Would remove messages_summary and messages_analysis from session');
                if (sessionDoc.messages_summary) {
                    console.log(`  - messages_summary has ${sessionDoc.messages_summary.length} entries`);
                }
                if (sessionDoc.messages_analysis) {
                    console.log(`  - messages_analysis exists`);
                }
            }
        } else {
            console.log('Session already clean (no messages_summary or messages_analysis)');
        }
    } catch (error: any) {
        if (error?.meta?.statusCode === 404 || error?.statusCode === 404) {
            console.log('Session not found in OpenSearch');
        } else {
            console.error('Error updating session:', error);
            throw error;
        }
    }

    console.log('\n=== Reset Complete ===\n');
    if (!dryRun) {
        console.log('✅ Session is ready for fresh testing');
        console.log('You can now modify messages in DynamoDB to trigger replication');
    }
}

async function verifyMessageReplication(messageId: string, sessionId?: string) {
    const client = await OsClient.getClient();
    const messageIndexName = getIndexMeta('message').name;
    const sessionIndexName = getIndexMeta('session').name;

    console.log('\n=== Verifying Message Replication ===\n');
    console.log(`Message ID: ${messageId}`);

    // 1. Check if message exists in message index
    console.log('\n--- Message Index ---');
    try {
        const messageResp = await client.get({
            index: messageIndexName,
            id: messageId
        } as any);

        const messageDoc = (messageResp as any)?.body?._source ?? (messageResp as any)?._source;
        if (messageDoc) {
            console.log('✅ Message found in message index');
            console.log(JSON.stringify(messageDoc, null, 2));

            // Extract session ID from message if not provided
            if (!sessionId) {
                sessionId = messageDoc.session_id;
                console.log(`\nExtracted session ID: ${sessionId}`);
            }
        } else {
            console.log('❌ Message not found in message index');
            return;
        }
    } catch (error: any) {
        if (error?.meta?.body?.found === false || error?.body?.found === false) {
            console.log('❌ Message not found in message index');
            return;
        }
        console.error('Error fetching message:', error);
        throw error;
    }

    // 2. Check session document for messages_summary and messages_analysis
    if (sessionId) {
        console.log('\n--- Session Index ---');
        try {
            const sessionResp = await client.get({
                index: sessionIndexName,
                id: sessionId
            } as any);

            const sessionDoc = (sessionResp as any)?.body?._source ?? (sessionResp as any)?._source;
            if (sessionDoc) {
                console.log('✅ Session found in session index');
                console.log(`Session ID: ${sessionDoc.session_id}`);
                console.log(`User ID: ${sessionDoc.user_id}`);

                // Check messages_summary
                console.log('\n--- Messages Summary ---');
                if (sessionDoc.messages_summary && Array.isArray(sessionDoc.messages_summary)) {
                    console.log(`✅ messages_summary exists with ${sessionDoc.messages_summary.length} entries`);
                    console.log(JSON.stringify(sessionDoc.messages_summary, null, 2));

                    // Check if our message is in the summary
                    const ourMessage = sessionDoc.messages_summary.find((m: any) => m.message_id === messageId);
                    if (ourMessage) {
                        console.log(`\n✅ Message ${messageId} found in messages_summary`);
                    } else {
                        console.log(`\n⚠️  Message ${messageId} NOT found in messages_summary`);
                    }
                } else {
                    console.log('⚠️  messages_summary is missing or not an array');
                }

                // Check messages_analysis
                console.log('\n--- Messages Analysis ---');
                if (sessionDoc.messages_analysis) {
                    console.log('✅ messages_analysis exists');
                    console.log(JSON.stringify(sessionDoc.messages_analysis, null, 2));

                    // Validate the structure
                    const analysis = sessionDoc.messages_analysis;
                    if (analysis.timing_stats) {
                        console.log('\n--- Timing Stats Summary ---');
                        console.log(`Total Messages: ${analysis.timing_stats.total_messages}`);
                        console.log(`User Messages: ${analysis.timing_stats.total_user_messages}`);
                        console.log(`Assistant Messages: ${analysis.timing_stats.total_assistant_messages}`);
                        console.log(`Conversation Duration: ${analysis.timing_stats.conversation_duration_ms}ms`);
                        console.log(`Avg Gap: ${analysis.timing_stats.avg_gap_ms}ms`);
                        console.log(`Avg Response Time: ${analysis.timing_stats.avg_response_time_ms}ms`);
                        console.log(`Avg Think Time: ${analysis.timing_stats.avg_think_time_ms}ms`);
                    }
                    if (analysis.last_message) {
                        console.log('\n--- Last Message ---');
                        console.log(`Message ID: ${analysis.last_message.message_id}`);
                        console.log(`Source: ${analysis.last_message.source}`);
                        console.log(`Timestamp: ${analysis.last_message.timestamp}`);
                    }
                    console.log(`\nLast Updated: ${analysis.last_updated}`);
                } else {
                    console.log('⚠️  messages_analysis is missing');
                }

                // Show full session doc for reference
                console.log('\n--- Full Session Document ---');
                console.log(JSON.stringify(sessionDoc, null, 2));
            } else {
                console.log('❌ Session not found in session index');
            }
        } catch (error: any) {
            if (error?.meta?.body?.found === false || error?.body?.found === false) {
                console.log('❌ Session not found in session index');
            } else {
                console.error('Error fetching session:', error);
                throw error;
            }
        }
    }

    console.log('\n=== Verification Complete ===\n');
}

async function analyzeExternalSessions(dateStart: string, dateEnd: string) {
    const client = await OsClient.getClient();
    const indexName = getIndexMeta(SessionIndex).name;

    console.log('\n=== Analyzing External User Sessions ===\n');
    console.log(`Date Range: ${dateStart} to ${dateEnd}`);
    console.log('User Type: external-user\n');

    const filters: any[] = [];

    // Date range filter
    filters.push({
        range: {
            create_date: {
                gte: dateStart,
                lte: dateEnd
            }
        }
    });

    // User type filter
    filters.push({
        term: { user_type_keyword: 'external-user' }
    });

    // Fetch all matching documents
    const allDocs: any[] = [];
    let scrollId: string | undefined;

    try {
        // Initial search
        let response = await client.search({
            index: indexName,
            scroll: '1m',
            size: 1000,
            body: {
                query: {
                    bool: {
                        filter: filters
                    }
                },
                _source: [
                    'session_id',
                    'user_id',
                    'create_date',
                    'invocation_mode',
                    'invocation_mode_keyword',
                    'chat_app_id',
                    'total_cost',
                    'input_tokens',
                    'output_tokens',
                    'session_attributes.accountId'
                ]
            }
        } as any);

        scrollId = (response as any)?.body?._scroll_id ?? (response as any)?._scroll_id;
        let hits = (response as any)?.body?.hits?.hits ?? (response as any)?.hits?.hits ?? [];

        while (hits.length > 0) {
            hits.forEach((hit: any) => allDocs.push(hit._source));

            if (hits.length < 1000) break; // Last batch

            // Continue scrolling
            response = await client.scroll({
                scroll_id: scrollId,
                scroll: '1m'
            } as any);

            scrollId = (response as any)?.body?._scroll_id ?? (response as any)?._scroll_id;
            hits = (response as any)?.body?.hits?.hits ?? (response as any)?.hits?.hits ?? [];
        }

        // Clear scroll
        if (scrollId) {
            await client.clearScroll({ scroll_id: scrollId } as any).catch(() => {});
        }

        console.log(`\nTotal documents retrieved: ${allDocs.length}\n`);

        // Analyze by invocation mode
        const byInvocationMode: Record<string, number> = {};
        const uniqueUsers = new Set<string>();
        const uniqueAccounts = new Set<string>();
        let totalCost = 0;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        allDocs.forEach((doc) => {
            // Count by invocation mode
            const mode = doc.invocation_mode_keyword ?? doc.invocation_mode ?? '_missing';
            byInvocationMode[mode] = (byInvocationMode[mode] ?? 0) + 1;

            // Track unique users and accounts
            if (doc.user_id) uniqueUsers.add(doc.user_id);
            if (doc.session_attributes?.accountId) uniqueAccounts.add(doc.session_attributes.accountId);

            // Sum costs and tokens
            totalCost += doc.total_cost ?? 0;
            totalInputTokens += doc.input_tokens ?? 0;
            totalOutputTokens += doc.output_tokens ?? 0;
        });

        console.log('=== Breakdown by Invocation Mode ===');
        Object.entries(byInvocationMode)
            .sort((a, b) => b[1] - a[1])
            .forEach(([mode, count]) => {
                console.log(`  ${mode}: ${count}`);
            });

        console.log('\n=== Summary ===');
        console.log(`Total Sessions: ${allDocs.length}`);
        console.log(`Unique Users: ${uniqueUsers.size}`);
        console.log(`Unique Accounts: ${uniqueAccounts.size}`);
        console.log(`Total Cost: $${totalCost.toFixed(2)}`);
        console.log(`Total Input Tokens: ${totalInputTokens.toLocaleString()}`);
        console.log(`Total Output Tokens: ${totalOutputTokens.toLocaleString()}`);
        console.log(`Avg Cost/Session: $${(totalCost / allDocs.length).toFixed(2)}`);
        console.log(`Avg Tokens/Session: ${Math.round((totalInputTokens + totalOutputTokens) / allDocs.length).toLocaleString()}`);

        // Show a few sample session IDs for verification
        console.log('\n=== Sample Session IDs (first 5) ===');
        allDocs.slice(0, 5).forEach((doc) => {
            console.log(`  ${doc.session_id} - ${doc.invocation_mode_keyword ?? doc.invocation_mode ?? '_missing'} - ${new Date(doc.create_date).toISOString()}`);
        });
    } catch (error) {
        console.error('Error analyzing external sessions:', error);
        throw error;
    }
}

async function main(): Promise<void> {
    // Load .env.local if present (located at services/pika/.env.local)
    const envPath = path.join(__dirname, '..', '..', '.env.local');
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`Loaded environment variables from ${envPath}`);
    }

    // Ensure required env vars are present
    const requiredEnv = ['PIKA_DOMAIN_ENDPOINT', 'stage', 'AWS_REGION'] as const;
    const missing = requiredEnv.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}. ` + `Create services/pika/.env.local with these keys or export them in your shell.`);
    }

    const [, , cmdRaw, indexRaw, ...rest] = process.argv;
    const cmd = (cmdRaw ?? 'ensure').toLowerCase();
    const indexName = indexRaw ?? SessionIndex;
    const dryRunFlag = rest.includes('--dry-run');
    const idArgs = rest.filter((arg) => !arg.startsWith('--'));

    switch (cmd) {
        case 'delete':
            await deleteOpenSearchIndex(indexName);
            break;
        case 'create':
            await createOpenSearchIndex(indexName);
            break;
        case 'recreate':
            await deleteOpenSearchIndex(indexName);
            await createOpenSearchIndex(indexName);
            break;
        case 'ensure':
            await ensureOpenSearchIndex(indexName, dryRunFlag);
            break;
        case 'ensure:dry':
        case 'ensure-dry':
        case 'ensure-dry-run':
            await ensureOpenSearchIndex(indexName, true);
            break;
        case 'get':
        case 'mget': {
            // Make index optional: if the provided index isn't a known domain index, default to 'session' and treat it as an ID
            let effectiveIndex = indexName;
            let effectiveIds = idArgs;
            if (!DomainIndices.includes(indexName as DomainIndex)) {
                effectiveIndex = SessionIndex;
                effectiveIds = [indexName, ...idArgs].filter(Boolean);
            }
            await getDocuments(effectiveIndex, effectiveIds);
            break;
        }
        case 'get-raw':
        case 'mget-raw': {
            // Make index optional: if the provided index isn't a known domain index, default to 'session' and treat it as an ID
            let effectiveIndex = indexName;
            let effectiveIds = idArgs;
            if (!DomainIndices.includes(indexName as DomainIndex)) {
                effectiveIndex = SessionIndex;
                effectiveIds = [indexName, ...idArgs].filter(Boolean);
            }
            await getDocumentsRaw(effectiveIndex, effectiveIds);
            break;
        }
        case 'count': {
            const target = indexRaw?.toLowerCase();
            if (!target || target === 'all') {
                const res = await countAllDocuments();
                console.log(JSON.stringify(res, null, 2));
            } else {
                if (!DomainIndices.includes(indexRaw as DomainIndex)) {
                    throw new Error(`Invalid index name: ${indexRaw}. Valid options: ${DomainIndices.join(', ')} or 'all'`);
                }
                const c = await countDocumentsForIndex(indexRaw as DomainIndex);
                console.log(JSON.stringify({ index: indexRaw, count: c }, null, 2));
            }
            break;
        }
        case 'size': {
            const target = indexRaw?.toLowerCase();
            if (!target || target === 'all') {
                const res = await getStoreSizeAll();
                console.log(JSON.stringify(res, null, 2));
            } else {
                if (!DomainIndices.includes(indexRaw as DomainIndex)) {
                    throw new Error(`Invalid index name: ${indexRaw}. Valid options: ${DomainIndices.join(', ')} or 'all'`);
                }
                const bytes = await getStoreSizeBytesForIndex(indexRaw as DomainIndex);
                const mb = bytesToMB(bytes);
                console.log(JSON.stringify({ index: indexRaw, bytes, mb: Number(mb.toFixed(3)) }, null, 2));
            }
            break;
        }
        case 'diagnose': {
            // Parse command line args for diagnose
            // Format: diagnose [--date-start YYYY-MM-DD] [--date-end YYYY-MM-DD] [--user-type TYPE] [--invocation-mode MODE] [--chat-app-id ID] [--entity-attr NAME] [--entity-value VALUE]
            const options: DiagnoseOptions = {};
            for (let i = 0; i < rest.length; i++) {
                const arg = rest[i];
                if (arg === '--date-start' && rest[i + 1]) {
                    options.dateStart = rest[++i];
                } else if (arg === '--date-end' && rest[i + 1]) {
                    options.dateEnd = rest[++i];
                } else if (arg === '--user-type' && rest[i + 1]) {
                    options.userType = rest[++i];
                } else if (arg === '--invocation-mode' && rest[i + 1]) {
                    options.invocationMode = rest[++i];
                } else if (arg === '--chat-app-id' && rest[i + 1]) {
                    options.chatAppId = rest[++i];
                } else if (arg === '--entity-attr' && rest[i + 1]) {
                    options.entityAttribute = rest[++i];
                } else if (arg === '--entity-value' && rest[i + 1]) {
                    options.entityValue = rest[++i];
                }
            }
            await diagnoseSessionData(options);
            break;
        }
        case 'fix-keywords':
            await fixKeywordFields();
            break;
        case 'verify':
        case 'verify-replication': {
            // Format: verify <messageId> [sessionId]
            const messageId = indexName; // First arg after command
            const sessionId = idArgs[0]; // Optional second arg

            if (!messageId) {
                throw new Error('Please provide a message ID. Usage: verify <messageId> [sessionId]');
            }

            await verifyMessageReplication(messageId, sessionId);
            break;
        }
        case 'reset-session': {
            // Format: reset-session <sessionId> [--dry-run]
            const sessionId = indexName; // First arg after command

            if (!sessionId) {
                throw new Error('Please provide a session ID. Usage: reset-session <sessionId> [--dry-run]');
            }

            await resetSessionForTesting(sessionId, dryRunFlag);
            break;
        }
        case 'analyze-external': {
            // Parse date arguments
            let dateStart = '2025-10-01';
            let dateEnd = '2025-10-31';

            for (let i = 0; i < rest.length; i++) {
                const arg = rest[i];
                if (arg === '--date-start' && rest[i + 1]) {
                    dateStart = rest[++i];
                } else if (arg === '--date-end' && rest[i + 1]) {
                    dateEnd = rest[++i];
                }
            }

            await analyzeExternalSessions(dateStart, dateEnd);
            break;
        }
        case 'help':
        default:
            console.log(
                [
                    'Usage:',
                    '  pnpm tsx tools/os/os-tools.ts <command> [index] [--dry-run] [ids...]',
                    '',
                    'Commands:',
                    '  ensure            Ensure index exists and mappings are up to date (additive updates only)',
                    '  ensure:dry        Same as ensure, but dry-run (no changes; logs intended actions)',
                    '  ensure-dry-run    Alias of ensure:dry',
                    '  create            Create index if missing (legacy alias of ensure without dry-run)',
                    '  delete            Delete index',
                    '  recreate          Delete then create index',
                    '  get|mget          Retrieve documents by IDs (converted to camelCase)',
                    '  get-raw|mget-raw  Retrieve RAW documents by IDs (snake_case as stored in OpenSearch)',
                    '  count             Count documents (usage: count [index|all], default: all)',
                    '  size              Report storage size in bytes and MB (usage: size [index|all], default: all)',
                    '  diagnose          Analyze session index data and test filters',
                    '  fix-keywords      Fix missing keyword fields (user_type_keyword, invocation_mode_keyword, source_keyword)',
                    '  verify            Verify message replication (usage: verify <messageId> [sessionId])',
                    '  reset-session     Reset session for testing - removes messages from index and clears session metrics',
                    '  analyze-external  Retrieve all external-user sessions and analyze by invocation mode',
                    '',
                    'Analyze External Options:',
                    '  --date-start YYYY-MM-DD    Start date (default: 2025-10-01)',
                    '  --date-end YYYY-MM-DD      End date (default: 2025-10-31)',
                    '',
                    'Diagnose Options:',
                    '  --date-start YYYY-MM-DD    Start date for date range filter',
                    '  --date-end YYYY-MM-DD      End date for date range filter',
                    '  --user-type TYPE           Filter by user type (e.g., external-user, internal-user)',
                    '  --invocation-mode MODE     Filter by invocation mode (e.g., chat-app, undefined, direct-agent-invoke)',
                    '  --chat-app-id ID           Filter by chat app ID',
                    '  --entity-attr NAME         Entity attribute name (e.g., accountId)',
                    '  --entity-value VALUE       Entity attribute value to filter by',
                    '',
                    'Diagnose Examples:',
                    '  pnpm tsx tools/os/os-tools.ts diagnose',
                    '  pnpm tsx tools/os/os-tools.ts diagnose --date-start 2025-10-01 --date-end 2025-10-31',
                    '  pnpm tsx tools/os/os-tools.ts diagnose --user-type external-user --invocation-mode chat-app',
                    '',
                    'Reset Session Examples:',
                    '  pnpm tsx tools/os/os-tools.ts reset-session <sessionId> --dry-run   # Preview what will be deleted',
                    '  pnpm tsx tools/os/os-tools.ts reset-session <sessionId>              # Actually reset the session',
                    '',
                    `Defaults: index='${SessionIndex}'`
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
