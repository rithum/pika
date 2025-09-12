import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

export async function getLoggedInAccountIdFromSts(): Promise<string> {
    const sts = new STSClient({});
    const command = new GetCallerIdentityCommand({});
    const response = await sts.send(command);
    if (!response.Account) {
        throw new Error('No account ID found');
    }
    return response.Account;
}
