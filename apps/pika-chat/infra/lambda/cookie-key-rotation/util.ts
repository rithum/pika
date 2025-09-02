import { SSMClient, GetParameterCommand, PutParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms';

/**
 * If the param doesn't exist since we are just deploying the stack for the first time, this will
 * throw a ParameterNotFound exception.
 *
 * @param ssmClient
 * @param parameterPrefix
 * @returns
 */
export async function getCurrentVersion(ssmClient: SSMClient, parameterPrefix: string): Promise<number> {
    const response = await ssmClient.send(
        new GetParameterCommand({
            Name: `${parameterPrefix}/current-version`
        })
    );
    return parseInt(response.Parameter?.Value || '0');
}

export async function getActiveVersions(ssmClient: SSMClient, parameterPrefix: string): Promise<number[]> {
    const response = await ssmClient.send(
        new GetParameterCommand({
            Name: `${parameterPrefix}/active-versions`
        })
    );
    return JSON.parse(response.Parameter?.Value || '[]');
}

export async function getLastRotationTime(ssmClient: SSMClient, parameterPrefix: string): Promise<Date | undefined> {
    try {
        const response = await ssmClient.send(
            new GetParameterCommand({
                Name: `${parameterPrefix}/last-rotation-time`
            })
        );
        return response.Parameter?.Value ? new Date(response.Parameter.Value) : undefined;
    } catch (error) {
        return undefined; // Parameter doesn't exist yet
    }
}

export function shouldRotateKeys(lastRotationTime: Date | undefined, intervalHours: number): boolean {
    if (!lastRotationTime) {
        console.log('No last rotation time found - rotation needed for initialization');
        return true; // No rotation time means initialize
    }

    const now = new Date();
    const timeDiff = now.getTime() - lastRotationTime.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    console.log(`Time since last rotation: ${hoursDiff.toFixed(2)} hours (threshold: ${intervalHours} hours)`);

    const shouldRotate = hoursDiff >= intervalHours;

    if (shouldRotate) {
        console.log('Rotation needed - time threshold exceeded');
    } else {
        console.log('Rotation not needed - time threshold not met');
    }

    return shouldRotate;
}

export async function generateDataKey(kmsClient: KMSClient, keyAlias: string): Promise<{ plaintextKey: Buffer; encryptedKey: string }> {
    const response = await kmsClient.send(
        new GenerateDataKeyCommand({
            KeyId: keyAlias,
            KeySpec: 'AES_256'
        })
    );

    if (!response.Plaintext || !response.CiphertextBlob) {
        throw new Error('Failed to generate data key');
    }

    return {
        plaintextKey: Buffer.from(response.Plaintext),
        encryptedKey: Buffer.from(response.CiphertextBlob).toString('base64')
    };
}

export async function storeEncryptedDEK(ssmClient: SSMClient, parameterPrefix: string, version: number, encryptedKey: string): Promise<void> {
    await ssmClient.send(
        new PutParameterCommand({
            Name: `${parameterPrefix}/keys/v${version}/encrypted-key`,
            Value: encryptedKey,
            Type: 'SecureString',
            Overwrite: true,
            Description: `Encrypted data encryption key for version ${version}`
        })
    );
}

export async function updateCurrentVersion(ssmClient: SSMClient, parameterPrefix: string, version: number): Promise<void> {
    await ssmClient.send(
        new PutParameterCommand({
            Name: `${parameterPrefix}/current-version`,
            Value: version.toString(),
            Type: 'String',
            Overwrite: true,
            Description: 'Current active cookie encryption key version'
        })
    );
}

export async function updateActiveVersions(ssmClient: SSMClient, parameterPrefix: string, versions: number[]): Promise<void> {
    await ssmClient.send(
        new PutParameterCommand({
            Name: `${parameterPrefix}/active-versions`,
            Value: JSON.stringify(versions),
            Type: 'String',
            Overwrite: true,
            Description: 'List of active cookie encryption key versions'
        })
    );
}

export async function updateLastRotationTime(ssmClient: SSMClient, parameterPrefix: string, timestamp: Date): Promise<void> {
    await ssmClient.send(
        new PutParameterCommand({
            Name: `${parameterPrefix}/last-rotation-time`,
            Value: timestamp.toISOString(),
            Type: 'String',
            Overwrite: true,
            Description: 'Timestamp of last key rotation'
        })
    );
}

export async function cleanupOldKeys(ssmClient: SSMClient, parameterPrefix: string, versions: number[]): Promise<void> {
    for (const version of versions) {
        try {
            await ssmClient.send(
                new DeleteParameterCommand({
                    Name: `${parameterPrefix}/keys/v${version}/encrypted-key`
                })
            );
            console.log(`Cleaned up old key version ${version}`);
        } catch (error) {
            console.warn(`Failed to cleanup version ${version}:`, error);
        }
    }
}
