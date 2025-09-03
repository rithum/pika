import { KMSClient, GenerateDataKeyCommand, DecryptCommand, ListAliasesCommand, DescribeKeyCommand } from '@aws-sdk/client-kms';

/**
 * Handles KMS operations for cookie encryption key management.
 *
 * Provides:
 * - Data key generation (AES-256 keys)
 * - Decryption of stored encrypted keys
 */
export class KMSProvider {
    private kmsClient: KMSClient;
    private keyAlias: string;

    constructor(keyAlias: string, region: string) {
        this.keyAlias = keyAlias;
        this.kmsClient = new KMSClient({ region });
    }

    /**
     * Get the KMS client
     * @returns The KMS client
     */
    getKMSClient(): KMSClient {
        return this.kmsClient;
    }

    /**
     * Generate a new AES-256 data encryption key
     * @returns Object containing plaintext key and encrypted key (base64)
     */
    async generateDataKey(): Promise<{ plaintextKey: Buffer; encryptedKey: string }> {
        try {
            // First, ensure the alias is available by waiting for it to show up
            console.log('[KMSProvider] Waiting for alias to be available before generating data key...');
            const keyId = await this.getTargetAliasKeyIdWithRetry(20, 250);

            if (!keyId) {
                throw new Error(`Alias ${this.keyAlias} is not available after waiting for eventual consistency`);
            }

            console.log(`[KMSProvider] Alias is available, using key ID ${keyId} to generate data key`);

            // Use the key ID directly instead of alias to avoid eventual consistency issues
            const command = new GenerateDataKeyCommand({
                KeyId: keyId, // Use key ID instead of alias
                KeySpec: 'AES_256'
            });

            const response = await this.kmsClient.send(command);

            if (!response.Plaintext || !response.CiphertextBlob) {
                throw new Error('KMS failed to generate data key - missing plaintext or ciphertext');
            }

            return {
                plaintextKey: Buffer.from(response.Plaintext),
                encryptedKey: Buffer.from(response.CiphertextBlob).toString('base64')
            };
        } catch (error) {
            throw new Error(`Failed to generate data key: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Decrypt an encrypted data key
     * @param encryptedKey - Base64 encoded encrypted key from KMS
     * @returns Decrypted key as Buffer
     */
    async decryptDataKey(encryptedKey: string): Promise<Buffer> {
        try {
            const command = new DecryptCommand({
                CiphertextBlob: Buffer.from(encryptedKey, 'base64')
            });

            const response = await this.kmsClient.send(command);

            if (!response.Plaintext) {
                throw new Error('KMS failed to decrypt data key - missing plaintext');
            }

            return Buffer.from(response.Plaintext);
        } catch (error) {
            throw new Error(`Failed to decrypt data key: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get the KMS key alias being used
     * @returns The KMS key alias
     */
    getKeyAlias(): string {
        return this.keyAlias;
    }

    /**
     * Get the KMS key ID for the target alias
     * @returns The KMS key ID for the target alias or undefined if the target alias does not exist
     */
    async getTargetAliasKeyId(): Promise<string | undefined> {
        try {
            console.log(`[KMSProvider] Looking for alias: ${this.keyAlias}`);

            // Handle pagination to get all aliases
            let allAliases: any[] = [];
            let nextToken: string | undefined;

            do {
                const response = await this.kmsClient.send(
                    new ListAliasesCommand({
                        Marker: nextToken
                    })
                );

                if (response.Aliases) {
                    allAliases.push(...response.Aliases);
                }
                nextToken = response.NextMarker;
            } while (nextToken);

            console.log(`[KMSProvider] Found ${allAliases.length} total aliases (with pagination)`);

            // Log alias names for debugging (truncated for readability)
            const aliasNames = allAliases.map((a) => a.AliasName).filter(Boolean);
            if (aliasNames.length > 0) {
                const displayNames = aliasNames.length > 10 ? `${aliasNames.slice(0, 10).join(', ')}, ... and ${aliasNames.length - 10} more` : aliasNames.join(', ');
                console.log(`[KMSProvider] Available aliases: ${displayNames}`);
            }

            const targetAlias = allAliases.find((alias) => alias.AliasName === this.keyAlias);

            if (targetAlias && targetAlias.TargetKeyId) {
                console.log(`[KMSProvider] Found target alias with key ID: ${targetAlias.TargetKeyId}`);
                return targetAlias.TargetKeyId;
            } else {
                console.log(`[KMSProvider] Target alias not found: ${this.keyAlias}`);
                return undefined;
            }
        } catch (error) {
            console.warn('[KMSProvider] Error checking KMS key:', error);
            throw error;
        }
    }

    /**
     * Get the KMS key ID for the target alias with retry logic for eventual consistency
     * @param maxRetries Maximum number of retries (default: 5)
     * @param retryDelayMs Delay between retries in milliseconds (default: 1000)
     * @returns The KMS key ID for the target alias or undefined if not found after all retries
     */
    async getTargetAliasKeyIdWithRetry(maxRetries: number = 5, retryDelayMs: number = 1000): Promise<string | undefined> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`[KMSProvider] Attempting to find alias (attempt ${attempt}/${maxRetries})`);

            const keyId = await this.getTargetAliasKeyId();
            if (keyId) {
                return keyId;
            }

            if (attempt < maxRetries) {
                console.log(`[KMSProvider] Alias not found, waiting ${retryDelayMs}ms before retry...`);
                await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            }
        }

        console.log(`[KMSProvider] Alias not found after ${maxRetries} attempts`);
        return undefined;
    }

    /**
     * Get the KMS key ARN for the target alias
     * @returns The KMS key ARN for the target alias or undefined if the target alias does not exist
     */
    async getTargetAliasKeyArn(keyId?: string): Promise<string | undefined> {
        keyId = keyId || (await this.getTargetAliasKeyId());
        if (!keyId) {
            return undefined;
        }
        try {
            const keyDetails = await this.kmsClient.send(new DescribeKeyCommand({ KeyId: keyId }));
            return keyDetails.KeyMetadata?.Arn;
        } catch (error) {
            console.warn('[KMSProvider] Error getting KMS key ARN:', error);
            throw error;
        }
    }

    /**
     * Test KMS connectivity by describing the key
     * @returns True if KMS is accessible, throws error otherwise
     */
    async testConnection(): Promise<boolean> {
        try {
            // Try to generate a small data key to test connectivity
            await this.generateDataKey();
            return true;
        } catch (error) {
            throw new Error(`KMS connection test failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
