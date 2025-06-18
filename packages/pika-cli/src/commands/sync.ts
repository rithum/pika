import inquirer from 'inquirer';
import path from 'path';
import { fileManager } from '../utils/file-manager.js';
import { gitManager } from '../utils/git-manager.js';
import { logger } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ExecOptions } from 'child_process';
import { existsSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import fsExtra from 'fs-extra';

const execAsync = promisify(exec);

// GitHub repository URL - should match create-app.ts
const PIKA_REPO_URL = 'https://github.com/rithum/pika.git';

interface SyncOptions {
    version?: string;
    branch?: string;
    dryRun?: boolean;
    diff?: boolean;
    editorDiff?: boolean;
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
    userProtectedAreas?: string[];
    userUnprotectedAreas?: string[];
    initialConfiguration?: any;
    pikaBranch?: string;
}

async function findPikaProjectRoot(startDir: string): Promise<string | null> {
    let currentDir = startDir;
    const rootDir = path.parse(currentDir).root;

    while (currentDir !== rootDir) {
        const syncConfigPath = path.join(currentDir, '.pika-sync.json');
        if (existsSync(syncConfigPath)) {
            return currentDir;
        }
        currentDir = path.dirname(currentDir);
    }

    return null;
}

function isSampleDirectory(filePath: string): boolean {
    return filePath.startsWith('apps/samples/') || filePath.startsWith('services/samples/');
}

async function checkForUserModificationsOutsideProtectedAreas(projectRoot: string, protectedAreas: string[]): Promise<void> {
    try {
        const filesOutsideProtectedAreas: string[] = [];

        // Get the list of files that are part of the original framework
        const frameworkFiles = await getFrameworkFiles(projectRoot);

        // Recursively scan directory for files
        async function scanDirectory(dir: string, relativePath: string = '') {
            const entries = await readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativeFilePath = path.join(relativePath, entry.name).replace(/\\/g, '/'); // Normalize path separators

                // Skip protected areas
                if (isProtectedArea(relativeFilePath, protectedAreas)) {
                    continue;
                }

                // Skip files that are part of the framework (in node_modules, etc)
                if (shouldSkipDirectory(relativeFilePath)) {
                    continue;
                }

                // Skip sample directories - users are allowed to modify or remove these
                if (isSampleDirectory(relativeFilePath)) {
                    continue;
                }

                // Skip files that are part of the original framework
                if (frameworkFiles.has(relativeFilePath)) {
                    continue;
                }

                if (entry.isDirectory()) {
                    await scanDirectory(fullPath, relativeFilePath);
                } else {
                    // This is a file outside protected areas and not part of the framework
                    filesOutsideProtectedAreas.push(relativeFilePath);
                }
            }
        }

        // Start scanning from project root
        await scanDirectory(projectRoot);

        if (filesOutsideProtectedAreas.length > 0) {
            logger.warn('⚠️  WARNING: Found files outside protected areas:');
            logger.warn('\n    The following files/directories were found outside the designated extension points:');
            filesOutsideProtectedAreas.forEach((file) => {
                logger.warn(`    • ${file}`);
            });

            logger.warn('\n    Extension points are limited to:');
            protectedAreas
                .filter((area) => !area.startsWith('.') && !area.includes('*'))
                .forEach((area) => {
                    logger.warn(`    • ${area}`);
                });
            logger.warn('\n    All custom files and directories should be placed in these extension point directories.');
            logger.warn('    Files outside these areas may be overwritten during sync.');
            logger.warn('    Consider moving your changes to the appropriate extension point directories.');
            logger.newLine();
        }
    } catch (error) {
        logger.debug('Failed to check for files outside protected areas:', error);
    }
}

async function getFrameworkFiles(projectRoot: string): Promise<Set<string>> {
    const frameworkFiles = new Set<string>();

    // Get the list of files from the latest framework version
    const tempDir = await downloadPikaFramework('latest');

    try {
        async function scanFrameworkFiles(dir: string, relativePath: string = '') {
            const entries = await readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativeFilePath = path.join(relativePath, entry.name).replace(/\\/g, '/');

                // Skip files that are part of the framework (in node_modules, etc)
                if (shouldSkipDirectory(relativeFilePath)) {
                    continue;
                }

                if (entry.isDirectory()) {
                    await scanFrameworkFiles(fullPath, relativeFilePath);
                } else {
                    frameworkFiles.add(relativeFilePath);
                }
            }
        }

        await scanFrameworkFiles(tempDir);
    } finally {
        await cleanupTempDir(tempDir);
    }

    return frameworkFiles;
}

