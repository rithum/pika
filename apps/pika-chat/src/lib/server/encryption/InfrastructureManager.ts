import { CreateAliasCommand, CreateKeyCommand, DeleteAliasCommand, KeySpec, KeyUsageType, ScheduleKeyDeletionCommand } from '@aws-sdk/client-kms';
import { KMSProvider } from './KMSProvider';
import { SSMKeyProvider } from './SSMKeyProvider';
import type { InfrastructureConfig, InfrastructureStatus } from './types';

/**
 * Manages the infrastructure for cookie encryption keys.
 * Can create KMS keys, SSM parameters, and handle lifecycle management.
 * Used by both the CloudFormation custom resource in CDK and the manual setup tool
 * so you can run locally without having to deploy the front end stack.
 */
export class InfrastructureManager {
    private config: InfrastructureConfig;
    private kmsProvider: KMSProvider;
    private ssmProvider: SSMKeyProvider;

    constructor(config: InfrastructureConfig, kmsProvider: KMSProvider, ssmProvider: SSMKeyProvider) {
        this.kmsProvider = kmsProvider;
        this.ssmProvider = ssmProvider;
        this.config = config;
    }

    /**
     * Check the current status of the infrastructure
     */
    async checkStatus(): Promise<InfrastructureStatus> {
        console.log('[InfrastructureManager] Checking infrastructure status...');

        const status: InfrastructureStatus = {
            kmsKeyExists: false,
            ssmParametersExist: false,
            parametersChecked: [],
            isInitialized: false
        };

        // Check KMS key exists
        try {
            const keyId = await this.kmsProvider.getTargetAliasKeyId();
            const keyArn = keyId ? await this.kmsProvider.getTargetAliasKeyArn(keyId) : undefined;

            if (keyId && keyArn) {
                status.kmsKeyExists = true;
                status.kmsKeyId = keyId;
                status.kmsKeyArn = keyArn;

                console.log(`[InfrastructureManager] KMS key found: ${status.kmsKeyId}`);
            }
        } catch (error) {
            console.warn('[InfrastructureManager] Error checking KMS key:', error);
            throw error;
        }

        try {
            const params = await this.ssmProvider.getAllKeyParameters();

            if (params && params.currentVersion !== undefined && params.activeVersions !== undefined && params.lastRotationTime !== undefined) {
                status.ssmParametersExist = true;
                status.currentVersion = params.currentVersion;
                status.activeVersions = params.activeVersions;
                status.lastRotationTime = params.lastRotationTime;
                status.isInitialized = true;
            }
        } catch (error) {
            console.warn('[InfrastructureManager] Error checking SSM parameters:', error);
            throw error;
        }

        console.log('[InfrastructureManager] Status check complete:', status);
        return status;
    }

    /**
     * Create all required infrastructure
     */
    async createInfrastructure(): Promise<void> {
        console.log('[InfrastructureManager] Creating infrastructure...');

        const status = await this.checkStatus();

        if (!status.kmsKeyExists) {
            await this.createKMSKey();
        } else {
            console.log('[InfrastructureManager] KMS key already exists, skipping creation');
        }

        if (!status.isInitialized) {
            await this.initializeKeys();
        } else {
            console.log('[InfrastructureManager] Keys already initialized, skipping initialization');
        }

        console.log('[InfrastructureManager] Infrastructure creation complete');
    }

    /**
     * Check status with retry logic for cases where we just created infrastructure
     * and need to account for AWS eventual consistency
     * @param expectedCurrentVersion Optional expected current version to wait for
     * @param expectedActiveVersions Optional expected active versions to wait for
     * @param minLastRotationTime Optional minimum last rotation time to wait for
     */
    async checkStatusWithRetry(expectedCurrentVersion?: number, expectedActiveVersions?: number[], minLastRotationTime?: Date): Promise<InfrastructureStatus> {
        console.log('[InfrastructureManager] Checking infrastructure status with retry logic...');

        const status: InfrastructureStatus = {
            kmsKeyExists: false,
            ssmParametersExist: false,
            parametersChecked: [],
            isInitialized: false
        };

        // Check KMS key exists with retry for eventual consistency
        try {
            const keyId = await this.kmsProvider.getTargetAliasKeyIdWithRetry();
            const keyArn = keyId ? await this.kmsProvider.getTargetAliasKeyArn(keyId) : undefined;

            if (keyId && keyArn) {
                status.kmsKeyExists = true;
                status.kmsKeyId = keyId;
                status.kmsKeyArn = keyArn;

                console.log(`[InfrastructureManager] KMS key found: ${status.kmsKeyId}`);
            }
        } catch (error) {
            console.warn('[InfrastructureManager] Error checking KMS key:', error);
            throw error;
        }

        // Check SSM parameters with retry for eventual consistency
        try {
            const params = await this.ssmProvider.getAllKeyParametersAndWaitForEventualConsistency(expectedCurrentVersion, expectedActiveVersions, minLastRotationTime);

            if (params && params.currentVersion !== undefined && params.activeVersions !== undefined && params.lastRotationTime !== undefined) {
                status.ssmParametersExist = true;
                status.currentVersion = params.currentVersion;
                status.activeVersions = params.activeVersions;
                status.lastRotationTime = params.lastRotationTime;
                status.isInitialized = true;
            }
        } catch (error) {
            console.warn('[InfrastructureManager] Error checking SSM parameters:', error);
            throw error;
        }

        console.log('[InfrastructureManager] Status check complete:', status);
        return status;
    }

