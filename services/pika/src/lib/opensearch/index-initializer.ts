import { Client } from '@opensearch-project/opensearch';
import OsClient from './opensearch-client';
import { DomainIndex, GeneralError, getIndexMeta } from './types';

/**
 * Create the index if it's not there.
 *
 * @param domainEndpoint
 * @param indexName
 * @returns True if we had to create it, false if it existed already.
 */
export async function ensureDomainExists(indexName: DomainIndex): Promise<boolean> {
    console.log(`Ensuring ${indexName} index exists`);

    let result = false;
    const client = await OsClient.getClient(undefined);

    const meta = getIndexMeta(indexName);
    const exists = await domainExists(indexName, client);

    if (!exists) {
        try {
            const createResp = await client.indices.create({ index: meta.name, body: meta.indexCreateBody });
            if (createResp.statusCode !== 200) {
                console.error(`OpenSearch failed to create ${meta.name} index: ${JSON.stringify(createResp, null, 4)}`);
                throw new GeneralError(`OpenSearch failed to create ${meta.name} index: ${JSON.stringify(createResp, null, 4)}`);
            } else {
                /* created default index for domain */
            }
            result = true;
        } catch (ex) {
            if (ex instanceof Error) {
                console.error(`Failed to create ${meta.name} index: ${ex.message} ${ex.stack}`);
            } else {
                console.error(`Failed to create ${meta.name} index: ${ex}`);
            }
            throw new GeneralError(`Failed to create ${meta.name} index: ${ex} ${ex instanceof Error ? `${ex.message} ${ex.stack}` : ''}`);
        }
    } else {
        /* the index exists, we're good */
    }

    return result;
}

export async function domainExists(indexName: DomainIndex, client?: Client): Promise<boolean> {
    try {
        console.log(`Checking if ${indexName} index exists`);
        client = client ?? (await OsClient.getClient(undefined));
        const meta = getIndexMeta(indexName);
        const resp = await client.indices.exists({ index: meta.name });
        console.log(`Response to check if ${indexName} index exists: ${resp.body}`);
        return resp.body;
    } catch (ex) {
        if (ex instanceof Error) {
            console.error(`in domainExists function and got exception: ${ex.message} ${ex.stack}`);
            console.error(`indexName: ${indexName}`);
            console.error(`err: ${ex}`);
        } else {
            console.error(`in domainExists function and got unknown err: ${ex}`);
        }
        throw ex;
    }
}
