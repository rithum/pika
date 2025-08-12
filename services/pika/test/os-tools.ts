import { deleteIndex } from '../src/lib/opensearch/opensearch';
import { ensureDomainExists } from '../src/lib/opensearch/index-initializer';
import { type DomainIndex, DomainIndices, SessionIndex } from '../src/lib/opensearch/types';

process.env.PIKA_DOMAIN_ENDPOINT = 'search-pika-test-cyx7qrkojtwf4lbvcorpbztbby.us-east-1.es.amazonaws.com';
process.env.stage = 'test';
process.env.AWS_REGION = 'us-east-1';

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

async function main(): Promise<void> {
    // const [, , cmdRaw, indexRaw] = process.argv;
    // const cmd = (cmdRaw ?? 'recreate').toLowerCase();
    // const indexName = indexRaw ?? SessionIndex;
    // switch (cmd) {
    //     case 'delete':
    //         await deleteOpenSearchIndex(indexName);
    //         break;
    //     case 'create':
    //         await createOpenSearchIndex(indexName);
    //         break;
    //     case 'recreate':
    //         await deleteOpenSearchIndex(indexName);
    //         await createOpenSearchIndex(indexName);
    //         break;
    //     default:
    //         throw new Error(`Unknown command: ${cmd}. Use one of: delete | create | recreate`);
    // }
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
