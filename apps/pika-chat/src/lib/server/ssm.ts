import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { appConfig } from './config';

let ssm: SSMClient | undefined;

function getSsmClient(region?: string) {
    if (!ssm) {
        ssm = new SSMClient({
            region: region ?? appConfig.awsRegion,
        });
    }
    return ssm;
}

export async function getValueFromParameterStore(parameterName: string, region?: string): Promise<string | undefined> {
    try {
        const ssm = getSsmClient(region);
        const command = new GetParameterCommand({
            Name: parameterName,
            WithDecryption: true,
        });
        const response = await ssm.send(command);
        return response.Parameter?.Value;
    } catch (error) {
        console.error(`Error getting value from parameter store for ${parameterName}`, error);
        throw error;
    }
}
