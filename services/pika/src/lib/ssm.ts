import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { getRegion } from './utils';

let ssm: SSMClient | undefined;

function getSsmClient() {
    if (!ssm) {
        ssm = new SSMClient({
            region: getRegion()
        });
    }
    return ssm;
}

export async function getValueFromParameterStore(parameterName: string): Promise<string | undefined> {
    try {
        const ssm = getSsmClient();
        const command = new GetParameterCommand({
            Name: parameterName,
            WithDecryption: true
        });
        const response = await ssm.send(command);
        return response.Parameter?.Value;
    } catch (error) {
        console.error(`Error getting value from parameter store for ${parameterName}`, error);
        throw error;
    }
}
