import OsClient from '../../src/lib/opensearch/opensearch-client';
import { SessionIndex } from '../../src/lib/opensearch/types';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Copy values from text fields to keyword fields for aggregation support.
 * This script uses update_by_query to copy field values for all documents.
 * - invocation_mode -> invocation_mode_keyword
 * - user_type -> user_type_keyword
 * - source -> source_keyword
 */
async function copyFieldsToKeywordVariants() {
	console.log('Starting field copy from text fields to keyword variants...');

	const client = await OsClient.getClient();
	const indexName = SessionIndex;

	try {
		// Step 1: Check if index exists
		console.log(`Checking if ${indexName} exists...`);
		const exists = await client.indices.exists({ index: indexName });
		if (!exists.body) {
			console.log(`Index ${indexName} does not exist.`);
			return;
		}

		// Step 2: Count total documents
		console.log(`Counting all documents...`);
		const countResponse = await client.count({
			index: indexName,
			body: {
				query: {
					match_all: {}
				}
			}
		});
		const totalDocs = countResponse.body.count ?? 0;
		console.log(`Found ${totalDocs} total documents`);

		if (totalDocs === 0) {
			console.log('No documents to update.');
			return;
		}

		// Step 3: Use update_by_query to copy all fields
		console.log(`Copying fields to keyword variants for ${totalDocs} documents...`);
		console.log('  - invocation_mode -> invocation_mode_keyword');
		console.log('  - user_type -> user_type_keyword');
		console.log('  - source -> source_keyword');
		console.log('This may take a while for large datasets...');

		const updateResponse = await client.updateByQuery({
			index: indexName,
			body: {
				query: {
					match_all: {}
				},
				script: {
					source: `
						if (ctx._source.invocation_mode != null) {
							ctx._source.invocation_mode_keyword = ctx._source.invocation_mode;
						}
						if (ctx._source.user_type != null) {
							ctx._source.user_type_keyword = ctx._source.user_type;
						}
						if (ctx._source.source != null) {
							ctx._source.source_keyword = ctx._source.source;
						}
					`,
					lang: 'painless'
				}
			},
			wait_for_completion: true,
			refresh: true,
			// Process in batches to avoid timeouts
			scroll_size: 1000,
			conflicts: 'proceed'
		});

		// Cast to any because OpenSearch client types are incomplete for update_by_query response
		const responseBody = updateResponse.body as any;

		console.log(`✓ Update complete!`);
		console.log(`  - Total: ${responseBody.total}`);
		console.log(`  - Updated: ${responseBody.updated}`);
		console.log(`  - Deleted: ${responseBody.deleted}`);
		console.log(`  - Batches: ${responseBody.batches}`);
		console.log(`  - Version conflicts: ${responseBody.version_conflicts}`);
		console.log(`  - Noops: ${responseBody.noops}`);
		console.log(`  - Failures: ${responseBody.failures?.length ?? 0}`);

		if (responseBody.failures && responseBody.failures.length > 0) {
			console.error('Some updates failed:');
			responseBody.failures.forEach((failure: any, idx: number) => {
				console.error(`  Failure ${idx + 1}:`, JSON.stringify(failure, null, 2));
			});
		}

		// Step 4: Verify the copy by checking a few documents
		console.log('\nVerifying the copy...');
		const verifyResponse = await client.search({
			index: indexName,
			body: {
				query: {
					match_all: {}
				},
				size: 5,
				_source: ['session_id', 'invocation_mode', 'invocation_mode_keyword', 'user_type', 'user_type_keyword', 'source', 'source_keyword']
			}
		});

		const hits = verifyResponse.body.hits?.hits ?? [];
		if (hits.length > 0) {
			console.log(`✓ Verified ${hits.length} sample documents:`);
			hits.forEach((hit: any) => {
				const source = hit._source;
				console.log(`  Session ${source.session_id}:`);
				console.log(`    invocation_mode: ${source.invocation_mode} -> invocation_mode_keyword: ${source.invocation_mode_keyword}`);
				console.log(`    user_type: ${source.user_type} -> user_type_keyword: ${source.user_type_keyword}`);
				console.log(`    source: ${source.source} -> source_keyword: ${source.source_keyword}`);
			});
		} else {
			console.warn('⚠ Warning: No documents found for verification');
		}

		console.log('\n✅ Field copy complete!');
		console.log('All keyword variant fields (invocation_mode_keyword, user_type_keyword, source_keyword) are now populated for all existing documents.');
	} catch (error) {
		console.error('❌ Field copy failed:', error);
		throw error;
	}
}

async function main(): Promise<void> {
	// Load .env.local if present
	const envPath = path.join(__dirname, '..', '..', '.env.local');
	if (fs.existsSync(envPath)) {
		dotenv.config({ path: envPath });
		console.log(`Loaded environment variables from ${envPath}`);
	}

	// Ensure required env vars are present
	const requiredEnv = ['PIKA_DOMAIN_ENDPOINT', 'stage', 'AWS_REGION'] as const;
	const missing = requiredEnv.filter((k) => !process.env[k]);
	if (missing.length > 0) {
		throw new Error(
			`Missing required environment variables: ${missing.join(', ')}. ` +
				`Create services/pika/.env.local with these keys or export them in your shell.`
		);
	}

	await copyFieldsToKeywordVariants();
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

