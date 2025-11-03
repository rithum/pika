import OsClient from '../../src/lib/opensearch/opensearch-client';
import { SessionIndex } from '../../src/lib/opensearch/types';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Property } from '@opensearch-project/opensearch/api/_types/_common.mapping.js';

/**
 * Update the session index mapping to add message replication fields.
 *
 * CRITICAL: This script MUST be run BEFORE deploying code that writes to these fields.
 *
 * Adds:
 * - messages_summary: nested array of per-message metadata for analytics
 * - messages_analysis: object with pre-computed timing statistics
 *
 * If code deploys first and writes to these fields before the mapping exists,
 * OpenSearch will auto-index them with incorrect types, causing query failures
 * and requiring expensive reindexing.
 */
async function updateSessionMappingForMessages() {
    console.log('CRITICAL: Updating session index mapping for message replication');
    console.log('This script adds messages_summary and messages_analysis fields.');
    console.log('');

    const client = await OsClient.getClient();
    const indexName = SessionIndex;

    try {
        // Step 1: Check if index exists
        console.log(`Checking if ${indexName} exists...`);
        const exists = await client.indices.exists({ index: indexName });
        if (!exists.body) {
            console.error(`Index ${indexName} does not exist.`);
            console.error('The session index should already exist. Cannot proceed.');
            throw new Error(`Index ${indexName} not found`);
        }
        console.log(`✓ Index ${indexName} exists`);

        // Step 2: Check if fields already exist (idempotent operation)
        console.log('\nChecking if fields already exist...');
        const getMapping = await client.indices.getMapping({ index: indexName });
        const existingMapping = getMapping.body[indexName]?.mappings?.properties;

        const messagesSummaryExists = !!existingMapping?.messages_summary;
        const messagesAnalysisExists = !!existingMapping?.messages_analysis;

        if (messagesSummaryExists && messagesAnalysisExists) {
            console.log('✓ Both messages_summary and messages_analysis fields already exist');
            console.log('Nothing to do - mapping is already up to date!');
            return;
        }

        if (messagesSummaryExists && !messagesAnalysisExists) {
            console.log('messages_summary exists but messages_analysis is missing');
        } else if (!messagesSummaryExists && messagesAnalysisExists) {
            console.log('messages_analysis exists but messages_summary is missing');
        } else {
            console.log('✓ Neither field exists yet - will add both');
        }

        // Step 3: Define the new fields
        const newFields: Record<string, Property> = {
            messages_summary: {
                type: 'nested',
                properties: {
                    message_id: { type: 'keyword' },
                    timestamp: { type: 'date' },
                    source: { type: 'keyword' },
                    model: { type: 'keyword' },
                    input_tokens: { type: 'long' },
                    output_tokens: { type: 'long' },
                    input_cost: { type: 'double' },
                    output_cost: { type: 'double' },
                    total_cost: { type: 'double' },
                    execution_duration: { type: 'long' }
                }
            },
            messages_analysis: {
                properties: {
                    timing_stats: {
                        properties: {
                            total_messages: { type: 'long' },
                            total_user_messages: { type: 'long' },
                            total_assistant_messages: { type: 'long' },
                            conversation_duration_ms: { type: 'long' },
                            first_message_timestamp: { type: 'date' },
                            last_message_timestamp: { type: 'date' },
                            avg_gap_ms: { type: 'double' },
                            total_gap_time_ms: { type: 'long' },
                            total_gap_count: { type: 'long' },
                            avg_response_time_ms: { type: 'double' },
                            response_time_total_ms: { type: 'long' },
                            response_time_count: { type: 'long' },
                            avg_think_time_ms: { type: 'double' },
                            think_time_total_ms: { type: 'long' },
                            think_time_count: { type: 'long' },
                            gaps_over_1h: { type: 'long' },
                            gaps_over_1d: { type: 'long' },
                            gaps_over_1w: { type: 'long' }
                        }
                    },
                    last_message: {
                        properties: {
                            timestamp: { type: 'date' },
                            source: { type: 'keyword' },
                            message_id: { type: 'keyword' }
                        }
                    },
                    last_updated: { type: 'date' }
                }
            }
        };

        // Step 4: Update the mapping
        console.log('\nUpdating mapping...');
        console.log('Adding fields:');
        console.log('  - messages_summary (nested array)');
        console.log('  - messages_analysis (object with timing stats)');

        const response = await client.indices.putMapping({
            index: indexName,
            body: {
                properties: newFields
            }
        });

        if (response.statusCode === 200 || response.body?.acknowledged) {
            console.log(`✓ Successfully updated mapping for ${indexName}`);
        } else {
            console.error('Unexpected response:', JSON.stringify(response, null, 2));
            throw new Error('Failed to update mapping');
        }

        // Step 5: Verify the fields were added
        console.log('\nVerifying mapping update...');
        const updatedMapping = await client.indices.getMapping({ index: indexName });
        const mapping = updatedMapping.body[indexName]?.mappings?.properties;

        const messagesSummaryNow = !!mapping?.messages_summary;
        const messagesAnalysisNow = !!mapping?.messages_analysis;

        if (messagesSummaryNow) {
            console.log('✓ Confirmed: messages_summary field is now in the mapping');
        } else {
            console.error('ERROR: messages_summary field not found in mapping after update');
            throw new Error('Mapping verification failed for messages_summary');
        }

        if (messagesAnalysisNow) {
            console.log('✓ Confirmed: messages_analysis field is now in the mapping');
        } else {
            console.error('ERROR: messages_analysis field not found in mapping after update');
            throw new Error('Mapping verification failed for messages_analysis');
        }

        console.log('\nMapping update complete!');
        console.log('\n📋 Next steps:');
        console.log('  1. Deploy the backend stack (message index will be created automatically)');
        console.log('  2. Run backfill-invocation-mode-to-messages tool');
        console.log('  3. Run backfill-messages-to-opensearch tool');
        console.log('  4. Deploy the frontend');
        console.log('\nWARNING: Do NOT skip this script or run it after deployment!');
    } catch (error) {
        console.error('\nMapping update failed:', error);
        console.error('\nIf this fails, check:');
        console.error('  - PIKA_DOMAIN_ENDPOINT is correct in .env.local');
        console.error('  - AWS credentials have OpenSearch permissions');
        console.error('  - OpenSearch cluster is accessible');
        throw error;
    }
}

async function main(): Promise<void> {
    // Load .env.local if present
    const envPath = path.join(__dirname, '..', '..', '.env.local');
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`Loaded environment variables from ${envPath}\n`);
    }

    // Ensure required env vars are present
    const requiredEnv = ['PIKA_DOMAIN_ENDPOINT', 'stage', 'AWS_REGION'] as const;
    const missing = requiredEnv.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}.\n` + `Create services/pika/.env.local with these keys or export them in your shell.`);
    }

    console.log(`Environment:`);
    console.log(`  Stage: ${process.env.stage}`);
    console.log(`  Region: ${process.env.AWS_REGION}`);
    console.log(`  Domain: ${process.env.PIKA_DOMAIN_ENDPOINT}`);
    console.log('');

    await updateSessionMappingForMessages();
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
