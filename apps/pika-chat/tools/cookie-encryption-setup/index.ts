#!/usr/bin/env tsx

/**
 * Due to typescript weirdness, we need to copy the pika-config.ts file to the apps/pika-chat/tools/cookie-encryption-setup/build
 * directory so that it can be imported by the cookie-encryption-setup tool.  To make life easier, use the script in the
 * package.json to copy the pika-config.ts file to the apps/pika-chat/tools/cookie-encryption-setup/build directory.
 *
 * Run
 * `pnpm run encryption:setup -- status` to check the status of the cookie encryption infrastructure.
 * `pnpm run encryption:setup -- setup` to setup the cookie encryption infrastructure.
 */

import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import chalk from 'chalk';
import { Command } from 'commander';
import { pikaConfig } from './build/pika-config.js';
import { InfrastructureManager } from '../../src/lib/server/encryption/InfrastructureManager';
import { generateKmsKeyAliasName, generateSsmParamPrefix } from '../../src/lib/server/encryption/kms-utils';
import { rotateKeys } from '../../src/lib/server/encryption/KeyRotationUtils';
import { KMSProvider } from '../../src/lib/server/encryption/KMSProvider';
import { SSMKeyProvider } from '../../src/lib/server/encryption/SSMKeyProvider';
import type { InfrastructureConfig } from '../../src/lib/server/encryption/types';

function printHeader(title: string): void {
    console.log('\n' + '='.repeat(60));
    console.log(chalk.bold.cyan(`${title}`));
    console.log('='.repeat(60));
}

function printError(message: string): void {
    console.error(chalk.red(`ERROR: ${message}`));
}

function printSuccess(message: string): void {
    console.log(chalk.green(`${message}`));
}

function printWarning(message: string): void {
    console.log(chalk.yellow(`${message}`));
}

function printInfo(message: string): void {
    console.log(chalk.blue(`${message}`));
}

async function getConfig(): Promise<InfrastructureConfig> {
    const stage = process.env.STAGE || 'test';
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const projNameKebabCase = pikaConfig.pikaChat.projNameKebabCase;
    const stsClient = new STSClient({ region });
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    const accountId = identity.Account ?? '';

    return {
        region,
        stage,
        awsAccountId: accountId,
        projNameKebabCase,
        ssmParameterPrefix: generateSsmParamPrefix(projNameKebabCase, stage),
        kmsKeyAlias: generateKmsKeyAliasName(projNameKebabCase, stage),
        maxKeyVersions: 3
    };
}

async function showStatus(manager: InfrastructureManager): Promise<void> {
    printHeader('Cookie Encryption Infrastructure Status');
    const report = await manager.getStatusReport();
    console.log(report);
}

async function showStatusWithRetry(manager: InfrastructureManager): Promise<void> {
    printHeader('Cookie Encryption Infrastructure Status');
    const report = await manager.getStatusReport(true); // Use retry logic
    console.log(report);
}

async function showStatusWithRetryAndExpectedValues(
    manager: InfrastructureManager,
    expectedCurrentVersion?: number,
    expectedActiveVersions?: number[],
    minLastRotationTime?: Date
): Promise<void> {
    printHeader('Cookie Encryption Infrastructure Status');
    const report = await manager.getStatusReport(
        true, // Use retry logic
        expectedCurrentVersion,
        expectedActiveVersions,
        minLastRotationTime
    );
    console.log(report);
}

