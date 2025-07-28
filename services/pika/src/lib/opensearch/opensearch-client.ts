import type { AwsCredentialIdentity } from '@aws-sdk/types';
import CredentialProvider from './credential-provider';
import { Client, Connection } from '@opensearch-project/opensearch';
import aws4, { type Request } from 'aws4';
import { getRegion, getPikaDomainEndpoint } from '../utils';
import { GeneralError } from './types';

// Do not use this directly.  Use getClient() to gain access to this.
//TODO: get region from environment
let client: Client | undefined;
let endpointUsed: string | undefined;

// Doing it this way on purpose to make it easier to mock out and unit test the client
export default {
    async getClient(refreshIfExisting?: boolean): Promise<Client> {
        const domainEndpoint = getPikaDomainEndpoint();

        if (endpointUsed && domainEndpoint !== endpointUsed) {
            throw new GeneralError(`getClient() called with different domainEndpoint than first call.  Previous: ${endpointUsed}  Current: ${domainEndpoint}`);
        } else {
            if (client && refreshIfExisting === true) {
                await client.close();
                client = undefined;
            } else {
                /* Do the normal thing */
            }

            if (client) {
                return client;
            } else {
                const credentials = await CredentialProvider.getProvider();
                endpointUsed = domainEndpoint;

                let endpointWithHttpsForSure = domainEndpoint;
                if (!domainEndpoint.startsWith('https://')) {
                    console.log(`domainEndpoint config did not start with https:// adding it on it, it was ${domainEndpoint}`);
                    endpointWithHttpsForSure = `https://${domainEndpoint}`;
                }

                console.log(`Creating OpenSearch client for ${endpointWithHttpsForSure}`);

                client = new Client({
                    ...createAwsConnector(credentials, getRegion()),
                    node: endpointWithHttpsForSure
                });
                return client;
            }
        }
    }
};

/**
 * Useful for testing only.  Don't call this for real.
 */
export function reset() {
    client = undefined;
    endpointUsed = undefined;
}

const createAwsConnector = (credentials: AwsCredentialIdentity, region: string) => {
    class AmazonConnection extends Connection {
        buildRequestObject(params: unknown) {
            // Have to cast to aws4 Request to get it to work
            const request = super.buildRequestObject(params) as Request;
            request.service = 'es';
            request.region = region;
            request.headers = request.headers ?? {};
            request.headers.host = request.hostname;
            return aws4.sign(request, credentials);
        }
    }
    return {
        Connection: AmazonConnection
    };
};
