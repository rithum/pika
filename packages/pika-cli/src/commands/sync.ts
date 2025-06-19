import inquirer from 'inquirer';
import path from 'path';
import { fileManager } from '../utils/file-manager.js';
import { gitManager } from '../utils/git-manager.js';
import { logger } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ExecOptions } from 'child_process';
import { existsSync, readFileSync } from 'fs';
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
    visualDiff?: boolean;
    debug?: boolean;
    help?: boolean;
}

interface SyncChange {
    type: 'modified' | 'added' | 'deleted';
    path: string;
    sourcePath: string;
    targetPath: string;
    isUserModification?: boolean; // New field to distinguish user modifications from remote changes
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

/*
// This is defined in @pika/shared/src/types/pika-types.ts
interface PikaConfig {
    pika: {
        projNameL: string;
        projNameKebabCase: string;
        projNameTitleCase: string;
        projNameCamel: string;
        projNameHuman: string;
    };
    pikaChat: {
        projNameL: string;
        projNameKebabCase: string;
        projNameTitleCase: string;
        projNameCamel: string;
        projNameHuman: string;
    };
    weather?: {
        projNameL: string;
        projNameKebabCase: string;
        projNameTitleCase: string;
        projNameCamel: string;
        projNameHuman: string;
    };
}
*/

interface UserModification {
    path: string;
    action: 'overwrite' | 'protect' | 'skip' | 'cancel';
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
            logger.warn('\n    Additionally, any directory or file path containing a segment starting with "custom-" is automatically protected.');
            logger.warn('    All custom files and directories should be placed in these extension point directories.');
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
        // Show help if requested
        if (options.help) {
            showSyncHelp();
            return;
        }

        // Enable debug logging if requested
        if (options.debug) {
            process.env.PIKA_DEBUG = 'true';
            logger.debug('[DEBUG] Debug logging enabled for sync command');
        }

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
        console.log("  • ...only if you haven't made any modifications to them");
        console.log('  • Changes made to sample apps/services will be preserved during sync');
        console.log('  • Deleted sample apps/services will not be restored (you can delete sample apps/services)');
        logger.newLine();

        // Store original working directory
        const originalCwd = process.cwd();

