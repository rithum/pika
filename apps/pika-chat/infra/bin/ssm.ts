import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

let ssm: SSMClient | undefined;

function getS3Client() {
    if (!ssm) {
        ssm = new SSMClient({
            region: 'us-east-1',
        });
    }
    return ssm;
}

export async function getValueFromParameterStore(parameterName: string): Promise<string | undefined> {
    const ssm = getS3Client();
    const command = new GetParameterCommand({
        Name: parameterName,
    });
    const response = await ssm.send(command);
    return response.Parameter?.Value;   
}