async function setupInfrastructure(manager: InfrastructureManager): Promise<void> {
    printHeader('Setting Up Cookie Encryption Infrastructure');

    try {
        printInfo('Checking current status...');
        const status = await manager.checkStatus();

        if (status.kmsKeyExists && status.isInitialized) {
            printWarning('Infrastructure already exists and is initialized!');
            printInfo('Use --status to check details or --force to recreate');
            return;
        }

        printInfo('Creating infrastructure...');
        await manager.createInfrastructure();

        printSuccess('Infrastructure setup complete!');

        // Show final status with retry logic to handle AWS eventual consistency
        console.log('\n');
        await showStatusWithRetry(manager);
    } catch (error) {
        printError(`Failed to setup infrastructure: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}

async function forceRotateKeys(config: InfrastructureConfig): Promise<void> {
    printHeader('Force Rotating Cookie Encryption Keys');

    try {
        printInfo('Checking infrastructure status...');
        const kmsProvider = new KMSProvider(config.kmsKeyAlias, config.region);
        const ssmProvider = new SSMKeyProvider(config.ssmParameterPrefix, config.region, config.kmsKeyAlias);
        const manager = new InfrastructureManager(config, kmsProvider, ssmProvider);

        const status = await manager.checkStatus();

        if (!status.kmsKeyExists) {
            printError('KMS key does not exist! Run setup command first.');
            process.exit(1);
        }

        if (!status.isInitialized) {
            printError('Infrastructure is not initialized! Run setup command first.');
            process.exit(1);
        }

        printInfo('Starting forced key rotation...');
        const rotationStartTime = new Date();
        const result = await rotateKeys(
            ssmProvider,
            kmsProvider,
            config.maxKeyVersions,
            true, // forceRotation = true
            'cli-force-rotation'
        );

        if (result.newVersion) {
            printSuccess(`Key rotation completed successfully!`);
            printInfo(`Previous version: ${result.oldVersion}`);
            printInfo(`New version: ${result.newVersion}`);
            printInfo(`Active versions: [${result.activeVersions.join(', ')}]`);
        } else {
            printInfo(`No rotation performed. Current version: ${result.oldVersion}`);
            printInfo(`Active versions: [${result.activeVersions.join(', ')}]`);
        }

        // Show final status with expected values to wait for eventual consistency
        console.log('\n');
        await showStatusWithRetryAndExpectedValues(
            manager,
            result.newVersion,
            result.activeVersions,
            rotationStartTime // Use rotation start time as minimum rotation time
        );
    } catch (error) {
        printError(`Failed to rotate keys: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}

// We are intentionally leaving this commented out but here in case it is needed.
// async function cleanupInfrastructure(manager: InfrastructureManager, force: boolean): Promise<void> {
//     printHeader('Cleaning Up Cookie Encryption Infrastructure');

//     try {
//         printWarning('This will delete all cookie encryption infrastructure!');
//         printWarning('This action cannot be undone.');

//         const status = await manager.checkStatus();
//         if (!status.kmsKeyExists && !status.ssmParametersExist) {
//             printInfo('No infrastructure found to clean up.');
//             return;
//         }

//         if (!force) {
//             printError('Use --force flag to confirm infrastructure deletion');
//             process.exit(1);
//         }

//         printInfo('Deleting infrastructure...');
//         await manager.deleteInfrastructure();

//         printSuccess('Infrastructure cleanup complete!');
//     } catch (error) {
//         printError(`Failed to cleanup infrastructure: ${error instanceof Error ? error.message : String(error)}`);
//         process.exit(1);
//     }
// }

function printBanner(): void {
    console.log(
        chalk.cyan(`
╔═══════════════════════════════════════╗
║                                       ║
║       Cookie Encryption Setup         ║
║   Manage encryption infrastructure    ║
║                                       ║
╚═══════════════════════════════════════╝
`)
    );
}

async function printConfig(): Promise<void> {
    const config = await getConfig();
    printInfo(`Configuration:`);
    printInfo(`  Region: ${config.region}`);
    printInfo(`  Account: ${config.awsAccountId}`);
    printInfo(`  Stage: ${config.stage}`);
    printInfo(`  Project: ${config.projNameKebabCase}`);
    printInfo(`  SSM Prefix: ${config.ssmParameterPrefix}`);
    printInfo(`  KMS Alias: ${config.kmsKeyAlias}`);
}

async function handleError(error: unknown): Promise<void> {
    printError(`Tool failed: ${error instanceof Error ? error.message : String(error)}`);

    if (error instanceof Error && error.message.includes('credentials')) {
        console.log('\n' + chalk.yellow('TIP: Make sure your AWS credentials are configured:'));
        console.log('  • Run: aws configure');
        console.log('  • Or set AWS_PROFILE environment variable');
        console.log('  • Or use AWS IAM roles if running in AWS');
    }

    process.exit(1);
}

const program = new Command();

program.name('encryption-setup').description('Cookie encryption infrastructure management tool').version('1.0.0');

program
    .command('status')
    .description('Show current infrastructure status')
    .action(async () => {
        try {
            await printConfig();
            const config = await getConfig();
            const kmsProvider = new KMSProvider(generateKmsKeyAliasName(pikaConfig.pikaChat.projNameKebabCase, config.stage), config.region);
            const ssmProvider = new SSMKeyProvider(generateSsmParamPrefix(pikaConfig.pikaChat.projNameKebabCase, config.stage), config.region, config.kmsKeyAlias);
            const manager = new InfrastructureManager(config, kmsProvider, ssmProvider);
            await showStatus(manager);
        } catch (error) {
            await handleError(error);
        }
    });

program
    .command('setup')
    .description("Create infrastructure if it doesn't exist")
    .action(async () => {
        try {
            await printConfig();
            const config = await getConfig();
            const kmsProvider = new KMSProvider(generateKmsKeyAliasName(pikaConfig.pikaChat.projNameKebabCase, config.stage), config.region);
            const ssmProvider = new SSMKeyProvider(generateSsmParamPrefix(pikaConfig.pikaChat.projNameKebabCase, config.stage), config.region, config.kmsKeyAlias);
            const manager = new InfrastructureManager(config, kmsProvider, ssmProvider);
            await setupInfrastructure(manager);
        } catch (error) {
            await handleError(error);
        }
    });

program
    .command('rotate')
    .description('Force rotation of cookie encryption keys')
    .action(async () => {
        try {
            await printConfig();
            const config = await getConfig();
            await forceRotateKeys(config);
        } catch (error) {
            await handleError(error);
        }
    });

// We are intentionally leaving this commented out but here in case it is needed.
// program
//     .command('cleanup')
//     .description('Delete all infrastructure (destructive!)')
//     .option('--force', 'Force deletion without confirmation')
//     .action(async (options) => {
//         try {
//             printConfig();
//             const config = await getConfig();
//             const kmsProvider = new KMSProvider(generateKmsKeyAliasName(pikaConfig.pikaChat.projNameKebabCase, config.stage), config.region);
//             const ssmProvider = new SSMKeyProvider(generateSsmParamPrefix(pikaConfig.pikaChat.projNameKebabCase, config.stage), config.region, config.kmsKeyAlias);
//             const manager = new InfrastructureManager(config, kmsProvider, ssmProvider);
//             await cleanupInfrastructure(manager, options.force);
//         } catch (error) {
//             await handleError(error);
//         }
//     });

// Global error handler
program.exitOverride((err) => {
    if (err.code === 'commander.version') {
        process.exit(0);
    }
    if (err.code === 'commander.help') {
        process.exit(0);
    }
    printError(`Command failed: ${err.message}`);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    printError(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    printError(`Uncaught Exception: ${error.message}`);
    process.exit(1);
});

// Show banner and parse commands
printBanner();
program.parse();
