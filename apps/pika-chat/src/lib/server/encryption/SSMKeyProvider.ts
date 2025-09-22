import { DeleteParameterCommand, GetParameterCommand, GetParametersByPathCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { SsmKeyParameters } from './types';

/**
 * Handles SSM Parameter Store operations for cookie encryption key management.
 *
 * Parameter structure:
 * - {prefix}/current-version: Current active key version number
 * - {prefix}/active-versions: JSON array of active version numbers
 * - {prefix}/keys/v{N}/encrypted-key: Encrypted data key for version N
 * - {prefix}/last-rotation-time: ISO timestamp of last rotation
 */
export class SSMKeyProvider {
    private ssmClient: SSMClient;
    private parameterPrefix: string;
    private lockParameterName: string;
    private kmsKeyAliasName: string;

    constructor(parameterPrefix: string, region: string, kmsKeyAliasName: string) {
        this.parameterPrefix = parameterPrefix;
        this.ssmClient = new SSMClient({ region });
        this.lockParameterName = `${parameterPrefix}/rotation-lock`;
        this.kmsKeyAliasName = kmsKeyAliasName;
    }

    /**
     * Get the current active version number
     * @returns Current version number
     * @throws Error if parameter doesn't exist (indicates uninitialized system)
     */
    async getCurrentVersion(): Promise<number> {
        try {
            const command = new GetParameterCommand({
                Name: `${this.parameterPrefix}/current-version`
            });

            const response = await this.ssmClient.send(command);
            const version = parseInt(response.Parameter?.Value || '0');

            if (isNaN(version) || version <= 0) {
                throw new Error(`Invalid current version value: ${response.Parameter?.Value}`);
            }

            return version;
        } catch (error) {
            if (error instanceof Error && error.name === 'ParameterNotFound') {
                throw new Error('Current version parameter not found - system needs initialization');
            }
            throw new Error(`Failed to get current version: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get the list of active version numbers
     * @returns Array of active version numbers
     */
    async getActiveVersions(): Promise<number[]> {
        try {
            const command = new GetParameterCommand({
                Name: `${this.parameterPrefix}/active-versions`
            });

            const response = await this.ssmClient.send(command);
            const versionsJson = response.Parameter?.Value;

            if (!versionsJson) {
                return [];
            }

            const versions = JSON.parse(versionsJson);

            if (!Array.isArray(versions)) {
                throw new Error(`Active versions parameter is not an array: ${versionsJson}`);
            }

            return versions.filter((v) => Number.isInteger(v) && v > 0);
        } catch (error) {
            if (error instanceof Error && error.name === 'ParameterNotFound') {
                return []; // Return empty array if parameter doesn't exist yet
            }
            if (error instanceof SyntaxError) {
                throw new Error(`Failed to parse active versions JSON: ${error.message}`);
            }
            throw new Error(`Failed to get active versions: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get encrypted data encryption key for a specific version
     * @param version - Version number
     * @returns Base64 encoded encrypted key
     */
    async getEncryptedDEK(version: number): Promise<string> {
        try {
            const command = new GetParameterCommand({
                Name: `${this.parameterPrefix}/keys/v${version}/encrypted-key`,
                WithDecryption: true // SSM will decrypt SecureString parameters
            });

            const response = await this.ssmClient.send(command);
            const encryptedKey = response.Parameter?.Value;

            if (!encryptedKey) {
                throw new Error(`Empty encrypted key for version ${version}`);
            }

            return encryptedKey;
        } catch (error) {
            if (error instanceof Error && error.name === 'ParameterNotFound') {
                throw new Error(`Encrypted key for version ${version} not found`);
            }
            throw new Error(`Failed to get encrypted key for version ${version}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Store encrypted data encryption key for a version
     * @param version - Version number
     * @param encryptedDEK - Base64 encoded encrypted key
     */
    async storeEncryptedDEK(version: number, encryptedDEK: string): Promise<void> {
        try {
            const command = new PutParameterCommand({
                Name: `${this.parameterPrefix}/keys/v${version}/encrypted-key`,
                Value: encryptedDEK,
                Type: 'SecureString',
                Overwrite: true,
                Description: `Encrypted data encryption key for cookie encryption version ${version}`
            });

            await this.ssmClient.send(command);
        } catch (error) {
            throw new Error(`Failed to store encrypted key for version ${version}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Update the current version number
     * @param version - New current version number
     */
    async updateCurrentVersion(version: number): Promise<void> {
        try {
            const command = new PutParameterCommand({
                Name: `${this.parameterPrefix}/current-version`,
                Value: version.toString(),
                Type: 'String',
                Overwrite: true,
                Description: 'Current active cookie encryption key version'
            });

            await this.ssmClient.send(command);
        } catch (error) {
            throw new Error(`Failed to update current version to ${version}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Update the list of active versions
     * @param versions - Array of active version numbers
     */
    async updateActiveVersions(versions: number[]): Promise<void> {
        try {
            const command = new PutParameterCommand({
                Name: `${this.parameterPrefix}/active-versions`,
                Value: JSON.stringify(versions),
                Type: 'String',
                Overwrite: true,
                Description: 'List of active cookie encryption key versions'
            });

            await this.ssmClient.send(command);
        } catch (error) {
            throw new Error(`Failed to update active versions: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Delete old key versions from SSM
     * @param versions - Array of version numbers to delete
     */
    async deleteOldKeys(versions: number[]): Promise<void> {
        const deletionPromises = versions.map(async (version) => {
            try {
                // Delete encrypted key
                await this.ssmClient.send(
                    new DeleteParameterCommand({
                        Name: `${this.parameterPrefix}/keys/v${version}/encrypted-key`
                    })
                );

                console.log(`Successfully deleted key version ${version}`);
            } catch (error) {
                console.warn(`Failed to delete key version ${version}: ${error instanceof Error ? error.message : String(error)}`);
                // Don't throw - we want to continue deleting other versions
            }
        });

        await Promise.allSettled(deletionPromises);
    }

    /**
     * Get the last rotation time
     * @returns Date of last rotation, or null if never rotated
     */
    async getLastRotationTime(): Promise<Date | null> {
        try {
            const command = new GetParameterCommand({
                Name: `${this.parameterPrefix}/last-rotation-time`
            });

            const response = await this.ssmClient.send(command);
            const timestamp = response.Parameter?.Value;

            if (!timestamp) {
                return null;
            }

            return new Date(timestamp);
        } catch (error) {
            if (error instanceof Error && error.name === 'ParameterNotFound') {
                return null; // Parameter doesn't exist yet
            }
            throw new Error(`Failed to get last rotation time: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Update the last rotation time
     * @param timestamp - Date of rotation
     */
    async updateLastRotationTime(timestamp: Date): Promise<void> {
        try {
            const command = new PutParameterCommand({
                Name: `${this.parameterPrefix}/last-rotation-time`,
                Value: timestamp.toISOString(),
                Type: 'String',
                Overwrite: true,
                Description: 'Timestamp of last cookie encryption key rotation'
            });

            await this.ssmClient.send(command);
        } catch (error) {
            throw new Error(`Failed to update last rotation time: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Delete all key-related parameters.  Only used when cleaning up after infrastructure deletion.
     */
    async delteAllKeyParameters(): Promise<void> {
        try {
            const command = new GetParametersByPathCommand({
                Path: this.parameterPrefix,
                Recursive: true,
                WithDecryption: true
            });

            const response = await this.ssmClient.send(command);
            const parameters = response.Parameters || [];

            for (const param of parameters) {
                if (param.Name) {
                    await this.ssmClient.send(
                        new DeleteParameterCommand({
                            Name: param.Name
                        })
                    );
                }
            }
        } catch (error) {
            throw new Error(`Failed to delete all key parameters: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get all key-related parameters in a single SSM call (optimized)
     * @returns Object with all key management data
     */
    async getAllKeyParameters(): Promise<SsmKeyParameters> {
        try {
            const command = new GetParametersByPathCommand({
                Path: this.parameterPrefix,
                Recursive: true,
                WithDecryption: true
            });

            const response = await this.ssmClient.send(command);
            const parameters = response.Parameters || [];

            // Parse parameters into structured data
            let currentVersion: number | undefined;
            let activeVersions: number[] | undefined;
            let lastRotationTime: Date | undefined;
            let encryptedKeys: Record<number, string> | undefined;

            for (const param of parameters) {
                const name = param.Name || '';
                const value = param.Value || '';

                if (name.endsWith('/current-version')) {
                    currentVersion = parseInt(value);
                    if (isNaN(currentVersion) || currentVersion <= 0) {
                        throw new Error(`Invalid current version value: ${value}`);
                    }
                } else if (name.endsWith('/active-versions')) {
                    if (value) {
                        try {
                            const parsed = JSON.parse(value);
                            if (Array.isArray(parsed)) {
                                activeVersions = parsed.filter((v) => Number.isInteger(v) && v > 0);
                            } else {
                                throw new Error(`Invalid active versions JSON: ${value}`);
                            }
                        } catch (error) {
                            throw new Error(`Failed to parse active versions JSON: ${error instanceof Error ? error.message : String(error)}`);
                        }
                    }
                } else if (name.endsWith('/last-rotation-time')) {
                    if (value) {
                        lastRotationTime = new Date(value);
                    }
                } else if (name.includes('/keys/v') && name.endsWith('/encrypted-key')) {
                    // Extract version number from path like "/keys/v3/encrypted-key"
                    const versionMatch = name.match(/\/keys\/v(\d+)\/encrypted-key$/);
                    if (versionMatch) {
                        const version = parseInt(versionMatch[1]);
                        if (!isNaN(version)) {
                            if (encryptedKeys) {
                                encryptedKeys[version] = value;
                            } else {
                                encryptedKeys = { [version]: value };
                            }
                        } else {
                            throw new Error(`Invalid version number: ${versionMatch[1]}`);
                        }
                    }
                }
            }

            return {
                currentVersion,
                activeVersions,
                lastRotationTime,
                encryptedKeys
            };
        } catch (error) {
            throw new Error(`Failed to get all key parameters: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get all key-related parameters and wait for eventual consistency to reflect expected values
     * @param expectedCurrentVersion Optional expected current version to wait for
     * @param expectedActiveVersions Optional expected active versions (will check if these are included)
     * @param minLastRotationTime Optional minimum last rotation time to wait for
     * @param maxRetries Maximum number of retries (default: 15 for longer wait)
     * @param retryDelayMs Delay between retries in milliseconds (default: 2000)
     * @returns Object with all key management data
     */
    async getAllKeyParametersAndWaitForEventualConsistency(
        expectedCurrentVersion?: number,
        expectedActiveVersions?: number[],
        minLastRotationTime?: Date,
        maxRetries: number = 15,
        retryDelayMs: number = 2000
    ): Promise<SsmKeyParameters> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`[SSMKeyProvider] Attempting to get parameters with expected values (attempt ${attempt}/${maxRetries})`);

            const parameters = await this.getAllKeyParameters();

            // Check if we have complete data
            if (parameters.currentVersion !== undefined && parameters.activeVersions !== undefined && parameters.lastRotationTime !== undefined) {
                let expectationsMet = true;

                // Check expected current version
                if (expectedCurrentVersion !== undefined && parameters.currentVersion !== expectedCurrentVersion) {
                    console.log(`[SSMKeyProvider] Current version mismatch: got ${parameters.currentVersion}, expected ${expectedCurrentVersion}`);
                    expectationsMet = false;
                }

                // Check expected active versions (all expected versions should be in the actual array)
                if (expectedActiveVersions !== undefined) {
                    const missingVersions = expectedActiveVersions.filter((v) => !parameters.activeVersions!.includes(v));
                    if (missingVersions.length > 0) {
                        console.log(
                            `[SSMKeyProvider] Active versions missing: expected to include ${expectedActiveVersions}, got ${parameters.activeVersions}, missing ${missingVersions}`
                        );
                        expectationsMet = false;
                    }
                }

                if (expectationsMet) {
                    console.log(`[SSMKeyProvider] All expectations met on attempt ${attempt}`);
                    return parameters;
                } else {
                    console.log(`[SSMKeyProvider] Expectations not met, continuing retry...`);
                }
            } else {
                console.log(`[SSMKeyProvider] Incomplete parameters found`);
            }

            if (attempt < maxRetries) {
                console.log(`[SSMKeyProvider] Waiting ${retryDelayMs}ms before retry...`);
                await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            }
        }

        console.log(`[SSMKeyProvider] Returning parameters after ${maxRetries} attempts (expectations may not be met)`);
        // Return whatever we got after all retries
        return await this.getAllKeyParameters();
    }

    /**
     * Get the parameter prefix being used
     * @returns The SSM parameter prefix
     */
    getParameterPrefix(): string {
        return this.parameterPrefix;
    }

    async acquireRotationLock(requestId: string): Promise<void> {
        // Race condition protection: Try to acquire a lock
        const lockTimestamp = new Date().toISOString();
        const lockTtlMinutes = 5; // Lock expires after 5 minutes to prevent deadlocks

        // Acquire lock before proceeding
        try {
            // Try to create lock parameter (will fail if it already exists)
            await this.ssmClient.send(
                new PutParameterCommand({
                    Name: this.lockParameterName,
                    Value: `${lockTimestamp}|${requestId || 'unknown'}`,
                    Type: 'String',
                    Description: `Rotation lock acquired at ${lockTimestamp}`
                })
            );
            console.log(`Acquired rotation lock: ${this.lockParameterName}`);
        } catch (lockError) {
            // Lock already exists - check if it's stale
            try {
                const existingLock = await this.ssmClient.send(
                    new GetParameterCommand({
                        Name: this.lockParameterName
                    })
                );
                const lockValue = existingLock.Parameter?.Value || '';
                const [lockTime] = lockValue.split('|');
                const lockAge = Date.now() - new Date(lockTime).getTime();
                const lockAgeMinutes = lockAge / (1000 * 60);

                if (lockAgeMinutes > lockTtlMinutes) {
                    console.log(`Found stale lock (${lockAgeMinutes.toFixed(1)} minutes old), breaking it`);
                    // Delete stale lock and retry
                    await this.ssmClient.send(
                        new DeleteParameterCommand({
                            Name: this.lockParameterName
                        })
                    );
                    // Retry acquiring lock
                    await this.ssmClient.send(
                        new PutParameterCommand({
                            Name: this.lockParameterName,
                            Value: `${lockTimestamp}|${requestId || 'unknown'}`,
                            Type: 'String',
                            Overwrite: true
                        })
                    );
                    console.log(`Acquired rotation lock after breaking stale lock`);
                } else {
                    throw new Error(`Another rotation is in progress (lock age: ${lockAgeMinutes.toFixed(1)} minutes)`);
                }
            } catch (ex) {
                console.error('Failed to check existing lock:', ex);
                throw new Error('Rotation lock conflict and unable to resolve');
            }
        }
    }

    async releaseRotationLock(): Promise<void> {
        try {
            await this.ssmClient.send(
                new DeleteParameterCommand({
                    Name: this.lockParameterName
                })
            );
            console.log('Released rotation lock');
        } catch (ex) {
            console.warn('Failed to clean up rotation lock (non-fatal):', ex);
        }
    }
}
