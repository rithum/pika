import inquirer from 'inquirer';
import path from 'path';
import { fileManager } from '../utils/file-manager.js';
import { gitManager } from '../utils/git-manager.js';
import { logger } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ExecOptions } from 'child_process';

const execAsync = promisify(exec);

// GitHub repository URL - should match create-app.ts
const PIKA_REPO_URL = 'https://github.com/rithum/pika.git';

interface SyncOptions {
    version?: string;
    dryRun?: boolean;
}

interface SyncChange {
    type: 'modified' | 'added' | 'deleted';
    path: string;
    sourcePath: string;
    targetPath: string;
}

interface SyncConfig {
    pikaVersion: string;
    createdAt: string;
    lastSync: string;
    protectedAreas: string[];
    initialConfiguration?: any;
}

export async function syncCommand(options: SyncOptions = {}): Promise<void> {
    try {
        logger.header('🔄 Pika Framework - Sync Updates');

        // Ensure we're in a Pika project directory
        const syncConfigPath = path.join(process.cwd(), '.pika-sync.json');
        if (!(await fileManager.exists(syncConfigPath))) {
            logger.error('❌ Not in a Pika project directory (no .pika-sync.json found)');
            logger.info('Run this command from a directory created with `pika create-app`');
            return;
        }

        // Read sync configuration
        let syncConfig: SyncConfig;
        try {
            const syncConfigContent = await fileManager.readFile(syncConfigPath);
            syncConfig = JSON.parse(syncConfigContent);
        } catch (error) {
            logger.error('Failed to read .pika-sync.json configuration file');
            return;
        }

        // Determine target version
        const targetVersion = options.version || 'latest';

        if (options.dryRun) {
            logger.info('🔍 Dry run mode - showing what would be updated...');
            logger.newLine();
        }

        const spinner = logger.startSpinner('Preparing sync...');

        try {
            // Download latest Pika framework
            logger.updateSpinner(`Downloading Pika framework ${targetVersion}...`);
            const tempDir = await downloadPikaFramework(targetVersion);
            logger.stopSpinner(true, 'Framework downloaded');

            // Compare files and identify changes
            const analysisSpinner = logger.startSpinner('Analyzing changes...');
            const protectedAreas = syncConfig.protectedAreas || getDefaultProtectedAreas();
            const changes = await identifyChanges(tempDir, process.cwd(), protectedAreas);
            logger.stopSpinner(true, 'Analysis complete');

            if (changes.length === 0) {
                logger.success('✅ No updates available - your project is up to date!');
                await cleanupTempDir(tempDir);
                return;
            }

            // Show changes
            logger.info(`📋 Found ${changes.length} files to update:`);
            changes.forEach((change) => {
                console.log(`  ${getChangeIcon(change.type)} ${change.path}`);
            });
            logger.newLine();

            if (options.dryRun) {
                logger.info('🔍 Dry run complete - no changes applied');
                await cleanupTempDir(tempDir);
                return;
            }

            // Confirm sync
            const { proceed } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Apply these changes?',
                    default: true
                }
            ]);

            if (!proceed) {
                logger.info('Sync cancelled.');
                await cleanupTempDir(tempDir);
                return;
            }

            // Apply changes
            const applySpinner = logger.startSpinner('Applying changes...');
            await applyChanges(changes);
            logger.stopSpinner(true, 'Changes applied');

            // Update sync config
            const configSpinner = logger.startSpinner('Updating sync configuration...');
            await updateSyncConfig(syncConfigPath, syncConfig, targetVersion);
            logger.stopSpinner(true, 'Configuration updated');

            // Create git commit if in a git repository
            try {
                const gitSpinner = logger.startSpinner('Committing changes...');
                await gitManager.addAll(process.cwd());
                await gitManager.commit(`sync: Update Pika framework to ${targetVersion}`, process.cwd());
                logger.stopSpinner(true, 'Changes committed to git');
            } catch (error) {
                logger.warn('⚠️  Not in git repository or commit failed - you may need to commit manually');
            }

            // Cleanup
            await cleanupTempDir(tempDir);

            logger.success('✅ Sync complete!');
            showSyncSuccessMessage();
        } catch (error) {
            logger.stopSpinner(false, 'Sync failed');
            throw error;
        }
    } catch (error) {
        logger.error('Failed to sync Pika framework:', error);
        process.exit(1);
    }
}

