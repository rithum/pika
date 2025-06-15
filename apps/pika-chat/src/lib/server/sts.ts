import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

export async function getLoggedInAccountFromSts(): Promise<[string, string]> {
    const sts = new STSClient({});
    const command = new GetCallerIdentityCommand({});
    const response = await sts.send(command);
    if (!response.Account) {
        throw new Error('No account ID found');
    }
    return [response.Account, await sts.config.region()];
}
