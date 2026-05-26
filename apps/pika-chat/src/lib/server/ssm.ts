import { GetParameterCommand, GetParametersByPathCommand, ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import { appConfig } from './config';

let ssm: SSMClient | undefined;

function getSsmClient(region?: string) {
    if (!ssm) {
        ssm = new SSMClient({
            region: region ?? appConfig.awsRegion
        });
    }
    return ssm;
}

function isParameterNotFoundError(error: unknown): boolean {
    return error instanceof ParameterNotFound || (error instanceof Error && error.name === 'ParameterNotFound');
}

export async function getValueFromParameterStore(parameterName: string, region?: string): Promise<string | undefined> {
    try {
        const ssm = getSsmClient(region);
        const command = new GetParameterCommand({
            Name: parameterName,
            WithDecryption: true
        });
        const response = await ssm.send(command);
        return response.Parameter?.Value;
    } catch (error) {
        if (isParameterNotFoundError(error)) {
            return undefined;
        }
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
