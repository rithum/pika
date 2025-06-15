import inquirer from 'inquirer';
import { configManager } from '../utils/config-manager.js';
import { gitManager } from '../utils/git-manager.js';
import { fileManager } from '../utils/file-manager.js';
import { logger } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import semver from 'semver';

const execAsync = promisify(exec);

interface SyncOptions {
    version?: string;
    dryRun?: boolean;
    force?: boolean;
}

interface SyncResult {
    success: boolean;
    version: string;
    changedFiles: string[];
    conflicts: string[];
    warnings: string[];
}

export async function syncCommand(options: SyncOptions = {}): Promise<void> {
    try {
        logger.header('🔄 Pika Framework Sync');

        // Verify this is a Pika project
        if (!(await configManager.isPikaProject())) {
            logger.error('This is not a Pika project. Run this command from a Pika project directory.');
            return;
        }

        // Load current configuration
        const config = await configManager.loadConfig();
        const syncConfig = await configManager.loadSyncConfig();

        if (!config || !syncConfig) {
            logger.error('Failed to load project configuration. Please check your pika.config.json and .pika-sync.json files.');
            return;
        }

        // Get target version
        const targetVersion = options.version || (await getLatestFrameworkVersion());

        if (!targetVersion) {
            logger.error('Could not determine target version to sync to.');
            return;
        }

        // Check if already up to date
        if (semver.gte(syncConfig.version, targetVersion)) {
            logger.success(`Project is already up to date (v${syncConfig.version})`);
            return;
        }

        // Show sync plan
        await showSyncPlan(syncConfig.version, targetVersion, config);

        // Confirm sync unless dry run or force
        if (!options.dryRun && !options.force) {
            const { confirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: `Sync from v${syncConfig.version} to v${targetVersion}?`,
                    default: false
                }
            ]);

            if (!confirm) {
                logger.info('Sync cancelled.');
                return;
            }
        }

        // Perform the sync
        const result = await performSync(targetVersion, options, config, syncConfig);

        // Show results
        showSyncResults(result, options.dryRun || false);
    } catch (error) {
        logger.error('Sync failed:', error);
        process.exit(1);
    }
}

async function getLatestFrameworkVersion(): Promise<string | null> {
    try {
        // In a real implementation, this would fetch from the Pika framework repository
        // For now, return a mock version
        logger.debug('Fetching latest framework version...');

        // Simulate API call to get latest version
        await new Promise((resolve) => setTimeout(resolve, 1000));

        return '1.1.0'; // Mock latest version
    } catch (error) {
        logger.error('Failed to fetch latest framework version:', error);
        return null;
    }
}

async function showSyncPlan(currentVersion: string, targetVersion: string, config: any): Promise<void> {
    logger.info(`Sync Plan:`);
    logger.table({
        'Current Version': currentVersion,
        'Target Version': targetVersion,
        Project: config.projectName,
        'Auth Provider': config.auth.provider,
        'Service Organization': config.services.organization
    });

    logger.newLine();
    logger.info('Protected paths (will not be modified):');
    const syncConfig = await configManager.loadSyncConfig();
    if (syncConfig) {
        syncConfig.protectedPaths.forEach((path) => {
            console.log(`  • ${path}`);
        });
    }
}

async function performSync(targetVersion: string, options: SyncOptions, config: any, syncConfig: any): Promise<SyncResult> {
    const result: SyncResult = {
        success: false,
        version: targetVersion,
        changedFiles: [],
        conflicts: [],
        warnings: []
    };

    const spinner = logger.startSpinner('Preparing sync...');

    try {
        // Check for uncommitted changes
        if (!options.force && (await gitManager.hasUncommittedChanges())) {
            result.warnings.push('Uncommitted changes detected. Consider committing before sync.');

            if (!options.dryRun) {
                const { proceed } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'proceed',
                        message: 'Continue with uncommitted changes?',
                        default: false
                    }
                ]);

                if (!proceed) {
                    throw new Error('Sync cancelled due to uncommitted changes.');
                }
            }
        }

        // Create sync branch
        const syncBranch = `pika-sync-${targetVersion}-${Date.now()}`;

        if (!options.dryRun) {
            logger.updateSpinner('Creating sync branch...');
            await gitManager.createBranch(syncBranch);
        }

        // Download framework updates
        logger.updateSpinner('Downloading framework updates...');
        const frameworkPath = await downloadFrameworkVersion(targetVersion);

        // Identify files to update
        logger.updateSpinner('Analyzing changes...');
        const filesToUpdate = await identifyFrameworkFiles(frameworkPath, syncConfig.protectedPaths);

        result.changedFiles = filesToUpdate;

        // Apply updates
        if (!options.dryRun) {
            logger.updateSpinner('Applying updates...');
            await applyFrameworkUpdates(frameworkPath, filesToUpdate, syncConfig.protectedPaths);
        }

        // Check for conflicts with custom code
        logger.updateSpinner('Checking for conflicts...');
        const conflicts = await checkForConflicts(syncConfig.customPaths);
        result.conflicts = conflicts;

        if (conflicts.length > 0 && !options.force) {
            throw new Error(`Conflicts detected in custom code: ${conflicts.join(', ')}`);
        }

        // Update configuration
        if (!options.dryRun) {
            logger.updateSpinner('Updating configuration...');
            await updateSyncConfiguration(targetVersion, result.changedFiles);

            // Commit changes
            await gitManager.addAll();
            await gitManager.commit(`Sync to Pika Framework v${targetVersion}`);
        }

        logger.stopSpinner(true, `Sync ${options.dryRun ? 'plan' : 'completed'} successfully`);
        result.success = true;
    } catch (error) {
        logger.stopSpinner(false, 'Sync failed');
        throw error;
    }

    return result;
}