export async function syncCommand(options: SyncOptions = {}): Promise<void> {
    try {
        logger.header('🔄 Pika Framework - Sync Updates');

        // Find Pika project root by walking up directories
        const projectRoot = await findPikaProjectRoot(process.cwd());
        if (!projectRoot) {
            logger.error('❌ No Pika project found in current directory or any parent directories');
            logger.info('Run this command from a directory within a project created with `pika create-app`');
            return;
        }

        // If we're not in the project root, inform the user
        if (projectRoot !== process.cwd()) {
            logger.info(`ℹ️  Found Pika project in parent directory: ${projectRoot}`);
            logger.info('ℹ️  Running sync from project root...');
            logger.newLine();
        }

        // Read sync configuration from the project root
        const syncConfigPath = path.join(projectRoot, '.pika-sync.json');
        let syncConfig: SyncConfig;
        try {
            const syncConfigContent = await fileManager.readFile(syncConfigPath);
            syncConfig = JSON.parse(syncConfigContent);
        } catch (error) {
            logger.error('Failed to read .pika-sync.json configuration file');
            return;
        }

        // Show current sync status
        showCurrentSyncStatus(syncConfig);

        // Explain sample directory handling
        logger.info('Sample directory behavior:');
        console.log('  • services/samples/weather and apps/samples/enterprise-site will be synced automatically');
        console.log("  • Only if you haven't made any modifications to them");
        console.log('  • Modified samples will be preserved during sync');
        logger.newLine();

        // Store original working directory
        const originalCwd = process.cwd();

        try {
            // Change to project root for the sync operation
            process.chdir(projectRoot);

            // Check for user modifications outside protected areas
            const protectedAreas = getMergedProtectedAreas(syncConfig);
            await checkForUserModificationsOutsideProtectedAreas(projectRoot, protectedAreas);

            // Determine target version and branch
            const targetVersion = options.version || 'latest';
            const targetBranch = options.branch || syncConfig.pikaBranch || 'main';

            // Log what we're syncing from
            if (options.branch) {
                logger.info(`🔄 Syncing from branch: ${targetBranch} (explicitly specified)`);
            } else if (syncConfig.pikaBranch) {
                logger.info(`🔄 Syncing from branch: ${targetBranch} (last synced branch)`);
            } else {
                logger.info(`🔄 Syncing from branch: ${targetBranch} (default)`);
            }

            if (options.dryRun) {
                logger.info('🔍 Dry run mode - showing what would be updated...');
                logger.info(`📋 Target: ${targetVersion} (branch: ${targetBranch})`);
                logger.newLine();
            }

            const spinner = logger.startSpinner('Preparing sync...');

            try {
                // Download latest Pika framework
                logger.updateSpinner(`Downloading Pika framework ${targetVersion} from branch ${targetBranch}...`);
                const tempDir = await downloadPikaFramework(targetVersion, targetBranch);
                logger.stopSpinner(true, 'Framework downloaded');

                // Compare files and identify changes
                const analysisSpinner = logger.startSpinner('Analyzing changes...');
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

                // If --diff flag is set, show diffs and exit
                if (options.diff) {
                    logger.info('🔍 Showing diffs for changed files (no changes will be applied):');
                    for (const change of changes) {
                        await showDiff(change);
                    }
                    await cleanupTempDir(tempDir);
                    return;
                }

                // If --editor-diff flag is set, open diffs in editor and exit
                if (options.editorDiff) {
                    logger.info('🔍 Opening diffs in your editor (Cursor or VS Code)...');
                    const editor = await detectEditor();
                    if (!editor) {
                        logger.warn('No supported editor (Cursor or VS Code) found in PATH. Falling back to terminal diff.');
                        for (const change of changes) {
                            await showDiff(change);
                        }
                    } else {
                        for (const change of changes) {
                            await openEditorDiff(change, editor);
                        }
                        logger.info('All diffs opened in your editor.');
                    }
                    await cleanupTempDir(tempDir);
                    return;
                }

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
                        message: `Apply these changes from branch ${targetBranch}?`,
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
                await updateSyncConfig(syncConfigPath, syncConfig, targetVersion, targetBranch);
                logger.stopSpinner(true, 'Configuration updated');

                // Cleanup
                await cleanupTempDir(tempDir);

                logger.success('✅ Sync complete!');
                logger.info(`📋 Synced from branch: ${targetBranch}`);
                showSyncSuccessMessage();
            } catch (error) {
                logger.stopSpinner(false, 'Sync failed');
                throw error;
            }
        } finally {
            // Restore original working directory
            process.chdir(originalCwd);
        }
    } catch (error) {
        logger.error('Failed to sync Pika framework:', error);
        process.exit(1);
    }
}