        try {
            // Change to project root for the sync operation
            process.chdir(projectRoot);

            // Check for user modifications outside protected areas
            const protectedAreas = getMergedProtectedAreas(syncConfig);
            logger.debug(`[DEBUG] Using protected areas: ${JSON.stringify(protectedAreas, null, 2)}`);
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

                logger.debug(`[DEBUG] Total changes found: ${changes.length}`);

                if (changes.length === 0) {
                    logger.success('✅ No updates available - your project is up to date!');
                    await cleanupTempDir(tempDir);
                    return;
                }

                // Separate user modifications from remote changes
                const { userModifications, remoteChanges } = separateUserModificationsFromRemoteChanges(changes);

                // Handle user modifications first
                if (userModifications.length > 0) {
                    const fileWord = userModifications.length === 1 ? 'file' : 'files';
                    logger.info(`📋 Found ${userModifications.length} ${fileWord} you have modified that are not in protected areas:`);
                    userModifications.forEach((change) => {
                        console.log(`  ${getChangeIcon(change.type)} ${change.path} (your modification)`);
                    });
                    logger.newLine();

                    const userChoices = await handleUserModifications(userModifications);

                    // Handle files to protect
                    const filesToProtect = userChoices.filter((choice) => choice.action === 'protect').map((choice) => choice.path);

                    if (filesToProtect.length > 0) {
                        await updateSyncConfigWithProtectedFiles(projectRoot, filesToProtect);
                    }

                    // Filter out skipped files and protected files from changes to apply
                    const filesToSkip = userChoices.filter((choice) => choice.action === 'skip').map((choice) => choice.path);

                    const filesToProtectSet = new Set(filesToProtect);
                    const filesToSkipSet = new Set(filesToSkip);

                    // Remove user modifications that are being skipped or protected
                    const filteredChanges = changes.filter((change) => {
                        if (change.isUserModification) {
                            return !filesToSkipSet.has(change.path) && !filesToProtectSet.has(change.path);
                        }
                        return true;
                    });

                    // Update changes array with filtered results
                    changes.length = 0;
                    changes.push(...filteredChanges);

                    logger.debug(`[DEBUG] After user modification handling: ${changes.length} changes remaining`);
                }

                // Show remaining changes (remote changes + user modifications to overwrite)
                if (changes.length > 0) {
                    const fileWord = changes.length === 1 ? 'file' : 'files';
                    logger.info(`📋 Found ${changes.length} ${fileWord} to update from the framework:`);
                    changes.forEach((change) => {
                        const icon = getChangeIcon(change.type);
                        const suffix = change.isUserModification ? ' (overwriting your modification)' : '';
                        console.log(`  ${icon} ${change.path}${suffix}`);
                    });
                    logger.newLine();
                } else {
                    logger.success('✅ No framework updates to apply!');
                    await cleanupTempDir(tempDir);
                    return;
                }

                // If --diff flag is set, show diffs and exit
                if (options.diff) {
                    logger.info('🔍 Showing diffs for changed files (no changes will be applied):');
                    for (const change of changes) {
                        await showDiff(change);
                    }
                    await cleanupTempDir(tempDir);
                    return;
                }

                // If --visual-diff flag is set, open diffs in editor and exit
                if (options.visualDiff) {
                    logger.info('🔍 Opening diffs in your editor (Cursor or VS Code)...');
                    const editor = await detectEditor();
                    if (!editor) {
                        logger.warn('No supported editor (Cursor or VS Code) found in PATH. Falling back to terminal diff.');
                        for (const change of changes) {
                            await showDiff(change);
                        }
                    } else {
                        for (const change of changes) {
                            await openVisualDiff(change, editor);
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
                        message: `Apply ${changes.length} framework changes from branch ${targetBranch}?`,
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

    logger.debug(`[DEBUG] identifyChanges: comparing source=${sourcePath} with target=${targetPath}`);
    logger.debug(`[DEBUG] identifyChanges: protected areas count=${protectedAreas.length}`);

    // First, detect user modifications in unprotected files
    const userModifications = await detectUserModifications(sourcePath, targetPath, protectedAreas);
    changes.push(...userModifications);

    // Compare framework files recursively (source -> target)
    await compareDirectories(sourcePath, targetPath, '', protectedAreas, changes);

    // Check for files that exist in target but not in source (deleted files)
    await findDeletedFiles(sourcePath, targetPath, '', protectedAreas, changes);

    logger.debug(`[DEBUG] identifyChanges: found ${changes.length} total changes`);
    return changes;
}

async function compareDirectories(sourcePath: string, targetPath: string, relativePath: string, protectedAreas: string[], changes: SyncChange[]): Promise<void> {
    const sourceFullPath = path.join(sourcePath, relativePath);

    if (!(await fileManager.exists(sourceFullPath))) {
        logger.debug(`[DEBUG] Source directory doesn't exist: ${sourceFullPath}`);
        return;
    }

    const { readdir } = await import('fs/promises');
    const sourceFiles = await readdir(sourceFullPath, { withFileTypes: true });

    logger.debug(`[DEBUG] Scanning directory: ${relativePath || 'root'} (${sourceFiles.length} items)`);

    for (const file of sourceFiles) {
        const fileName = file.name;
        const relativeFilePath = path.join(relativePath, fileName).replace(/\\/g, '/'); // Normalize path separators
        const sourceFilePath = path.join(sourcePath, relativeFilePath);
        const targetFilePath = path.join(targetPath, relativeFilePath);

        logger.debug(`[DEBUG] Processing: ${relativeFilePath}`);

        // Skip protected areas
        if (isProtectedArea(relativeFilePath, protectedAreas)) {
            logger.debug(`[DEBUG] Skipping protected area: ${relativeFilePath}`);
            continue;
        }

        // Check if this is a directory
        const isDirectory = file.isDirectory();

        // Skip directories we don't want to sync
        if (isDirectory && shouldSkipDirectory(relativeFilePath)) {
            logger.debug(`[DEBUG] Skipping directory (shouldSkipDirectory): ${relativeFilePath}`);
            continue;
        }

        // Skip optional sample directories if user removed them
        if (isDirectory && isOptionalSampleDirectory(relativeFilePath)) {
            const shouldSkip = await handleSampleDirectorySync(relativeFilePath, sourceFilePath, targetFilePath, changes);
            if (shouldSkip) {
                logger.debug(`[DEBUG] Skipping sample directory: ${relativeFilePath}`);
                continue;
            } else {
                logger.debug(`[DEBUG] Syncing sample directory: ${relativeFilePath}`);
            }
        }

        if (isDirectory) {
            logger.debug(`[DEBUG] Recursing into directory: ${relativeFilePath}`);
            await compareDirectories(sourcePath, targetPath, relativeFilePath, protectedAreas, changes);
        } else {
            // Compare file content
            logger.debug(`[DEBUG] Comparing file: ${relativeFilePath}`);
            const hasChanged = await fileHasChanged(sourceFilePath, targetFilePath);
            logger.debug(`[DEBUG] File ${relativeFilePath} has changed: ${hasChanged}`);
            if (hasChanged) {
                const exists = await fileManager.exists(targetFilePath);
                const changeType = exists ? 'modified' : 'added';
                logger.debug(`[DEBUG] Adding change: ${changeType} - ${relativeFilePath}`);
                changes.push({
                    type: changeType,
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

        // Skip optional sample directories - users can remove these, but we don't delete them
        if (isOptionalSampleDirectory(relativeFilePath)) {
            continue; // Skip sample directories in deletion check
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
    // Check if any path segment starts with 'custom-'
    const pathSegments = filePath.split('/');
    const hasCustomSegment = pathSegments.some((segment) => segment.startsWith('custom-'));

    if (hasCustomSegment) {
        logger.debug(`[DEBUG] isProtectedArea: ${filePath} matches custom- pattern`);
        return true;
    }

    // Check against explicit protected areas
    const isProtected = protectedAreas.some((area) => {
        if (area.endsWith('/')) {
            return filePath.startsWith(area);
        }
        return filePath === area;
    });

    if (isProtected) {
        const matchingArea = protectedAreas.find((area) => {
            if (area.endsWith('/')) {
                return filePath.startsWith(area);
            }
            return filePath === area;
        });
        logger.debug(`[DEBUG] isProtectedArea: ${filePath} matches protected area: ${matchingArea}`);
        return true;
    }

    return false;
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
        'packages/pika-cli', // Skip CLI package (removed in create-app.ts)
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

    const shouldSkip = skipPatterns.some((pattern) => dirPath.includes(pattern));
    if (shouldSkip) {
        const matchingPattern = skipPatterns.find((pattern) => dirPath.includes(pattern));
        logger.debug(`[DEBUG] shouldSkipDirectory: ${dirPath} matches pattern: ${matchingPattern}`);
    }
    return shouldSkip;
}

function isOptionalSampleDirectory(filePath: string): boolean {
    const optionalDirs = ['services/samples/weather', 'apps/samples/enterprise-site'];
    return optionalDirs.includes(filePath);
}

async function fileHasChanged(sourcePath: string, targetPath: string): Promise<boolean> {
    try {
        if (!(await fileManager.exists(targetPath))) {
            logger.debug(`[DEBUG] fileHasChanged: Target file doesn't exist: ${targetPath}`);
            return true; // File doesn't exist in target, so it's new
        }

        const sourceContent = await fileManager.readFile(sourcePath);
        const targetContent = await fileManager.readFile(targetPath);

        const hasChanged = sourceContent !== targetContent;
        logger.debug(
            `[DEBUG] fileHasChanged: ${path.basename(sourcePath)} - changed: ${hasChanged} (source: ${sourceContent.length} chars, target: ${targetContent.length} chars)`
        );

        if (hasChanged) {
            logger.debug(`[DEBUG] fileHasChanged: Content differs for ${path.basename(sourcePath)}`);
        }

        return hasChanged;
    } catch (error) {
        logger.debug(`[DEBUG] fileHasChanged: Error comparing files: ${error}`);
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
        'pika-config.ts',
        '.pika-sync.json',
        '.gitignore', // Always protect .gitignore
        'package.json', // Always protect package.json
        'pnpm-lock.yaml', // Always protect pnpm-lock.yaml
        // CI/CD configuration directories
        '.github/', // GitHub Actions workflows
        '.gitlab/', // GitLab CI/CD configurations
        '.circleci/', // CircleCI configurations
        '.bitbucket/', // Bitbucket Pipelines configs
        '.azure-pipelines/', // Azure Pipelines setup
        '.azure/', // Azure Pipelines setup (alternative)
        '.ci/', // Generic or custom-named CI configuration folders
        // CI/CD configuration files
        '.gitlab-ci.yml', // GitLab CI
        '.circleci/config.yml', // CircleCI
        'bitbucket-pipelines.yml', // Bitbucket
        'azure-pipelines.yml', // Azure Pipelines
        'Makefile', // Used to script build/test steps
        'Jenkinsfile', // Jenkins CI
        '.travis.yml', // Legacy Travis CI
        'buildspec.yml', // AWS CodeBuild
        'taskfile.yml', // Used with go-task
        '.drone.yml' // Drone CI
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
    console.log('  • Update chat app stack as needed: apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts');
    console.log('  • Update service stack as needed: services/pika/lib/stacks/custom-stack-defs.ts');
    logger.newLine();
    logger.info('Protection features:');
    console.log('  • Any directory or file path containing a segment starting with "custom-" is automatically protected');
    console.log('  • Custom directories can be placed anywhere in the project structure');
    console.log('  • Protected areas and custom- directories are preserved during sync');
    logger.newLine();
    logger.info('Sample directory handling:');
    console.log('  • Sample directories (services/samples/weather, apps/samples/enterprise-site) are automatically synced');
    console.log("  • Only if you haven't made any modifications to them");
    console.log("  • If you've modified a sample, it will be skipped during sync to preserve your changes");
    console.log("  • If you've removed a sample directory, it won't be restored");
    console.log("  • This allows you to remove samples you don't want and keep modifications to samples you're learning from");
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

async function openVisualDiff(change: SyncChange, editor: 'cursor' | 'code'): Promise<void> {
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
    console.log(`  • Custom- protection: Any path segment starting with "custom-" is automatically protected`);
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
    logger.info('Configuration:');
    console.log('  • Edit .pika-sync.json to customize protection behavior');
    console.log('  • Add files to userProtectedAreas to protect them from framework updates');
    console.log('  • Add files to userUnprotectedAreas to allow framework updates to overwrite them');
    console.log('  • Files with "custom-" in their path are automatically protected');
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
        '*.temp',
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
        '.env',
        '.env.local',
        '.env.*.local',
        'tsconfig.tsbuildinfo',
        '.eslintcache',
        '.prettierignore',
        '.gitignore',
        'README.md',
        'CHANGELOG.md',
        'LICENSE',
        '*.min.js',
        '*.min.css',
        '*.map'
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
            logger.debug(`[DEBUG] hasUserModifiedSampleDirectory: Target directory doesn't exist: ${targetDir}`);
            return false; // Directory doesn't exist, so no user modifications
        }

        const sourceFiles = await readdir(sourceDir, { withFileTypes: true });
        const targetFiles = await readdir(targetDir, { withFileTypes: true });

        // Filter out ignored files
        const filteredSourceFiles = sourceFiles.filter((f) => !shouldIgnoreFile(f.name));
        const filteredTargetFiles = targetFiles.filter((f) => !shouldIgnoreFile(f.name));

        logger.debug(`[DEBUG] hasUserModifiedSampleDirectory: Comparing ${sourceDir} vs ${targetDir}`);
        logger.debug(`[DEBUG] hasUserModifiedSampleDirectory: Source files: ${filteredSourceFiles.map((f) => f.name).join(', ')}`);
        logger.debug(`[DEBUG] hasUserModifiedSampleDirectory: Target files: ${filteredTargetFiles.map((f) => f.name).join(', ')}`);

        // Check if any files exist in target that don't exist in source (user additions)
        for (const targetFile of filteredTargetFiles) {
            const sourceFile = filteredSourceFiles.find((f) => f.name === targetFile.name);
            if (!sourceFile) {
                logger.debug(`[DEBUG] hasUserModifiedSampleDirectory: User added file: ${targetFile.name}`);
                return true; // User added a file
            }
        }

        // Check each file for modifications
        for (const sourceFile of filteredSourceFiles) {
            const targetFile = filteredTargetFiles.find((f) => f.name === sourceFile.name);
            const sourceFilePath = path.join(sourceDir, sourceFile.name);
            const targetFilePath = path.join(targetDir, sourceFile.name);

            if (!targetFile) {
                logger.debug(`[DEBUG] hasUserModifiedSampleDirectory: User removed file: ${sourceFile.name}`);
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
                    logger.debug(`[DEBUG] hasUserModifiedSampleDirectory: User modified file: ${sourceFile.name}`);
                    return true; // User modified the file
                }
            } else {
                // One is file, one is directory - user modified structure
                logger.debug(`[DEBUG] hasUserModifiedSampleDirectory: Structure changed for: ${sourceFile.name}`);
                return true;
            }
        }

        logger.debug(`[DEBUG] hasUserModifiedSampleDirectory: No modifications found in ${sourceDir}`);
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
        logger.debug(`Sample directory ${relativeFilePath} was removed by user - allowing removal`);
        return true; // Skip this directory - user removed it
    }

    // Check if user has modified the sample directory
    const hasUserModifications = await hasUserModifiedSampleDirectory(sourceFilePath, targetFilePath);
    if (hasUserModifications) {
        logger.debug(`Sample directory ${relativeFilePath} has user modifications - preserving changes`);
        return true; // Skip this directory - preserve user modifications
    }

    // User hasn't modified it, so we can sync updates
    logger.debug(`Sample directory ${relativeFilePath} has no user modifications - syncing updates`);
    return false; // Don't skip, allow normal sync
}

/**
 * Detects files that have been modified by the user but are not in protected areas.
 * These are files that exist in both source and target but have different content.
 */
async function detectUserModifications(sourcePath: string, targetPath: string, protectedAreas: string[]): Promise<SyncChange[]> {
    const userModifications: SyncChange[] = [];

    logger.debug(`[DEBUG] detectUserModifications: scanning for user modifications`);

    async function scanForUserModifications(dir: string, relativePath: string = '') {
        const sourceFullPath = path.join(sourcePath, relativePath);
        const targetFullPath = path.join(targetPath, relativePath);

        if (!(await fileManager.exists(sourceFullPath)) || !(await fileManager.exists(targetFullPath))) {
            return;
        }

        const { readdir } = await import('fs/promises');
        const sourceFiles = await readdir(sourceFullPath, { withFileTypes: true });

        for (const file of sourceFiles) {
            const fileName = file.name;
            const relativeFilePath = path.join(relativePath, fileName).replace(/\\/g, '/');
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

            // Skip optional sample directories
            if (isOptionalSampleDirectory(relativeFilePath)) {
                continue;
            }

            if (file.isDirectory()) {
                await scanForUserModifications(sourceFilePath, relativeFilePath);
            } else {
                // Check if file exists in target and has different content
                if (await fileManager.exists(targetFilePath)) {
                    const hasChanged = await fileHasChanged(sourceFilePath, targetFilePath);
                    if (hasChanged) {
                        logger.debug(`[DEBUG] User modification detected: ${relativeFilePath}`);
                        userModifications.push({
                            type: 'modified',
                            path: relativeFilePath,
                            sourcePath: sourceFilePath,
                            targetPath: targetFilePath,
                            isUserModification: true
                        });
                    }
                }
            }
        }
    }

    await scanForUserModifications(sourcePath);
    logger.debug(`[DEBUG] detectUserModifications: found ${userModifications.length} user modifications`);
    return userModifications;
}

/**
 * Handles user modifications by asking the user what to do with each modified file.
 */
async function handleUserModifications(userModifications: SyncChange[]): Promise<UserModification[]> {
    if (userModifications.length === 0) {
        return [];
    }

    logger.warn('⚠️  WARNING: Found files that you have modified that are not in protected areas:');
    logger.warn('\n    These files will be overwritten during sync unless you choose to protect them.');
    logger.warn('    You can:');
    logger.warn('    • Overwrite: Allow the file to be updated with the latest framework version');
    logger.warn('    • Protect: Add the file to userProtectedAreas in .pika-sync.json');
    logger.warn('    • Skip: Skip this file during this sync (it will be overwritten in future syncs)');
    logger.warn('    • Cancel: Cancel this sync operation');
    logger.newLine();

    const userChoices: UserModification[] = [];

    for (const modification of userModifications) {
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: `What would you like to do with "${modification.path}"?`,
                choices: [
                    { name: 'Overwrite (use framework version)', value: 'overwrite' },
                    { name: 'Protect (add to userProtectedAreas)', value: 'protect' },
                    { name: 'Skip (skip this file for now)', value: 'skip' },
                    { name: 'Cancel (cancel this sync operation)', value: 'cancel' }
                ],
                default: 'overwrite'
            }
        ]);

        if (action === 'cancel') {
            logger.info('Sync cancelled by user.');
            process.exit(0);
        }

        userChoices.push({
            path: modification.path,
            action
        });
    }

    return userChoices;
}

/**
 * Updates .pika-sync.json to add files to userProtectedAreas.
 */
async function updateSyncConfigWithProtectedFiles(projectRoot: string, filesToProtect: string[]): Promise<void> {
    if (filesToProtect.length === 0) {
        return;
    }

    const syncConfigPath = path.join(projectRoot, '.pika-sync.json');

    if (!(await fileManager.exists(syncConfigPath))) {
        throw new Error('.pika-sync.json not found in project root');
    }

    try {
        const syncConfigContent = await fileManager.readFile(syncConfigPath);
        const syncConfig = JSON.parse(syncConfigContent);

        // Get current user protected areas
        const currentUserProtectedAreas = syncConfig.userProtectedAreas || [];

        // Add new files to protect (avoid duplicates)
        const newUserProtectedAreas = [...new Set([...currentUserProtectedAreas, ...filesToProtect])];

        // Update the config
        syncConfig.userProtectedAreas = newUserProtectedAreas;

        await fileManager.writeFile(syncConfigPath, JSON.stringify(syncConfig, null, 2));
        const fileWord = filesToProtect.length === 1 ? 'file' : 'files';
        logger.success(`✅ Updated .pika-sync.json with ${filesToProtect.length} new protected ${fileWord}`);
    } catch (error) {
        throw new Error(`Failed to update .pika-sync.json: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Separates user modifications from actual remote changes.
 */
function separateUserModificationsFromRemoteChanges(changes: SyncChange[]): {
    userModifications: SyncChange[];
    remoteChanges: SyncChange[];
} {
    const userModifications: SyncChange[] = [];
    const remoteChanges: SyncChange[] = [];

    for (const change of changes) {
        if (change.isUserModification) {
            userModifications.push(change);
        } else {
            remoteChanges.push(change);
        }
    }

    return { userModifications, remoteChanges };
}

/**
 * Shows comprehensive help information about the Pika sync system.
 */
function showSyncHelp(): void {
    logger.header('🔄 Pika Framework - Sync System Help');

    logger.info('Overview:');
    console.log('  Your Pika project is a fork of the Pika framework that you can check into your own source control.');
    console.log('  You can continue to receive updates from the Pika framework repository while preserving your customizations.');
    console.log('  The sync system intelligently merges framework updates with your changes.');
    logger.newLine();

    logger.info('How It Works:');
    console.log('  1. The sync command downloads the latest Pika framework from GitHub');
    console.log('  2. It compares your project with the framework to identify changes');
    console.log('  3. It applies framework updates while preserving your customizations');
    console.log('  4. It handles conflicts by asking you how to resolve them');
    logger.newLine();

    logger.info('Protection System:');
    console.log('  The sync system uses multiple layers of protection to preserve your work:');
    console.log('  • Default protected areas: Core customization directories and config files');
    console.log('  • Custom- protection: Any path segment starting with "custom-" is automatically protected');
    console.log('  • User protected areas: Additional areas you specify in .pika-sync.json');
    console.log('  • User unprotected areas: Areas you explicitly allow to sync in .pika-sync.json');
    logger.newLine();

    logger.info('Configuration via .pika-sync.json:');
    console.log('  You can customize sync behavior by editing .pika-sync.json:');
    console.log('  • userProtectedAreas: Add files/directories to protect from framework updates');
    console.log('  • userUnprotectedAreas: Remove files/directories from default protection');
    console.log('  • Example: Add "my-custom-file.ts" to userProtectedAreas to protect it');
    console.log('  • Remember that any path segment starting with "custom-" is automatically protected');
    logger.newLine();

    logger.info('Default Protected Areas:');
    console.log('  • apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/');
    console.log('  • apps/pika-chat/src/lib/server/auth-provider/');
    console.log('  • services/custom/');
    console.log('  • apps/custom/');
    console.log('  • .env, .env.local, .env.*');
    console.log('  • pika-config.ts');
    console.log('  • .pika-sync.json');
    console.log('  • .gitignore, package.json, pnpm-lock.yaml');
    console.log('  • CI/CD configurations: .github/, .gitlab/, .circleci/, .bitbucket/, .azure-pipelines/, .ci/');
    console.log('  • CI/CD files: .gitlab-ci.yml, .circleci/config.yml, bitbucket-pipelines.yml, azure-pipelines.yml');
    console.log('  • Build scripts: Makefile, Jenkinsfile, .travis.yml, buildspec.yml, taskfile.yml, .drone.yml');
    logger.newLine();

    logger.info('Sample Directory Handling:');
    console.log('  • services/samples/weather and apps/samples/enterprise-site are sample applications');
    console.log("  • They will be synced automatically if you haven't modified them");
    console.log('  • If you modify a sample, your changes will be preserved during sync');
    console.log("  • If you delete a sample, it won't be restored (you can remove samples you don't want)");
    console.log('  • This allows you to learn from samples while keeping your modifications');
    logger.newLine();

    logger.info('User Modification Handling:');
    console.log('  When you modify files outside protected areas, the sync command will:');
    console.log('  • Detect your modifications and show you what files are affected');
    console.log('  • Ask you what to do with each modified file:');
    console.log('    - Overwrite: Use the framework version (lose your changes)');
    console.log('    - Protect: Add the file to userProtectedAreas in .pika-sync.json');
    console.log('    - Skip: Skip this file for now (will be overwritten in future syncs)');
    console.log('    - Cancel: Cancel the sync operation');
    logger.newLine();

    logger.info('Best Practices:');
    console.log('  • Always place custom code in designated areas (custom- directories, protected areas)');
    console.log('  • Use pika-config.ts for project configuration (automatically protected)');
    console.log('  • Test your application after each sync to ensure everything works');
    console.log('  • Commit your changes to source control before syncing');
    console.log('  • Review the changes before applying them (use --dry-run or --diff or --visual-diff)');
    logger.newLine();

    logger.info('Sync Options:');
    console.log('  • --dry-run: Show what would be updated without applying changes');
    console.log('  • --diff: Show diffs for changed files');
    console.log('  • --visual-diff: Open diffs in your IDE visually (Cursor or VS Code)');
    console.log('  • --debug: Enable detailed debug logging');
    console.log('  • --branch: Sync from a specific branch');
    console.log('  • --version: Sync to a specific version (not implemented yet)');
    logger.newLine();

    logger.info('Configuration Files:');
    console.log('  • .pika-sync.json: Tracks sync status and user protection preferences');
    console.log('  • pika-config.ts: Project configuration (automatically protected)');
    console.log('  • Both files are protected from framework updates');
    logger.newLine();

    logger.info('Source Control Integration:');
    console.log('  • Your project is a complete, standalone repository');
    console.log('  • You can commit it to your own Git repository');
    console.log('  • The sync system works independently of your source control');
    console.log('  • Framework updates are applied to your local working directory');
    console.log('  • You control when and how to commit framework updates');
    logger.newLine();

    logger.info('Troubleshooting:');
    console.log('  • If sync fails, check your internet connection and GitHub access');
    console.log("  • Use --debug to see detailed information about what's happening");
    console.log('  • If you accidentally overwrite changes, check your Git history');
    console.log('  • Protected areas are never overwritten, so your core customizations are safe');
    logger.newLine();

    logger.info('Learn More:');
    console.log('  • Framework documentation: https://github.com/rithum/pika');
    console.log('  • Customization guide: ./docs/help/customization.md');
    console.log('  • Run "pika sync --help" for command-line options');
}
