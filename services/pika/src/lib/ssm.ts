import { GetParameterCommand, GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
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

export async function getParametersByPath(path: string): Promise<Record<string, string>> {
    try {
        const ssm = getSsmClient();
        const parameters: Record<string, string> = {};
        let nextToken: string | undefined;

        do {
            const command = new GetParametersByPathCommand({
                Path: path,
                Recursive: true,
                WithDecryption: true,
                NextToken: nextToken
            });

            const response = await ssm.send(command);

            if (response.Parameters) {
                for (const parameter of response.Parameters) {
                    if (parameter.Name && parameter.Value) {
                        // Extract the key name from the full path (last segment after the last '/')
                        const keyName = parameter.Name.split('/').pop() || parameter.Name;
                        parameters[keyName] = parameter.Value;
                    }
                }
            }

            nextToken = response.NextToken;
        } while (nextToken);

        return parameters;
    } catch (error) {
        console.error(`Error getting parameters by path from parameter store for ${path}`, error);
        throw error;
    }
}
