import { deleteIndex, getDocumentsByIds } from '../../src/lib/opensearch/opensearch';
import { ensureDomainExists } from '../../src/lib/opensearch/index-initializer';
import { type DomainIndex, DomainIndices, SessionIndex, getIndexMeta } from '../../src/lib/opensearch/types';
import OsClient from '../../src/lib/opensearch/opensearch-client';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

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
                    '  get|mget          Retrieve documents by IDs and print as JSON (usage: get [index] <id1> <id2> ...)',
                    '  count             Count documents (usage: count [index|all], default: all)',
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
