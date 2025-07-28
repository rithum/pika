import { defaultProvider } from '@aws-sdk/credential-provider-node';
import type { AwsCredentialIdentity } from '@aws-sdk/types';

// Doing it this way on purpose to make it easier to mock out and unit test the client
export default {
    async getProvider(): Promise<AwsCredentialIdentity> {
        return await defaultProvider()();
    }
};