    /**
     * Create KMS key and alias with proper policies.  This is here and NOT in the KMSProvider because
     * lots of things use the KMSProvider and need permissions to interact with KMS but only this
     * Infra Manager needs to create the KMS key and alias with proper policies.
     */
    private async createKMSKey(): Promise<string> {
        console.log('[InfrastructureManager] Creating KMS key...');

        // Get current AWS account ID for policy

        // Only use component tags from environment variables - don't invent our own tag names
        // If no component tags are configured, create the key with no tags
        const commandParams: any = {
            Description: `Cookie encryption key for ${this.config.projNameKebabCase} ${this.config.stage}`,
            KeyUsage: KeyUsageType.ENCRYPT_DECRYPT,
            KeySpec: KeySpec.SYMMETRIC_DEFAULT,
            Policy: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    {
                        Sid: 'Enable Root Access',
                        Effect: 'Allow',
                        Principal: {
                            AWS: `arn:aws:iam::${this.config.awsAccountId}:root`
                        },
                        Action: 'kms:*',
                        Resource: '*'
                    },
                    {
                        Sid: 'Allow Pika Services',
                        Effect: 'Allow',
                        Principal: {
                            AWS: '*'
                        },
                        Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
                        Resource: '*',
                        Condition: {
                            StringEquals: {
                                'aws:PrincipalTag/Project': this.config.projNameKebabCase,
                                'aws:PrincipalTag/Stage': this.config.stage
                            }
                        }
                    }
                ]
            })
        };

        // Only add tags if component tags are configured
        if (this.config.componentTags && this.config.componentTags.length > 0) {
            commandParams.Tags = this.config.componentTags;
            console.log('[InfrastructureManager] Adding component tags to KMS key:', this.config.componentTags);
        } else {
            console.log('[InfrastructureManager] No component tags configured, creating KMS key without tags');
        }

        // Create the KMS key
        // Note: Tag errors during KMS key creation will fail the entire operation.
        // This is acceptable because it happens at CDK deployment time, not runtime,
        // and the user will get immediate feedback to fix their tag configuration.
        const keyResult = await this.kmsProvider.getKMSClient().send(new CreateKeyCommand(commandParams));

        if (!keyResult.KeyMetadata?.KeyId) {
            throw new Error('Failed to create KMS key');
        }

        const keyId = keyResult.KeyMetadata.KeyId;
        console.log(`[InfrastructureManager] KMS key created: ${keyId}`);

        // Create alias - handle case where stale alias exists
        try {
            await this.kmsProvider.getKMSClient().send(
                new CreateAliasCommand({
                    AliasName: this.config.kmsKeyAlias,
                    TargetKeyId: keyId
                })
            );
            console.log(`[InfrastructureManager] KMS alias created: ${this.config.kmsKeyAlias}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (errorMessage.includes('already exists')) {
                console.log(`[InfrastructureManager] Alias already exists, attempting to delete and recreate...`);

                try {
                    // Delete the stale alias
                    await this.kmsProvider.getKMSClient().send(
                        new DeleteAliasCommand({
                            AliasName: this.config.kmsKeyAlias
                        })
                    );
                    console.log(`[InfrastructureManager] Deleted stale alias: ${this.config.kmsKeyAlias}`);

                    // Retry creating the alias
                    await this.kmsProvider.getKMSClient().send(
                        new CreateAliasCommand({
                            AliasName: this.config.kmsKeyAlias,
                            TargetKeyId: keyId
                        })
                    );
                    console.log(`[InfrastructureManager] KMS alias created after cleanup: ${this.config.kmsKeyAlias}`);
                } catch (cleanupError) {
                    console.error(`[InfrastructureManager] Failed to cleanup and recreate alias:`, cleanupError);
                    throw cleanupError;
                }
            } else {
                throw error;
            }
        }

        return keyId;
    }

    /**
     * Initialize encryption keys using the key rotation logic
     */
    private async initializeKeys(): Promise<void> {
        console.log('[InfrastructureManager] Initializing encryption keys...');

        // Generate initial data key
        const { plaintextKey, encryptedKey } = await this.kmsProvider.generateDataKey();

        const initialVersion = 1;

        // Store encrypted key
        await this.ssmProvider.storeEncryptedDEK(initialVersion, encryptedKey);

        // Update version tracking
        await this.ssmProvider.updateCurrentVersion(initialVersion);
        await this.ssmProvider.updateActiveVersions([initialVersion]);
        await this.ssmProvider.updateLastRotationTime(new Date());

        console.log(`[InfrastructureManager] Keys initialized with version ${initialVersion}`);
    }

    /**
     * Delete all infrastructure (for cleanup).
     *
     * THe kms operations are not being put in the KMSProvider because we only want to use it for
     * reading the data keys and not for creating or deleting the key.
     */
    async deleteInfrastructure(): Promise<void> {
        console.log('[InfrastructureManager] Deleting infrastructure...');

        // Delete SSM parameters
        try {
            await this.ssmProvider.delteAllKeyParameters();
        } catch (error) {
            console.warn('[InfrastructureManager] Error deleting SSM parameters:', error);
        }

        // Delete KMS alias and schedule key deletion
        try {
            await this.kmsProvider.getKMSClient().send(
                new DeleteAliasCommand({
                    AliasName: this.config.kmsKeyAlias
                })
            );
            console.log(`[InfrastructureManager] Deleted KMS alias: ${this.config.kmsKeyAlias}`);

            // Get key ID before scheduling deletion
            const status = await this.checkStatus();
            if (status.kmsKeyId) {
                await this.kmsProvider.getKMSClient().send(
                    new ScheduleKeyDeletionCommand({
                        KeyId: status.kmsKeyId,
                        PendingWindowInDays: 7 // Minimum allowed
                    })
                );
                console.log(`[InfrastructureManager] Scheduled KMS key deletion: ${status.kmsKeyId}`);
            }
        } catch (error) {
            console.warn('[InfrastructureManager] Error deleting KMS resources:', error);
        }

        console.log('[InfrastructureManager] Infrastructure deletion complete');
    }

    /**
     * Get a user-friendly status report
     * @param useRetry Whether to use retry logic for checking KMS key status (for eventual consistency)
     * @param expectedCurrentVersion Optional expected current version to wait for
     * @param expectedActiveVersions Optional expected active versions to wait for
     * @param minLastRotationTime Optional minimum last rotation time to wait for
     */
    async getStatusReport(useRetry: boolean = false, expectedCurrentVersion?: number, expectedActiveVersions?: number[], minLastRotationTime?: Date): Promise<string> {
        const status = useRetry ? await this.checkStatusWithRetry(expectedCurrentVersion, expectedActiveVersions, minLastRotationTime) : await this.checkStatus();
        let report: string[] = [
            `Cookie Encryption Infrastructure Status`,
            `=====================================`,
            `Region: ${this.config.region}`,
            `Stage: ${this.config.stage}`,
            `Project: ${this.config.projNameKebabCase}`,
            `KMS Key: ${status.kmsKeyExists ? 'EXISTS' : 'MISSING'}`,
            `SSM Parameters: ${status.ssmParametersExist ? 'EXISTS' : 'MISSING'}`,
            `Initialization: ${status.isInitialized ? 'COMPLETE' : 'NEEDED'}`,
            `Overall Status: ${status.kmsKeyExists && status.isInitialized ? 'READY' : 'SETUP REQUIRED'}`
        ];

        if (status.kmsKeyExists) {
            report.push(`   Key ID: ${status.kmsKeyId}`);
            report.push(`   Alias: ${this.config.kmsKeyAlias}`);
        }

        if (status.ssmParametersExist) {
            report.push(`   Parameter Prefix: ${this.config.ssmParameterPrefix}`);
        }

        if (status.isInitialized) {
            report.push(`   Current Version: ${status.currentVersion}`);
            report.push(`   Active Versions: [${status.activeVersions?.join(', ')}]`);
            report.push(`   Last Rotation Time: ${status.lastRotationTime?.toISOString()}`);
        }

        report.push(`Overall Status: ${status.kmsKeyExists && status.isInitialized ? 'READY' : 'SETUP REQUIRED'}`);
        report.push('');

        report.push(`\nSSM Parameters: ${status.ssmParametersExist ? 'EXISTS' : 'MISSING'}`);
        report.push(`   Parameter Prefix: ${this.config.ssmParameterPrefix}`);

        if (status.isInitialized) {
            report.push(`\nInitialization: COMPLETE`);
            report.push(`   Current Version: ${status.currentVersion}`);
            report.push(`   Active Versions: [${status.activeVersions?.join(', ')}]`);
        } else {
            report.push(`\nInitialization: NEEDED`);
        }

        report.push(`\nOverall Status: ${status.kmsKeyExists && status.isInitialized ? 'READY' : 'SETUP REQUIRED'}`);

        return report.join('\n');
    }
}
