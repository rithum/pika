import OsClient from '../../src/lib/opensearch/opensearch-client';
import { SessionIndex, chatSessionOpenSearchMappings } from '../../src/lib/opensearch/types';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Property } from '@opensearch-project/opensearch/api/_types/_common.mapping.js';

/**
 * Update the session index mapping to add new fields.
 * This script uses the PUT mapping API to add new fields to an existing index.
 * Note: You can only ADD new fields, not modify existing ones.
 */
async function updateSessionIndexMapping() {
	console.log('Starting session index mapping update...');

	const client = await OsClient.getClient();
	const indexName = SessionIndex;

	try {
		// Step 1: Check if index exists
		console.log(`Checking if ${indexName} exists...`);
		const exists = await client.indices.exists({ index: indexName });
		if (!exists.body) {
			console.log(`Index ${indexName} does not exist. Run 'pnpm tsx tools/os/os-tools.ts create session' first.`);
			return;
		}

		// Step 2: Update the mapping (additive only)
		console.log(`Updating mapping for ${indexName}...`);
		console.log('Adding fields:', JSON.stringify(chatSessionOpenSearchMappings.mappings.properties, null, 2));
		
		const response = await client.indices.putMapping({
			index: indexName,
			body: {
				properties: chatSessionOpenSearchMappings.mappings.properties as Record<string, Property>
			}
		});

		if (response.statusCode === 200 || response.body?.acknowledged) {
			console.log(`✓ Successfully updated mapping for ${indexName}`);
		} else {
			console.error('Unexpected response:', JSON.stringify(response, null, 2));
			throw new Error('Failed to update mapping');
		}

		// Step 3: Verify the new fields were added
		console.log(`Verifying mapping...`);
		const getMapping = await client.indices.getMapping({ index: indexName });
		const mapping = getMapping.body[indexName]?.mappings?.properties;
		
		const invocationModeFound = !!mapping?.invocation_mode_keyword;
		const userTypeFound = !!mapping?.user_type_keyword;
		const sourceFound = !!mapping?.source_keyword;
		
		if (invocationModeFound) {
			console.log(`✓ Confirmed: invocation_mode_keyword field is now in the mapping`);
		} else {
			console.warn('⚠ Warning: invocation_mode_keyword field not found in mapping after update');
		}
		
		if (userTypeFound) {
			console.log(`✓ Confirmed: user_type_keyword field is now in the mapping`);
		} else {
			console.warn('⚠ Warning: user_type_keyword field not found in mapping after update');
		}
		
		if (sourceFound) {
			console.log(`✓ Confirmed: source_keyword field is now in the mapping`);
		} else {
			console.warn('⚠ Warning: source_keyword field not found in mapping after update');
		}

		console.log('\n✅ Mapping update complete!');
		console.log('Next steps:');
		console.log('  1. Run copy-invocation-mode-field.ts to populate the new fields with existing data');
		console.log('  2. Deploy the updated lambda to populate the fields for new sessions');
	} catch (error) {
		console.error('❌ Mapping update failed:', error);
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

	await updateSessionIndexMapping();
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

