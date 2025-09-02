import { DecryptCommand, GenerateDataKeyCommand, KMSClient } from '@aws-sdk/client-kms';
import { DeleteParameterCommand, GetParameterCommand, GetParametersByPathCommand, ParameterNotFound, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { KeyRotationResult, SsmKeyParameters } from './types';
import type { SSMKeyProvider } from './SSMKeyProvider';
import type { KMSProvider } from './KMSProvider';

/**
 * Perform key rotation with proper locking and error handling.
 */
export async function rotateKeys(
    ssmKeyProvider: SSMKeyProvider,
    kmsProvider: KMSProvider,
    maxKeyVersions: number,
    forceRotation: boolean = false,
    requestId?: string
): Promise<KeyRotationResult> {
    // Check if initialization is needed
    const parameters = await ssmKeyProvider.getAllKeyParameters();
    let currentVersion: number;
    let isInitialization = false;
    let activeVersions: number[] = [];

    if (parameters.currentVersion === undefined) {
        console.log('No current version parameter found - initializing keys for first time');
        isInitialization = true;
        currentVersion = 0;
    } else {
        currentVersion = parameters.currentVersion;
        console.log(`Found existing current version: ${currentVersion}`);
    }

    if (!parameters.activeVersions) {
        console.log('No active versions parameter found - initializing keys for first time');
        activeVersions = [];
    } else {
        activeVersions = parameters.activeVersions;
        console.log(`Found existing active versions: ${activeVersions}`);
    }

    // Check if rotation is needed (unless forced or initialization)
    if (!isInitialization && !forceRotation) {
        const lastRotationTime = parameters.lastRotationTime;
        if (!shouldRotateKeys(lastRotationTime, 12)) {
            return {
                oldVersion: currentVersion,
                activeVersions: activeVersions,
                isInitialization
            };
        }
    }

    await ssmKeyProvider.acquireRotationLock(requestId || 'unknown');

    try {
        // Main rotation logic
        console.log(isInitialization ? 'Initializing keys...' : 'Rotating keys...');

        // Calculate new version
        const newVersion = (currentVersion % 100) + 1;

        // Generate new data key
        const { plaintextKey, encryptedKey } = await kmsProvider.generateDataKey();

        // Store encrypted key
        await ssmKeyProvider.storeEncryptedDEK(newVersion, encryptedKey);

        // Update active versions
        const newActiveVersions = [...activeVersions, newVersion].sort((a, b) => b - a).slice(0, maxKeyVersions);

        // Update SSM parameters
        await ssmKeyProvider.updateCurrentVersion(newVersion);
        await ssmKeyProvider.updateActiveVersions(newActiveVersions);
        await ssmKeyProvider.updateLastRotationTime(new Date());

        // Cleanup old keys
        const versionsToDelete = activeVersions.filter((v) => !newActiveVersions.includes(v));
        if (versionsToDelete.length > 0) {
            await ssmKeyProvider.deleteOldKeys(versionsToDelete);
        }

        console.log(`Key ${isInitialization ? 'initialization' : 'rotation'} completed: ${currentVersion} -> ${newVersion}`);

        return {
            oldVersion: currentVersion,
            newVersion: newVersion,
            activeVersions: newActiveVersions,
            isInitialization
        };
    } finally {
        await ssmKeyProvider.releaseRotationLock();
    }
}

/**
 * Determine if keys should be rotated based on the last rotation time.
 */
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