async function downloadPikaFramework(version: string, branch: string = 'main'): Promise<string> {
    const tempDir = path.join(process.cwd(), '.pika-temp');

    // Remove existing temp directory
    if (await fileManager.exists(tempDir)) {
        await fileManager.removeDirectory(tempDir);
    }

    // Clone framework
    try {
        if (version === 'latest') {
            await execAsync(`git clone --depth 1 --branch ${branch} ${PIKA_REPO_URL} "${tempDir}"`);
        } else {
            await execAsync(`git clone --depth 1 --branch ${branch} ${PIKA_REPO_URL} "${tempDir}"`);
        }
    } catch (e) {
        throw new Error(`Failed to download Pika framework from branch ${branch}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    return tempDir;
}

async function identifyChanges(sourcePath: string, targetPath: string, protectedAreas: string[]): Promise<SyncChange[]> {
    const changes: SyncChange[] = [];

    // Compare framework files recursively (source -> target)
    await compareDirectories(sourcePath, targetPath, '', protectedAreas, changes);

    // Check for files that exist in target but not in source (deleted files)
    await findDeletedFiles(sourcePath, targetPath, '', protectedAreas, changes);

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
        if (isDirectory && shouldSkipDirectory(relativeFilePath)) {
            continue;
        }

        // Skip optional sample directories if user removed them
        if (isDirectory && isOptionalSampleDirectory(relativeFilePath)) {
            const shouldSkip = await handleSampleDirectorySync(relativeFilePath, sourceFilePath, targetFilePath, changes);
            if (shouldSkip) {
                continue;
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

async function findDeletedFiles(sourcePath: string, targetPath: string, relativePath: string, protectedAreas: string[], changes: SyncChange[]): Promise<void> {
    const targetFullPath = path.join(targetPath, relativePath);

    if (!(await fileManager.exists(targetFullPath))) {
        return;
    }

    const { readdir } = await import('fs/promises');
    const targetFiles = await readdir(targetFullPath, { withFileTypes: true });

    for (const file of targetFiles) {
        const fileName = file.name;
        const relativeFilePath = path.join(relativePath, fileName).replace(/\\/g, '/'); // Normalize path separators
        const sourceFilePath = path.join(sourcePath, relativeFilePath);
        const targetFilePath = path.join(targetPath, relativeFilePath);

        // Skip protected areas
        if (isProtectedArea(relativeFilePath, protectedAreas)) {
            continue;
        }

        // Skip directories we don't want to sync
        if (shouldSkipDirectory(relativeFilePath)) {
            continue;
        }

        // Skip optional sample directories - users can remove these
        if (isOptionalSampleDirectory(relativeFilePath)) {
            // Check if user has modified the sample directory before allowing deletion
            if (await fileManager.exists(sourceFilePath)) {
                const hasUserModifications = await hasUserModifiedSampleDirectory(sourceFilePath, targetFilePath);
                if (hasUserModifications) {
                    console.log(`  ⏭️  Skipping deletion of ${relativeFilePath} (user has modifications)`);
                    continue; // Don't delete if user modified it
                }
            }
            continue; // Allow deletion if no user modifications
        }

        // Check if this is a directory
        const isDirectory = file.isDirectory();

        if (isDirectory) {
            // Check if directory exists in source
            if (!(await fileManager.exists(sourceFilePath))) {
                // Directory was deleted from source, mark for deletion
                changes.push({
                    type: 'deleted',
                    path: relativeFilePath,
                    sourcePath: '', // No source path for deleted files
                    targetPath: targetFilePath
                });
            } else {
                // Recursively check subdirectories
                await findDeletedFiles(sourcePath, targetPath, relativeFilePath, protectedAreas, changes);
            }
        } else {
            // Check if file exists in source
            if (!(await fileManager.exists(sourceFilePath))) {
                // File was deleted from source, mark for deletion
                changes.push({
                    type: 'deleted',
                    path: relativeFilePath,
                    sourcePath: '', // No source path for deleted files
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

function shouldSkipDirectory(dirPath: string): boolean {
    const skipPatterns = [
        'node_modules',
        '.git',
        '.turbo',
        'dist',
        'build',
        '.svelte-kit',
        'cdk.out',
        'packages',
        'future-changes',
        '.pika-temp',
        '.DS_Store',
        'Thumbs.db',
        '.vscode',
        '.idea',
        '*.swp',
        '*.swo',
        '*.tmp',
        '*.temp',
        '*.log',
        'logs',
        '.pnpm-store',
        '.npm',
        '.cache',
        'coverage',
        '.nyc_output',
        '.next',
        '.nuxt',
        '.output',
        '.vercel',
        '.netlify',
        '.env.local',
        '.env.*.local'
    ];

    return skipPatterns.some((pattern) => dirPath.includes(pattern));
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

        if (change.type === 'deleted') {
            // Remove file or directory
            if (await fileManager.exists(change.targetPath)) {
                const { stat } = await import('fs/promises');
                const stats = await stat(change.targetPath);

                if (stats.isDirectory()) {
                    await fileManager.removeDirectory(change.targetPath);
                } else {
                    await fsExtra.remove(change.targetPath);
                }
            }
        } else {
            // Ensure target directory exists
            const targetDir = path.dirname(change.targetPath);
            await fileManager.ensureDir(targetDir);

            // Copy file
            await fileManager.copyFile(change.sourcePath, change.targetPath);
        }
    }
}

async function updateSyncConfig(syncConfigPath: string, syncConfig: SyncConfig, targetVersion: string, targetBranch: string): Promise<void> {
    syncConfig.lastSync = new Date().toISOString();
    syncConfig.pikaVersion = targetVersion;
    syncConfig.pikaBranch = targetBranch;

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
        'apps/pika-chat/src/lib/server/auth-provider/',
        'services/custom/',
        'apps/custom/',
        '.env',
        '.env.local',
        '.env.*',
        'pika.config.ts',
        '.pika-sync.json',
        '.gitignore', // Always protect .gitignore
        'package.json', // Always protect package.json
        'pnpm-lock.yaml', // Always protect pnpm-lock.yaml
        // Infrastructure stack files - users should customize these
        'apps/pika-chat/infra/bin/pika-chat.ts',
        'services/pika/bin/pika.ts'
    ];
}

function showSyncSuccessMessage(): void {
    logger.newLine();
    logger.info('Next steps:');
    console.log('  • Test your application: pnpm dev');
    console.log('  • Verify custom components still work');
    console.log('  • Check custom authentication configuration');
    console.log('  • Review any new framework features');
    console.log('  • Update project names in pika-config.ts if needed (protected from sync)');
    console.log('  • Update chat app stack as needed: apps/pika-chat/infra/bin/pika-chat.ts');
    console.log('  • Update service stack as needed: services/pika/bin/pika.ts');
    logger.newLine();
    logger.info('Sample directory handling:');
    console.log('  • Sample directories (services/samples/weather, apps/samples/enterprise-site) are automatically synced');
    console.log("  • Only if you haven't made any modifications to them");
    console.log("  • If you've modified a sample, it will be skipped during sync to preserve your changes");
    console.log("  • If you've removed a sample directory, it won't be restored");
}

async function showDiff(change: SyncChange): Promise<void> {
    const chalk = (await import('chalk')).default;
    if (change.type === 'modified') {
        // Try to use git diff --no-index for best UX
        try {
            const { stdout } = await execAsync(`git diff --no-index --color "${change.targetPath}" "${change.sourcePath}"`);
            if (stdout.trim()) {
                console.log(chalk.yellow(`--- ${change.targetPath}`));
                console.log(chalk.yellow(`+++ ${change.sourcePath}`));
                console.log(stdout);
            } else {
                console.log(chalk.green(`No visible diff for ${change.path}`));
            }
        } catch (e) {
            // Fallback: simple inline diff
            await showSimpleDiff(change.targetPath, change.sourcePath, change.path);
        }
    } else if (change.type === 'added') {
        const fs = await import('fs/promises');
        const content = await fs.readFile(change.sourcePath, 'utf8');
        console.log(chalk.green(`➕ Added: ${change.path}`));
        console.log(chalk.gray('--- New file content: ---'));
        console.log(content);
    } else if (change.type === 'deleted') {
        const fs = await import('fs/promises');
        if (await fileManager.exists(change.targetPath)) {
            const content = await fs.readFile(change.targetPath, 'utf8');
            console.log(chalk.red(`🗑️ Deleted: ${change.path}`));
            console.log(chalk.gray('--- Deleted file content: ---'));
            console.log(content);
        } else {
            console.log(chalk.red(`🗑️ Deleted: ${change.path}`));
            console.log(chalk.gray('--- File already missing locally ---'));
        }
    }
}

async function showSimpleDiff(fileA: string, fileB: string, label: string): Promise<void> {
    const chalk = (await import('chalk')).default;
    const fs = await import('fs/promises');
    try {
        const [a, b] = await Promise.all([fs.readFile(fileA, 'utf8'), fs.readFile(fileB, 'utf8')]);
        const diff = await import('diff');
        const changes = diff.createPatch(label, a, b);
        console.log(chalk.yellow(changes));
    } catch (e) {
        console.log(chalk.red(`Could not show diff for ${label}`));
    }
}

async function detectEditor(): Promise<'cursor' | 'code' | null> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    try {
        await execAsync('cursor --version');
        return 'cursor';
    } catch {}
    try {
        await execAsync('code --version');
        return 'code';
    } catch {}
    return null;
}

async function openEditorDiff(change: SyncChange, editor: 'cursor' | 'code'): Promise<void> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const chalk = (await import('chalk')).default;
    if (change.type === 'modified') {
        await execAsync(`${editor} --diff "${change.targetPath}" "${change.sourcePath}"`);
        console.log(chalk.cyan(`[${editor}] Diff opened for: ${change.path}`));
    } else if (change.type === 'added') {
        await execAsync(`${editor} "${change.sourcePath}"`);
        console.log(chalk.green(`[${editor}] New file opened: ${change.path}`));
    } else if (change.type === 'deleted') {
        await execAsync(`${editor} "${change.targetPath}"`);
        console.log(chalk.red(`[${editor}] Deleted file opened (local): ${change.path}`));
    }
}

function showCurrentSyncStatus(syncConfig: SyncConfig): void {
    logger.newLine();
    logger.info('Current sync status:');
    console.log(`  • Pika version: ${syncConfig.pikaVersion}`);
    console.log(`  • Last sync: ${new Date(syncConfig.lastSync).toLocaleString()}`);
    console.log(`  • Last synced branch: ${syncConfig.pikaBranch || 'main (default)'}`);
    console.log(`  • Default protected areas: ${syncConfig.protectedAreas.length} directories/files protected`);
    if (syncConfig.userProtectedAreas && syncConfig.userProtectedAreas.length > 0) {
        console.log(`  • User protected areas: ${syncConfig.userProtectedAreas.length} additional areas protected`);
    } else {
        console.log(`  • User protected areas: None configured`);
    }
    if (syncConfig.userUnprotectedAreas && syncConfig.userUnprotectedAreas.length > 0) {
        console.log(`  • User unprotected areas: ${syncConfig.userUnprotectedAreas.length} areas allowed to sync`);
    } else {
        console.log(`  • User unprotected areas: None configured`);
    }
    logger.newLine();
}

function getMergedProtectedAreas(syncConfig: SyncConfig): string[] {
    const defaultProtectedAreas = getDefaultProtectedAreas();
    const userProtectedAreas = syncConfig.userProtectedAreas || [];
    const userUnprotectedAreas = syncConfig.userUnprotectedAreas || [];

    // Start with default protected areas
    let mergedAreas = [...defaultProtectedAreas];

    // Add user protected areas
    mergedAreas = [...new Set([...mergedAreas, ...userProtectedAreas])];

    // Remove user unprotected areas (files that should be allowed to sync)
    mergedAreas = mergedAreas.filter((area) => !userUnprotectedAreas.includes(area));

    return mergedAreas;
}

/**
 * Checks if a user has modified a sample directory by comparing it with the framework version.
 * This function recursively compares all files and directories to detect any user modifications.
 *
 * @param sourcePath - Path to the sample directory in the framework
 * @param targetPath - Path to the sample directory in the user's project
 * @returns true if the user has made any modifications, false otherwise
 */
async function hasUserModifiedSampleDirectory(sourcePath: string, targetPath: string): Promise<boolean> {
    // Check if any files in the target directory differ from the source
    const { readdir } = await import('fs/promises');

    // Files and directories to ignore when comparing sample directories
    const ignorePatterns = [
        'node_modules',
        '.svelte-kit',
        '.turbo',
        'dist',
        'build',
        '.next',
        '.nuxt',
        '.output',
        'coverage',
        '.nyc_output',
        '.cache',
        '.pnpm-store',
        '.npm',
        '*.log',
        'logs',
        '.DS_Store',
        'Thumbs.db',
        '.vscode',
        '.idea',
        '*.swp',
        '*.swo',
        '*.tmp',
        '*.temp'
    ];

    function shouldIgnoreFile(fileName: string): boolean {
        return ignorePatterns.some((pattern) => {
            if (pattern.includes('*')) {
                // Handle wildcard patterns
                const regex = new RegExp(pattern.replace('*', '.*'));
                return regex.test(fileName);
            }
            return fileName === pattern;
        });
    }

    async function compareDirectoryRecursively(sourceDir: string, targetDir: string): Promise<boolean> {
        if (!(await fileManager.exists(targetDir))) {
            return false; // Directory doesn't exist, so no user modifications
        }

        const sourceFiles = await readdir(sourceDir, { withFileTypes: true });
        const targetFiles = await readdir(targetDir, { withFileTypes: true });

        // Filter out ignored files
        const filteredSourceFiles = sourceFiles.filter((f) => !shouldIgnoreFile(f.name));
        const filteredTargetFiles = targetFiles.filter((f) => !shouldIgnoreFile(f.name));

        // Check if any files exist in target that don't exist in source (user additions)
        for (const targetFile of filteredTargetFiles) {
            const sourceFile = filteredSourceFiles.find((f) => f.name === targetFile.name);
            if (!sourceFile) {
                return true; // User added a file
            }
        }

        // Check each file for modifications
        for (const sourceFile of filteredSourceFiles) {
            const targetFile = filteredTargetFiles.find((f) => f.name === sourceFile.name);
            const sourceFilePath = path.join(sourceDir, sourceFile.name);
            const targetFilePath = path.join(targetDir, sourceFile.name);

            if (!targetFile) {
                return true; // User removed a file
            }

            if (sourceFile.isDirectory() && targetFile.isDirectory()) {
                // Recursively check subdirectories
                const hasModifications = await compareDirectoryRecursively(sourceFilePath, targetFilePath);
                if (hasModifications) {
                    return true;
                }
            } else if (!sourceFile.isDirectory() && !targetFile.isDirectory()) {
                // Compare file content
                const hasChanged = await fileHasChanged(sourceFilePath, targetFilePath);
                if (hasChanged) {
                    return true; // User modified the file
                }
            } else {
                // One is file, one is directory - user modified structure
                return true;
            }
        }

        return false; // No modifications found
    }

    return await compareDirectoryRecursively(sourcePath, targetPath);
}

/**
 * Handles the sync decision for optional sample directories.
 * Determines whether to skip syncing based on user modifications or directory existence.
 *
 * @param relativeFilePath - Relative path of the sample directory
 * @param sourceFilePath - Full path to the sample directory in the framework
 * @param targetFilePath - Full path to the sample directory in the user's project
 * @param changes - Array of sync changes (not used in this function but required for consistency)
 * @returns true if the directory should be skipped, false if it should be synced
 */
async function handleSampleDirectorySync(relativeFilePath: string, sourceFilePath: string, targetFilePath: string, changes: SyncChange[]): Promise<boolean> {
    const targetExists = await fileManager.exists(targetFilePath);

    if (!targetExists) {
        console.log(`  ⏭️  Skipping ${relativeFilePath} (user removed)`);
        console.log(`     To restore: mkdir -p ${relativeFilePath} && pika sync`);
        return true; // Skip this directory
    }

    // Check if user has modified the sample directory
    const hasUserModifications = await hasUserModifiedSampleDirectory(sourceFilePath, targetFilePath);
    if (hasUserModifications) {
        console.log(`  ⏭️  Skipping ${relativeFilePath} (user has modifications)`);
        return true; // Skip this directory
    }

    // User hasn't modified it, so we can sync updates
    console.log(`  🔄 Syncing ${relativeFilePath} (no user modifications detected)`);
    return false; // Don't skip, allow normal sync
}