async function downloadPikaFramework(version: string): Promise<string> {
    const tempDir = path.join(process.cwd(), '.pika-temp');

    // Remove existing temp directory
    if (await fileManager.exists(tempDir)) {
        await fileManager.removeDirectory(tempDir);
    }

    // Clone framework
    try {
        if (version === 'latest') {
            await execAsync(`git clone --depth 1 ${PIKA_REPO_URL} "${tempDir}"`);
        } else {
            await execAsync(`git clone --depth 1 --branch ${version} ${PIKA_REPO_URL} "${tempDir}"`);
        }
    } catch (e) {
        throw new Error(`Failed to download Pika framework: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    return tempDir;
}

async function identifyChanges(sourcePath: string, targetPath: string, protectedAreas: string[]): Promise<SyncChange[]> {
    const changes: SyncChange[] = [];

    // Compare framework files recursively
    await compareDirectories(sourcePath, targetPath, '', protectedAreas, changes);

    return changes;
}

async function compareDirectories(sourcePath: string, targetPath: string, relativePath: string, protectedAreas: string[], changes: SyncChange[]): Promise<void> {
    const sourceFullPath = path.join(sourcePath, relativePath);

    if (!(await fileManager.exists(sourceFullPath))) {
        return;
    }

    const { readdir } = await import('fs/promises');
    const sourceFiles = await readdir(sourceFullPath, { withFileTypes: true });

    for (const file of sourceFiles) {
        const fileName = file.name;
        const relativeFilePath = path.join(relativePath, fileName).replace(/\\/g, '/'); // Normalize path separators
        const sourceFilePath = path.join(sourcePath, relativeFilePath);
        const targetFilePath = path.join(targetPath, relativeFilePath);

        // Skip protected areas
        if (isProtectedArea(relativeFilePath, protectedAreas)) {
            continue;
        }

        // Check if this is a directory
        const isDirectory = file.isDirectory();

        // Skip directories we don't want to sync
        if (isDirectory && shouldSkipDirectory(fileName)) {
            continue;
        }

        // Skip optional sample directories if user removed them
        if (isDirectory && isOptionalSampleDirectory(relativeFilePath)) {
            const targetExists = await fileManager.exists(targetFilePath);
            if (!targetExists) {
                console.log(`  ⏭️  Skipping ${relativeFilePath} (user removed)`);
                console.log(`     To restore: mkdir -p ${relativeFilePath} && pika sync`);
                continue; // User deleted it, don't restore
            }
        }

        if (isDirectory) {
            await compareDirectories(sourcePath, targetPath, relativeFilePath, protectedAreas, changes);
        } else {
            // Compare file content
            const hasChanged = await fileHasChanged(sourceFilePath, targetFilePath);
            if (hasChanged) {
                const exists = await fileManager.exists(targetFilePath);
                changes.push({
                    type: exists ? 'modified' : 'added',
                    path: relativeFilePath,
                    sourcePath: sourceFilePath,
                    targetPath: targetFilePath
                });
            }
        }
    }
}

function isProtectedArea(filePath: string, protectedAreas: string[]): boolean {
    return protectedAreas.some((area) => {
        if (area.endsWith('/')) {
            return filePath.startsWith(area);
        }
        return filePath === area;
    });
}

function shouldSkipDirectory(dirName: string): boolean {
    return ['node_modules', '.git', '.turbo', 'dist', 'build', '.svelte-kit', 'cdk.out', 'packages', 'future-changes', '.pika-temp'].includes(dirName);
}

function isOptionalSampleDirectory(filePath: string): boolean {
    const optionalDirs = ['services/samples/weather', 'apps/samples/enterprise-site'];
    return optionalDirs.includes(filePath);
}

async function fileHasChanged(sourcePath: string, targetPath: string): Promise<boolean> {
    try {
        if (!(await fileManager.exists(targetPath))) {
            return true; // File doesn't exist in target, so it's new
        }

        const sourceContent = await fileManager.readFile(sourcePath);
        const targetContent = await fileManager.readFile(targetPath);
        return sourceContent !== targetContent;
    } catch (error) {
        // Error reading files, assume changed
        return true;
    }
}

async function applyChanges(changes: SyncChange[]): Promise<void> {
    for (const change of changes) {
        logger.debug(`Applying ${change.type}: ${change.path}`);

        // Ensure target directory exists
        const targetDir = path.dirname(change.targetPath);
        await fileManager.ensureDir(targetDir);

        // Copy file
        await fileManager.copyFile(change.sourcePath, change.targetPath);
    }
}

async function updateSyncConfig(syncConfigPath: string, syncConfig: SyncConfig, targetVersion: string): Promise<void> {
    syncConfig.lastSync = new Date().toISOString();
    syncConfig.pikaVersion = targetVersion;

    await fileManager.writeFile(syncConfigPath, JSON.stringify(syncConfig, null, 2));
}

async function cleanupTempDir(tempDir: string): Promise<void> {
    try {
        if (await fileManager.exists(tempDir)) {
            await fileManager.removeDirectory(tempDir);
        }
    } catch (error) {
        logger.debug('Failed to cleanup temp directory:', error);
    }
}

function getChangeIcon(type: string): string {
    switch (type) {
        case 'modified':
            return '📝';
        case 'added':
            return '➕';
        case 'deleted':
            return '🗑️';
        default:
            return '📄';
    }
}

function getDefaultProtectedAreas(): string[] {
    return [
        'apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/',
        'services/custom/',
        'apps/custom/',
        '.env',
        '.env.local',
        '.env.*',
        'pika.config.ts',
        '.pika-sync.json'
    ];
}

function showSyncSuccessMessage(): void {
    logger.newLine();
    logger.info('Next steps:');
    console.log('  • Test your application: pnpm dev');
    console.log('  • Verify custom components still work');
    console.log('  • Check authentication configuration');
    console.log('  • Review any new framework features');
}