async function downloadFrameworkVersion(version: string): Promise<string> {
    // In a real implementation, this would download the specific version
    // from the Pika framework repository (GitHub releases, npm, etc.)

    const tempDir = path.join(process.cwd(), '.pika-temp', version);
    await fileManager.ensureDir(tempDir);

    logger.debug(`Mock download of framework v${version} to ${tempDir}`);

    // For now, return the current framework path as a mock
    return path.resolve(__dirname, '../../../..');
}

async function identifyFrameworkFiles(frameworkPath: string, protectedPaths: string[]): Promise<string[]> {
    const allFiles = await fileManager.findFiles('**/*', frameworkPath);

    // Filter out protected paths and non-framework files
    const frameworkFiles = allFiles.filter((file) => {
        // Skip protected paths
        if (protectedPaths.some((protectedPath) => file.includes(protectedPath))) {
            return false;
        }

        // Skip common non-framework directories
        if (file.includes('node_modules') || file.includes('.git') || file.includes('dist') || file.includes('.turbo')) {
            return false;
        }

        return true;
    });

    return frameworkFiles;
}

async function applyFrameworkUpdates(frameworkPath: string, filesToUpdate: string[], protectedPaths: string[]): Promise<void> {
    for (const file of filesToUpdate) {
        const sourcePath = path.join(frameworkPath, file);
        const destPath = path.resolve(file);

        // Double-check that we're not overwriting protected files
        if (protectedPaths.some((protectedPath) => file.includes(protectedPath))) {
            logger.warn(`Skipping protected file: ${file}`);
            continue;
        }

        if (await fileManager.exists(sourcePath)) {
            await fileManager.copyFile(sourcePath, destPath);
            logger.debug(`Updated: ${file}`);
        }
    }
}

async function checkForConflicts(customPaths: string[]): Promise<string[]> {
    const conflicts: string[] = [];

    for (const customPath of customPaths) {
        if (await fileManager.exists(customPath)) {
            // Check if custom path has been modified
            try {
                const status = await gitManager.getStatus();
                if (status.includes(customPath)) {
                    conflicts.push(customPath);
                }
            } catch (error) {
                logger.debug(`Could not check git status for ${customPath}:`, error);
            }
        }
    }

    return conflicts;
}

async function updateSyncConfiguration(version: string, changedFiles: string[]): Promise<void> {
    const syncConfig = await configManager.loadSyncConfig();

    if (syncConfig) {
        // Update sync configuration
        syncConfig.version = version;
        syncConfig.lastSync = new Date().toISOString();
        syncConfig.syncHistory.push({
            version,
            timestamp: new Date().toISOString(),
            changes: changedFiles
        });

        // Keep only last 10 sync history entries
        if (syncConfig.syncHistory.length > 10) {
            syncConfig.syncHistory = syncConfig.syncHistory.slice(-10);
        }

        await configManager.saveSyncConfig(syncConfig);
    }

    // Also update main config framework version
    const config = await configManager.loadConfig();
    if (config) {
        config.framework.version = version;
        config.framework.lastSync = new Date().toISOString();
        await configManager.saveConfig(config);
    }
}

function showSyncResults(result: SyncResult, isDryRun: boolean): void {
    logger.newLine();

    if (result.success) {
        logger.success(`Sync ${isDryRun ? 'plan' : 'completed'} successfully!`);
    } else {
        logger.error('Sync failed');
    }

    logger.newLine();
    logger.info('Summary:');
    logger.table({
        'Target Version': result.version,
        'Files Changed': result.changedFiles.length,
        Conflicts: result.conflicts.length,
        Warnings: result.warnings.length
    });

    if (result.changedFiles.length > 0) {
        logger.info('Changed files:');
        result.changedFiles.slice(0, 10).forEach((file) => {
            console.log(`  • ${file}`);
        });

        if (result.changedFiles.length > 10) {
            console.log(`  • ... and ${result.changedFiles.length - 10} more files`);
        }
    }

    if (result.conflicts.length > 0) {
        logger.warn('Conflicts detected:');
        result.conflicts.forEach((conflict) => {
            console.log(`  ⚠ ${conflict}`);
        });
    }

    if (result.warnings.length > 0) {
        logger.warn('Warnings:');
        result.warnings.forEach((warning) => {
            console.log(`  ⚠ ${warning}`);
        });
    }

    if (!isDryRun && result.success) {
        logger.newLine();
        logger.info('Next steps:');
        console.log('  • Test your application: pnpm dev');
        console.log('  • Check custom components still work');
        console.log('  • Review authentication configuration');
        console.log('  • Update deployment if needed');
    }
}
