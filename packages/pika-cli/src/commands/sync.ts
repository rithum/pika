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
import chalk from 'chalk';

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
    verbose?: boolean;
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
// This is defined in @pika/shared/src/types/chatbot/chatbot-types.ts
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
    action: 'overwrite' | 'protect' | 'skip' | 'cancel' | 'showDiff' | 'showVisualDiff';
}

interface PackageJsonDiff {
    addedAttributes: string[];
    removedAttributes: string[];
    modifiedAttributes: string[];
    addedScripts: string[];
    addedDependencies: string[];
    addedDevDependencies: string[];
    modifiedScripts: string[];
    modifiedDependencies: string[];
    modifiedDevDependencies: string[];
    // Change direction tracking
    frameworkOnlyChanges: string[];
    userOnlyChanges: string[];
    conflictingChanges: string[];
}

interface PackageJsonSyncResult {
    shouldSync: boolean;
    diff: PackageJsonDiff;
    mergedContent?: any;
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
            console.log(chalk.red.bold('WARNING: Found files outside protected areas (will be removed):'));
            filesOutsideProtectedAreas.forEach((file) => {
                console.log(chalk.red(`    - ${file}`));
            });

            console.log(chalk.gray('  Run `pika sync --help` to see list of protected areas and how to protect your changes.'));
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

async function comparePackageJsonFiles(pikaPath: string, forkPath: string): Promise<PackageJsonSyncResult> {
    try {
        const pikaContent = JSON.parse(await fileManager.readFile(pikaPath));
        const forkContent = JSON.parse(await fileManager.readFile(forkPath));

        const diff: PackageJsonDiff = {
            addedAttributes: [],
            removedAttributes: [],
            modifiedAttributes: [],
            addedScripts: [],
            addedDependencies: [],
            addedDevDependencies: [],
            modifiedScripts: [],
            modifiedDependencies: [],
            modifiedDevDependencies: [],
            frameworkOnlyChanges: [],
            userOnlyChanges: [],
            conflictingChanges: []
        };

        const allKeys = new Set([...Object.keys(pikaContent), ...Object.keys(forkContent)]);
        let hasChanges = false;

        for (const key of allKeys) {
            const pikaHasKey = key in pikaContent;
            const forkHasKey = key in forkContent;

            if (!pikaHasKey && forkHasKey) {
                // Fork has attribute that Pika doesn't - not a difference
                continue;
            }

            if (pikaHasKey && !forkHasKey) {
                // Pika has attribute that fork doesn't - add it
                diff.addedAttributes.push(key);
                hasChanges = true;
                continue;
            }

            if (pikaHasKey && forkHasKey) {
                // Both have the attribute - compare values
                if (key === 'scripts' || key === 'dependencies' || key === 'devDependencies') {
                    const result = compareObjectValues(pikaContent[key], forkContent[key], key);
                    if (result.hasChanges) {
                        hasChanges = true;
                        if (key === 'scripts') {
                            diff.addedScripts.push(...result.added);
                            diff.modifiedScripts.push(...result.modified);
                        } else if (key === 'dependencies') {
                            diff.addedDependencies.push(...result.added);
                            diff.modifiedDependencies.push(...result.modified);
                        } else if (key === 'devDependencies') {
                            diff.addedDevDependencies.push(...result.added);
                            diff.modifiedDevDependencies.push(...result.modified);
                        }
                    }
                } else {
                    // For non-special attributes, simple value comparison
                    if (JSON.stringify(pikaContent[key]) !== JSON.stringify(forkContent[key])) {
                        diff.modifiedAttributes.push(key);
                        hasChanges = true;
                    }
                }
            }
        }

        if (!hasChanges) {
            return { shouldSync: false, diff };
        }

        // Analyze change directions
        const frameworkOnlyChanges: string[] = [];
        const userOnlyChanges: string[] = [];
        const conflictingChanges: string[] = [];

        logger.debug(`[DEBUG] Analyzing change directions for package.json`);
        logger.debug(`[DEBUG] Added attributes: ${diff.addedAttributes.join(', ')}`);
        logger.debug(`[DEBUG] Modified attributes: ${diff.modifiedAttributes.join(', ')}`);
        logger.debug(`[DEBUG] Added scripts: ${diff.addedScripts.join(', ')}`);
        logger.debug(`[DEBUG] Modified scripts: ${diff.modifiedScripts.join(', ')}`);
        logger.debug(`[DEBUG] Added dependencies: ${diff.addedDependencies.join(', ')}`);
        logger.debug(`[DEBUG] Modified dependencies: ${diff.modifiedDependencies.join(', ')}`);
        logger.debug(`[DEBUG] Added devDependencies: ${diff.addedDevDependencies.join(', ')}`);
        logger.debug(`[DEBUG] Modified devDependencies: ${diff.modifiedDevDependencies.join(', ')}`);

        // Analyze attribute changes
        for (const attr of diff.addedAttributes) {
            frameworkOnlyChanges.push(`attribute:${attr}`);
        }

        for (const attr of diff.modifiedAttributes) {
            conflictingChanges.push(`attribute:${attr}`);
        }

        // Analyze script changes
        for (const script of diff.addedScripts) {
            frameworkOnlyChanges.push(`script:${script}`);
        }

        for (const script of diff.modifiedScripts) {
            conflictingChanges.push(`script:${script}`);
        }

        // Analyze dependency changes
        for (const dep of diff.addedDependencies) {
            frameworkOnlyChanges.push(`dependency:${dep}`);
        }

        for (const dep of diff.modifiedDependencies) {
            conflictingChanges.push(`dependency:${dep}`);
        }

        // Analyze devDependency changes
        for (const dep of diff.addedDevDependencies) {
            frameworkOnlyChanges.push(`devDependency:${dep}`);
        }

        for (const dep of diff.modifiedDevDependencies) {
            conflictingChanges.push(`devDependency:${dep}`);
        }

        logger.debug(`[DEBUG] Framework only changes: ${frameworkOnlyChanges.join(', ')}`);
        logger.debug(`[DEBUG] Conflicting changes: ${conflictingChanges.join(', ')}`);

        // Update diff with change directions
        diff.frameworkOnlyChanges = frameworkOnlyChanges;
        diff.userOnlyChanges = userOnlyChanges;
        diff.conflictingChanges = conflictingChanges;

        // Create merged content
        const mergedContent = { ...forkContent };

        // Add attributes that Pika has but fork doesn't
        for (const attr of diff.addedAttributes) {
            mergedContent[attr] = pikaContent[attr];
        }

        // Update modified attributes (except scripts, dependencies, devDependencies)
        for (const attr of diff.modifiedAttributes) {
            mergedContent[attr] = pikaContent[attr];
        }

        // Handle scripts, dependencies, and devDependencies
        if (pikaContent.scripts) {
            mergedContent.scripts = { ...forkContent.scripts, ...pikaContent.scripts };
        }
        if (pikaContent.dependencies) {
            mergedContent.dependencies = { ...forkContent.dependencies, ...pikaContent.dependencies };
        }
        if (pikaContent.devDependencies) {
            mergedContent.devDependencies = { ...forkContent.devDependencies, ...pikaContent.devDependencies };
        }

        return { shouldSync: true, diff, mergedContent };
    } catch (error) {
        logger.debug(`[DEBUG] comparePackageJsonFiles: Error comparing package.json files: ${error}`);
        // If we can't parse the JSON, treat as a regular file change
        return {
            shouldSync: true,
            diff: {
                addedAttributes: [],
                removedAttributes: [],
                modifiedAttributes: [],
                addedScripts: [],
                addedDependencies: [],
                addedDevDependencies: [],
                modifiedScripts: [],
                modifiedDependencies: [],
                modifiedDevDependencies: [],
                frameworkOnlyChanges: [],
                userOnlyChanges: [],
                conflictingChanges: []
            }
        };
    }
}

function compareObjectValues(pikaObj: any, forkObj: any, objType: string): { hasChanges: boolean; added: string[]; modified: string[] } {
    const added: string[] = [];
    const modified: string[] = [];
    let hasChanges = false;

    const allKeys = new Set([...Object.keys(pikaObj || {}), ...Object.keys(forkObj || {})]);

    for (const key of allKeys) {
        const pikaHasKey = pikaObj && key in pikaObj;
        const forkHasKey = forkObj && key in forkObj;

        if (!pikaHasKey && forkHasKey) {
            // Fork has key that Pika doesn't - not a difference
            continue;
        }

        if (pikaHasKey && !forkHasKey) {
            // Pika has key that fork doesn't - add it
            added.push(key);
            hasChanges = true;
            continue;
        }

        if (pikaHasKey && forkHasKey) {
            // Both have the key - compare values
            if (pikaObj[key] !== forkObj[key]) {
                modified.push(key);
                hasChanges = true;
            }
        }
    }

    return { hasChanges, added, modified };
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

        // Find Pika project root by walking up directories
        const projectRoot = await findPikaProjectRoot(process.cwd());
        if (!projectRoot) {
            console.log(chalk.red.bold('No Pika project found in current directory or any parent directories'));
            console.log(chalk.cyan('Run this command from a directory within a project created with `pika create-app`'));
            return;
        }

        // If we're not in the project root, inform the user
        if (projectRoot !== process.cwd()) {
            console.log(chalk.cyan(`Found Pika project in parent directory: ${projectRoot}`));
            console.log(chalk.cyan('Running sync from project root...'));
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

        // Show sync status (detailed or concise based on options)
        if (options.verbose) {
            showCurrentSyncStatus(syncConfig);
            showDetailedSyncInfo(syncConfig);
        } else {
            showConciseSyncStatus(syncConfig);
        }

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
                console.log(chalk.gray(`Syncing from branch:`), chalk.cyan(`${targetBranch}`), chalk.gray(`(explicitly specified)`));
            } else if (syncConfig.pikaBranch) {
                console.log(chalk.gray(`Syncing from branch:`), chalk.cyan(`${targetBranch}`), chalk.gray(`(last synced branch)`));
            } else {
                console.log(chalk.gray(`Syncing from branch:`), chalk.cyan(`${targetBranch}`), chalk.gray(`(default)`));
            }

            if (options.dryRun) {
                console.log(chalk.yellow('Dry run mode - showing what would be updated...'));
                console.log(chalk.reset(`Target: ${targetVersion} (branch: ${targetBranch})`));
                logger.newLine();
            }

            const spinner = logger.startSpinner('Preparing sync...');

            try {
                // Download latest Pika framework
                logger.updateSpinner(`Downloading Pika framework ${targetVersion} from branch ${targetBranch}...`);
                const tempDir = await downloadPikaFramework(targetVersion, targetBranch);
                logger.stopSpinner(true, 'Framework downloaded');

                // Immediately update protected areas from the downloaded framework
                const protectedAreasSpinner = logger.startSpinner('Updating protected areas from framework...');
                logger.debug(`[DEBUG] syncCommand: About to call updateProtectedAreasFromFramework`);
                const protectedAreasUpdated = await updateProtectedAreasFromFramework(tempDir, syncConfigPath, syncConfig);
                logger.debug(`[DEBUG] syncCommand: updateProtectedAreasFromFramework returned: ${protectedAreasUpdated}`);
                logger.stopSpinner(true, protectedAreasUpdated ? chalk.green.bold('Protected areas updated') : chalk.reset('Protected areas up to date'));

                // If protected areas were updated, refresh the merged protected areas
                if (protectedAreasUpdated) {
                    logger.debug(`[DEBUG] syncCommand: Protected areas were updated, refreshing merged protected areas`);
                    const updatedSyncConfig = JSON.parse(await fileManager.readFile(syncConfigPath));
                    logger.debug(`[DEBUG] syncCommand: Updated sync config: ${JSON.stringify(updatedSyncConfig, null, 2)}`);
                    protectedAreas.splice(0, protectedAreas.length, ...getMergedProtectedAreas(updatedSyncConfig));
                    logger.debug(`[DEBUG] syncCommand: Refreshed protected areas count: ${protectedAreas.length}`);
                } else {
                    logger.debug(`[DEBUG] syncCommand: Protected areas were not updated, using existing merged protected areas`);
                    logger.debug(`[DEBUG] syncCommand: Current protected areas count: ${protectedAreas.length}`);
                }

                // Compare files and identify changes
                console.log(); // Ensures a blank line after
                console.log(chalk.gray('Analyzing changes...'));
                const changes = await identifyChanges(tempDir, process.cwd(), protectedAreas);
                console.log(chalk.gray('Analysis complete'));
                console.log(); // Optional: another blank line for separation

                // Show detailed change information
                if (changes.length > 0) {
                    showDetailedChangeInfo(changes);
                }

                logger.debug(`[DEBUG] Total changes found: ${changes.length}`);

                if (changes.length === 0) {
                    console.log(chalk.green(chalk.bold('No updates available - your project is up to date!')));
                    await cleanupTempDir(tempDir);
                    return;
                }

                // If --diff flag is set, show diffs and exit
                if (options.diff) {
                    console.log(chalk.yellow('Showing diffs for changed files (no changes will be applied):'));
                    for (const change of changes) {
                        await showDiff(change);
                    }
                    await cleanupTempDir(tempDir);
                    return;
                }

                // If --visual-diff flag is set, open diffs in editor and exit
                if (options.visualDiff) {
                    console.log(chalk.yellow('Opening diffs in your editor (Cursor or VS Code)...'));
                    const editor = await detectEditor();
                    if (!editor) {
                        console.log(chalk.yellow('No supported editor (Cursor or VS Code) found in PATH. Falling back to terminal diff.'));
                        for (const change of changes) {
                            await showDiff(change);
                        }
                    } else {
                        for (const change of changes) {
                            await openVisualDiff(change, editor);
                        }
                        console.log(chalk.green('All diffs opened in your editor.'));
                    }
                    await cleanupTempDir(tempDir);
                    return;
                }

                // Show remaining changes
                if (changes.length > 0) {
                    const fileWord = changes.length === 1 ? 'file' : 'files';
                    console.log(chalk.cyan(`Found ${changes.length} ${fileWord} to update:`));
                    changes.forEach((change) => {
                        console.log(`  ${change.path}`);
                    });
                    logger.newLine();
                } else {
                    logger.success('No framework updates to apply!');
                    await cleanupTempDir(tempDir);
                    return;
                }

                if (options.dryRun) {
                    console.log(chalk.yellow('Dry run complete - no changes applied'));
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
                    console.log(chalk.red('Sync cancelled.'));
                    await cleanupTempDir(tempDir);
                    return;
                }

                // Apply changes
                const applySpinner = logger.startSpinner('Applying changes...');
                await applyChanges(changes, options);
                logger.stopSpinner(true, 'Changes applied');

                // Update sync config
                const configSpinner = logger.startSpinner('Updating sync configuration...');
                await updateSyncConfig(syncConfigPath, syncConfig, targetVersion, targetBranch);
                logger.stopSpinner(true, 'Configuration updated');

                // Cleanup
                await cleanupTempDir(tempDir);

                console.log();
                console.log(chalk.green.bold(`Sync complete from ${targetBranch}!`));
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

    // Compare framework files recursively (source -> target)
    await compareDirectories(sourcePath, targetPath, '', protectedAreas, changes);

    // Check for files that exist in target but not in source (deleted files)
    await findDeletedFiles(sourcePath, targetPath, '', protectedAreas, changes);

    logger.debug(`[DEBUG] identifyChanges: found ${changes.length} total changes`);
    return changes;
}

// async function identifyChanges(sourcePath: string, targetPath: string, protectedAreas: string[]): Promise<SyncChange[]> {
//     const changes: SyncChange[] = [];

//     logger.debug(`[DEBUG] identifyChanges: comparing source=${sourcePath} with target=${targetPath}`);
//     logger.debug(`[DEBUG] identifyChanges: protected areas count=${protectedAreas.length}`);

//     // First, detect user modifications in unprotected files
//     const userModifications = await detectUserModifications(sourcePath, targetPath, protectedAreas);
//     changes.push(...userModifications);

//     // Compare framework files recursively (source -> target)
//     await compareDirectories(sourcePath, targetPath, '', protectedAreas, changes);

//     // Check for files that exist in target but not in source (deleted files)
//     await findDeletedFiles(sourcePath, targetPath, '', protectedAreas, changes);

//     logger.debug(`[DEBUG] identifyChanges: found ${changes.length} total changes`);
//     return changes;
// }

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
            logger.debug(`[DEBUG] fileName: "${fileName}"`);

            // Special handling for package.json files during change detection
            logger.debug(`[DEBUG] Checking if ${relativeFilePath} is package.json: fileName="${fileName}", endsWith="${relativeFilePath.endsWith('/package.json')}"`);
            if (fileName === 'package.json' || relativeFilePath.endsWith('/package.json')) {
                logger.debug(`[DEBUG] Found package.json file: ${relativeFilePath}`);
                const { shouldSync, diff } = await comparePackageJsonFiles(sourceFilePath, targetFilePath);
                logger.debug(`[DEBUG] Package.json ${relativeFilePath} shouldSync: ${shouldSync}`);

                if (shouldSync) {
                    // Show package.json changes immediately during detection
                    console.log(chalk.cyan(`Package.json changes detected in ${relativeFilePath}:`));

                    if (diff.addedAttributes.length > 0) {
                        console.log(chalk.gray(`   • Added attributes: ${diff.addedAttributes.join(', ')}`));
                    }

                    if (diff.modifiedAttributes.length > 0) {
                        console.log(chalk.gray(`   • Modified attributes: ${diff.modifiedAttributes.join(', ')}`));
                    }

                    if (diff.addedScripts.length > 0) {
                        console.log(chalk.gray(`   • Added scripts: ${diff.addedScripts.join(', ')}`));
                    }

                    if (diff.modifiedScripts.length > 0) {
                        console.log(chalk.gray(`   • Modified scripts: ${diff.modifiedScripts.join(', ')}`));
                    }

                    if (diff.addedDependencies.length > 0) {
                        console.log(chalk.gray(`   • Added dependencies: ${diff.addedDependencies.join(', ')}`));
                    }

                    if (diff.modifiedDependencies.length > 0) {
                        console.log(chalk.gray(`   • Modified dependencies: ${diff.modifiedDependencies.join(', ')}`));
                    }

                    if (diff.addedDevDependencies.length > 0) {
                        console.log(chalk.gray(`   • Added devDependencies: ${diff.addedDevDependencies.join(', ')}`));
                    }

                    if (diff.modifiedDevDependencies.length > 0) {
                        console.log(chalk.gray(`   • Modified devDependencies: ${diff.modifiedDevDependencies.join(', ')}`));
                    }

                    // Show user's additions that will be preserved
                    const userAdditions = [...diff.addedScripts, ...diff.addedDependencies, ...diff.addedDevDependencies];
                    if (userAdditions.length > 0) {
                        console.log(chalk.gray(`   • Your additions will be preserved: ${userAdditions.join(', ')}`));
                    }

                    // Show change direction information
                    if (diff.frameworkOnlyChanges.length > 0) {
                        console.log(chalk.gray(`   • New from framework: ${diff.frameworkOnlyChanges.join(', ')}`));
                    }

                    if (diff.userOnlyChanges.length > 0) {
                        console.log(chalk.gray(`   • Your changes will be preserved: ${diff.userOnlyChanges.join(', ')}`));
                    }

                    if (diff.conflictingChanges.length > 0) {
                        console.log(chalk.red(`   • Your changes will be overwritten: ${diff.conflictingChanges.join(', ')}`));
                    }

                    const exists = await fileManager.exists(targetFilePath);
                    const changeType = exists ? 'modified' : 'added';

                    // Check if this file was already detected as a user modification
                    const alreadyDetected = changes.some((change) => change.path === relativeFilePath);
                    if (!alreadyDetected) {
                        logger.debug(`[DEBUG] Adding package.json change: ${changeType} - ${relativeFilePath}`);
                        changes.push({
                            type: changeType,
                            path: relativeFilePath,
                            sourcePath: sourceFilePath,
                            targetPath: targetFilePath
                        });
                    } else {
                        logger.debug(`[DEBUG] Skipping already detected package.json file: ${relativeFilePath}`);
                    }
                }
            } else {
                // Regular file comparison for non-package.json files
                logger.debug(`[DEBUG] Not a package.json file: ${relativeFilePath}`);
                const hasChanged = await fileHasChanged(sourceFilePath, targetFilePath);
                logger.debug(`[DEBUG] File ${relativeFilePath} has changed: ${hasChanged}`);
                if (hasChanged) {
                    const exists = await fileManager.exists(targetFilePath);
                    const changeType = exists ? 'modified' : 'added';

                    // Check if this file was already detected as a user modification
                    const alreadyDetected = changes.some((change) => change.path === relativeFilePath);
                    if (!alreadyDetected) {
                        logger.debug(`[DEBUG] Adding change: ${changeType} - ${relativeFilePath}`);
                        changes.push({
                            type: changeType,
                            path: relativeFilePath,
                            sourcePath: sourceFilePath,
                            targetPath: targetFilePath
                        });
                    } else {
                        logger.debug(`[DEBUG] Skipping already detected file: ${relativeFilePath}`);
                    }
                }
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
            // Directory protection (current behavior)
            return filePath.startsWith(area);
        } else if (area.includes('/')) {
            // Exact path protection (current behavior)
            return filePath === area;
        } else {
            // Simple filename protection (new gitignore-style behavior)
            const fileName = path.basename(filePath);
            return fileName === area;
        }
    });

    if (isProtected) {
        const matchingArea = protectedAreas.find((area) => {
            if (area.endsWith('/')) {
                return filePath.startsWith(area);
            } else if (area.includes('/')) {
                return filePath === area;
            } else {
                const fileName = path.basename(filePath);
                return fileName === area;
            }
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

        if (sourceContent === targetContent) {
            return false;
        }

        logger.debug(`[DEBUG] fileHasChanged: Content differs for ${path.basename(sourcePath)}`);
        logger.debug(`[DEBUG] fileHasChanged: Source length: ${sourceContent.length}, Target length: ${targetContent.length}`);

        const sourceNormalized = sourceContent.replace(/\r\n/g, '\n').trim();
        const targetNormalized = targetContent.replace(/\r\n/g, '\n').trim();

        if (sourceNormalized === targetNormalized) {
            logger.debug(`[DEBUG] fileHasChanged: Files are identical after normalizing line endings and trimming whitespace.`);
        } else {
            logger.debug(`[DEBUG] fileHasChanged: Files still differ after normalization.`);
        }

        if (process.env.PIKA_DEBUG === 'true') {
            try {
                const diff = await import('diff');
                const patch = diff.createPatch(path.basename(sourcePath), targetContent, sourceContent);
                logger.debug(`[DEBUG] fileHasChanged: Diff for ${path.basename(sourcePath)}:\n${patch}`);
            } catch (e) {
                logger.debug(`[DEBUG] fileHasChanged: Could not generate diff for ${path.basename(sourcePath)}`);
            }
        }

        return true;
    } catch (error) {
        logger.debug(`[DEBUG] fileHasChanged: Error comparing files: ${error}`);
        // Error reading files, assume changed
        return true;
    }
}

async function applyChanges(changes: SyncChange[], options: SyncOptions): Promise<void> {
    for (const change of changes) {
        logger.debug(`Applying ${change.type}: ${change.path}`);

        // Special handling for package.json files - merge instead of overwrite
        if (change.path.endsWith('package.json') && change.type === 'modified') {
            const { shouldSync, mergedContent } = await comparePackageJsonFiles(change.sourcePath, change.targetPath);

            if (shouldSync && mergedContent) {
                // Ensure target directory exists
                const targetDir = path.dirname(change.targetPath);
                await fileManager.ensureDir(targetDir);

                // Write the merged content
                await fileManager.writeFile(change.targetPath, JSON.stringify(mergedContent, null, 2));
                logger.debug(`Applied merged package.json changes to ${change.path}`);
            } else {
                logger.debug(`No package.json changes needed for ${change.path}`);
            }
            continue;
        }

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

async function updateProtectedAreasFromFramework(tempDir: string, syncConfigPath: string, syncConfig: SyncConfig): Promise<boolean> {
    try {
        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Starting with tempDir=${tempDir}`);
        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: syncConfigPath=${syncConfigPath}`);

        // Check if there's a protected-areas.json in the downloaded framework
        const frameworkProtectedAreasPath = path.join(tempDir, 'packages/pika-cli/src/config/protected-areas.json');
        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Looking for file at ${frameworkProtectedAreasPath}`);

        if (!existsSync(frameworkProtectedAreasPath)) {
            logger.debug('No protected-areas.json found in framework, skipping protected areas update');
            logger.debug(`[DEBUG] updateProtectedAreasFromFramework: File does not exist at ${frameworkProtectedAreasPath}`);

            // Let's check what's actually in the temp directory
            try {
                const { readdir } = await import('fs/promises');
                const tempContents = await readdir(tempDir);
                logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Temp directory contents: ${tempContents.join(', ')}`);

                if (tempContents.includes('packages')) {
                    const packagesContents = await readdir(path.join(tempDir, 'packages'));
                    logger.debug(`[DEBUG] updateProtectedAreasFromFramework: packages directory contents: ${packagesContents.join(', ')}`);

                    if (packagesContents.includes('pika-cli')) {
                        const cliContents = await readdir(path.join(tempDir, 'packages/pika-cli'));
                        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: pika-cli directory contents: ${cliContents.join(', ')}`);

                        if (cliContents.includes('src')) {
                            const srcContents = await readdir(path.join(tempDir, 'packages/pika-cli/src'));
                            logger.debug(`[DEBUG] updateProtectedAreasFromFramework: src directory contents: ${srcContents.join(', ')}`);

                            if (srcContents.includes('config')) {
                                const configContents = await readdir(path.join(tempDir, 'packages/pika-cli/src/config'));
                                logger.debug(`[DEBUG] updateProtectedAreasFromFramework: config directory contents: ${configContents.join(', ')}`);
                            }
                        }
                    }
                }
            } catch (error) {
                logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Error exploring temp directory: ${error}`);
            }

            return false;
        }

        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Found protected-areas.json file`);
        const frameworkProtectedAreas = JSON.parse(readFileSync(frameworkProtectedAreasPath, 'utf8'));
        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Parsed framework protected areas: ${JSON.stringify(frameworkProtectedAreas, null, 2)}`);

        // Compare with current protected areas
        const currentProtectedAreas = syncConfig.protectedAreas || [];
        const newProtectedAreas = frameworkProtectedAreas.defaultProtectedAreas || [];

        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Current protected areas count: ${currentProtectedAreas.length}`);
        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: New protected areas count: ${newProtectedAreas.length}`);
        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Current protected areas: ${JSON.stringify(currentProtectedAreas)}`);
        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: New protected areas: ${JSON.stringify(newProtectedAreas)}`);

        // Check if they're different
        const currentSorted = currentProtectedAreas.sort();
        const newSorted = newProtectedAreas.sort();
        const areasChanged = JSON.stringify(currentSorted) !== JSON.stringify(newSorted);

        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Areas changed: ${areasChanged}`);
        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Current sorted: ${JSON.stringify(currentSorted)}`);
        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: New sorted: ${JSON.stringify(newSorted)}`);

        if (areasChanged) {
            logger.info('📋 Found updated protected areas list from framework');
            logger.info(`   • Current: ${currentProtectedAreas.length} protected areas`);
            logger.info(`   • New: ${newProtectedAreas.length} protected areas`);

            // Show what's being added/removed
            const added = newProtectedAreas.filter((area: string) => !currentProtectedAreas.includes(area));
            const removed = currentProtectedAreas.filter((area: string) => !newProtectedAreas.includes(area));

            logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Added areas: ${JSON.stringify(added)}`);
            logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Removed areas: ${JSON.stringify(removed)}`);

            if (added.length > 0) {
                logger.info('   • Added protected areas:');
                added.forEach((area: string) => logger.info(`     + ${area}`));
            }

            if (removed.length > 0) {
                logger.info('   • Removed protected areas:');
                removed.forEach((area: string) => logger.info(`     - ${area}`));
            }

            // Update the sync config with new protected areas
            logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Updating syncConfig.protectedAreas`);
            syncConfig.protectedAreas = newProtectedAreas;

            // Save the updated config
            logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Writing updated config to ${syncConfigPath}`);
            const updatedConfigJson = JSON.stringify(syncConfig, null, 2);
            logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Updated config JSON: ${updatedConfigJson}`);
            await fileManager.writeFile(syncConfigPath, updatedConfigJson);

            logger.success('Protected areas updated successfully');
            return true;
        } else {
            logger.debug('Protected areas are up to date');
            return false;
        }
    } catch (error) {
        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Error occurred: ${error}`);
        logger.debug(`[DEBUG] updateProtectedAreasFromFramework: Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
        return false;
    }
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

function getDefaultProtectedAreas(): string[] {
    try {
        // Try to load from the centralized config file
        const configPath = path.join(__dirname, '../config/protected-areas.json');
        if (existsSync(configPath)) {
            const config = JSON.parse(readFileSync(configPath, 'utf8'));
            return config.defaultProtectedAreas || [];
        }
    } catch (error) {
        logger.debug('Failed to load protected areas config, using fallback:', error);
    }

    // Fallback to hardcoded list if config file is not available
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
        'pnpm-lock.yaml', // Always protect pnpm-lock.yaml
        'cdk.context.json', // Always protect CDK-generated context file
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
        '.drone.yml', // Drone CI
        'README.md', // README file
        'readme.md', // README file
        'README-pika.md', // The original README file from the framework
        'CODEOWNERS', // CODEOWNERS file
        'CONTRIBUTING.md', // CONTRIBUTING file
        'apps/pika-chat/src/routes/(noauth)/auth/client-auth/+page.server.ts', // Client auth page that they may customize to implement client side auth
        'apps/pika-chat/src/routes/(noauth)/auth/client-auth/+page.svelte', // Client auth page that they may customize to implement client side auth
        'apps/pika-chat/src/routes/(noauth)/logout/+page.svelte' // Allows for client-side logout
    ];
}

async function showDiff(change: SyncChange): Promise<void> {
    if (change.type === 'modified') {
        // Try to use git diff --no-index for best UX
        try {
            const { stdout } = await execAsync(`git diff --no-index --color "${change.targetPath}" "${change.sourcePath}"`);
            if (stdout.trim()) {
                console.log(chalk.bold('--- ' + change.targetPath));
                console.log(chalk.bold('+++ ' + change.sourcePath));
                console.log(stdout);
            } else {
                console.log(chalk.green('No visible diff for ' + change.path));
            }
        } catch (e) {
            // Fallback: simple inline diff
            await showSimpleDiff(change.targetPath, change.sourcePath, change.path);
        }
    } else if (change.type === 'added') {
        const fs = await import('fs/promises');
        const content = await fs.readFile(change.sourcePath, 'utf8');
        console.log(chalk.cyan.bold('Added: ' + change.path));
        console.log(chalk.gray('--- New file content: ---'));
        console.log(content);
    } else if (change.type === 'deleted') {
        const fs = await import('fs/promises');
        if (await fileManager.exists(change.targetPath)) {
            const content = await fs.readFile(change.targetPath, 'utf8');
            console.log(chalk.yellow.bold('Deleted: ' + change.path));
            console.log(chalk.gray('--- Deleted file content: ---'));
            console.log(content);
        } else {
            console.log(chalk.yellow.bold('Deleted: ' + change.path));
            console.log(chalk.gray('--- File already missing locally ---'));
        }
    }
}

async function showSimpleDiff(fileA: string, fileB: string, label: string): Promise<void> {
    const fs = await import('fs/promises');
    try {
        const [a, b] = await Promise.all([fs.readFile(fileA, 'utf8'), fs.readFile(fileB, 'utf8')]);
        const diff = await import('diff');
        const changes = diff.createPatch(label, a, b);
        console.log(chalk.yellow(changes));
    } catch (e) {
        console.log(chalk.red('Could not show diff for ' + label));
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
    console.log(chalk.bold.underline('Current sync status:'));
    console.log(chalk.reset(`  • Pika version: ${syncConfig.pikaVersion}`));
    console.log(chalk.reset(`  • Last sync: ${new Date(syncConfig.lastSync).toLocaleString()}`));
    console.log(chalk.reset(`  • Last synced branch: ${syncConfig.pikaBranch || 'main (default)'}`));
    console.log(chalk.reset(`  • Default protected areas: ${syncConfig.protectedAreas.length} directories/files protected`));
    console.log(chalk.gray(`  • Custom- protection: Any path segment starting with "custom-" is automatically protected`));
    if (syncConfig.userProtectedAreas && syncConfig.userProtectedAreas.length > 0) {
        console.log(chalk.reset(`  • User protected areas: ${syncConfig.userProtectedAreas.length} additional areas protected`));
    } else {
        console.log(chalk.gray(`  • User protected areas: None configured`));
    }
    if (syncConfig.userUnprotectedAreas && syncConfig.userUnprotectedAreas.length > 0) {
        console.log(chalk.reset(`  • User unprotected areas: ${syncConfig.userUnprotectedAreas.length} areas allowed to sync`));
    } else {
        console.log(chalk.gray(`  • User unprotected areas: None configured`));
    }
    logger.newLine();
}

function showConciseSyncStatus(syncConfig: SyncConfig): void {
    logger.newLine();
    console.log(chalk.bold.underline('Current sync status:'));
    console.log(chalk.reset(`  • Pika version: ${syncConfig.pikaVersion}`));
    console.log(chalk.reset(`  • Last sync: ${new Date(syncConfig.lastSync).toLocaleString()}`));
    console.log(chalk.reset(`  • Last synced branch: ${syncConfig.pikaBranch || 'main (default)'}`));
    console.log(chalk.reset(`  • Protected areas: ${syncConfig.protectedAreas.length} directories/files protected`));
    if (syncConfig.userProtectedAreas && syncConfig.userProtectedAreas.length > 0) {
        console.log(chalk.reset(`  • User protected areas: ${syncConfig.userProtectedAreas.length} additional areas`));
    }
    if (syncConfig.userUnprotectedAreas && syncConfig.userUnprotectedAreas.length > 0) {
        console.log(chalk.reset(`  • User unprotected areas: ${syncConfig.userUnprotectedAreas.length} areas allowed to sync`));
    }
    logger.newLine();
}

function showDetailedSyncInfo(syncConfig: SyncConfig): void {
    logger.newLine();
    console.log(chalk.bold('Configuration:'));
    console.log(chalk.gray('  • Edit .pika-sync.json to customize protection behavior'));
    console.log(chalk.gray('  • Add files to userProtectedAreas to protect them from framework updates'));
    console.log(chalk.gray('  • Add files to userUnprotectedAreas to allow framework updates to overwrite them'));
    console.log(chalk.gray('  • Files with "custom-" in their path are automatically protected'));
    logger.newLine();

    console.log(chalk.bold('Default Protected Areas:'));
    const defaultProtectedAreas = getDefaultProtectedAreas();
    defaultProtectedAreas.forEach((area) => {
        console.log(chalk.gray(`  • ${area}`));
    });
    logger.newLine();

    console.log(chalk.bold('Sample Directory Handling:'));
    console.log(chalk.gray('  • services/samples/weather and apps/samples/enterprise-site are sample applications'));
    console.log(chalk.gray("  • They will be synced automatically if you haven't modified them"));
    console.log(chalk.gray('  • If you modify a sample, your changes will be preserved during sync'));
    console.log(chalk.gray("  • If you delete a sample, it won't be restored (you can remove samples you don't want)"));
    console.log(chalk.gray('  • This allows you to learn from samples while keeping your modifications'));
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
 * Shows detailed information about the changes that will be applied.
 */
function showDetailedChangeInfo(changes: SyncChange[]): void {
    console.log();
    console.log(chalk.bold('Detailed change information:'));

    console.log();

    // Group changes by type
    const added = changes.filter((c) => c.type === 'added');
    const modified = changes.filter((c) => c.type === 'modified');
    const deleted = changes.filter((c) => c.type === 'deleted');

    // Show deleted files
    if (deleted.length > 0) {
        console.log(chalk.red.bold('Files to be deleted:'));
        deleted.forEach((change) => {
            console.log(chalk.red(`  - ${change.path} (not in Pika)`));
        });
        console.log();
    }

    // Show added files
    if (added.length > 0) {
        console.log(chalk.cyan.bold('New files from Pika:'));
        added.forEach((change) => {
            console.log(chalk.cyan(`  - ${change.path}`));
        });
        console.log();
    }

    // Show modified files
    if (modified.length > 0) {
        console.log(chalk.yellow.bold('Files to be updated from Pika:'));
        modified.forEach((change) => {
            if (change.path.endsWith('package.json')) {
                console.log(chalk.yellow(`  - ${change.path} (see package.json changes above)`));
            } else {
                console.log(chalk.yellow(`  - ${change.path} (your changes will be overwritten)`));
            }
        });
        console.log();
    }
}

/**
 * Shows comprehensive help information about the Pika sync system.
 */
function showSyncHelp(): void {
    console.log();
    console.log(chalk.bold.underline('Pika Framework - Sync System Help'));
    console.log();

    console.log(chalk.bold('Overview:'));
    console.log(chalk.gray('  Your Pika project is a fork of the Pika framework that you can check into your own source control.'));
    console.log(chalk.gray('  You can continue to receive updates from the Pika framework repository while preserving your customizations.'));
    console.log(chalk.gray('  The sync system intelligently merges framework updates with your changes.'));
    console.log();

    console.log(chalk.bold('How It Works:'));
    console.log(chalk.gray('  1. The sync command downloads the latest Pika framework from GitHub'));
    console.log(chalk.gray('  2. It compares your project with the framework to identify changes'));
    console.log(chalk.gray('  3. It applies framework updates while preserving your customizations'));
    console.log(chalk.gray('  4. It handles conflicts by asking you how to resolve them'));
    console.log();

    console.log(chalk.bold('Protection System:'));
    console.log(chalk.gray('  The sync system uses multiple layers of protection to preserve your work:'));
    console.log(chalk.gray('  • Default protected areas: Core customization directories and config files'));
    console.log(chalk.gray('  • Custom- protection: Any path segment starting with "custom-" is automatically protected'));
    console.log(chalk.gray('  • User protected areas: Additional areas you specify in .pika-sync.json'));
    console.log(chalk.gray('  • User unprotected areas: Areas you explicitly allow to sync in .pika-sync.json'));
    console.log();

    console.log(chalk.bold('Configuration via .pika-sync.json:'));
    console.log(chalk.gray('  You can customize sync behavior by editing .pika-sync.json:'));
    console.log(chalk.gray('  • userProtectedAreas: Add files/directories to protect from framework updates'));
    console.log(chalk.gray('  • userUnprotectedAreas: Remove files/directories from default protection'));
    console.log(chalk.gray('  • Example: Add "my-custom-file.ts" to userProtectedAreas to protect it'));
    console.log(chalk.gray('  • Remember that any path segment starting with "custom-" is automatically protected'));
    console.log();

    console.log(chalk.bold('Default Protected Areas:'));
    getDefaultProtectedAreas().forEach((area) => {
        console.log(chalk.gray(`  • ${area}`));
    });
    console.log();

    console.log(chalk.bold('Sample Directory Handling:'));
    console.log(chalk.gray('  • services/samples/weather and apps/samples/enterprise-site are sample applications'));
    console.log(chalk.gray("  • They will be synced automatically if you haven't modified them"));
    console.log(chalk.gray('  • If you modify a sample, your changes will be preserved during sync'));
    console.log(chalk.gray("  • If you delete a sample, it won't be restored (you can remove samples you don't want)"));
    console.log(chalk.gray('  • This allows you to learn from samples while keeping your modifications'));
    console.log();

    console.log(chalk.bold('User Modification Handling:'));
    console.log(chalk.gray('  When you modify files outside protected areas, the sync command will:'));
    console.log(chalk.gray('  • Detect your modifications and show you what files are affected'));
    console.log(chalk.gray('  • Ask you what to do with each modified file:'));
    console.log(chalk.gray('    - Overwrite: Use the framework version (lose your changes)'));
    console.log(chalk.gray('    - Protect: Add the file to userProtectedAreas in .pika-sync.json'));
    console.log(chalk.gray('    - Skip: Skip this file for now (will be overwritten in future syncs)'));
    console.log(chalk.gray('    - Cancel: Cancel the sync operation'));
    console.log();

    console.log(chalk.bold('Best Practices:'));
    console.log(chalk.gray('  • Always place custom code in designated areas (custom- directories, protected areas)'));
    console.log(chalk.gray('  • Use pika-config.ts for project configuration (automatically protected)'));
    console.log(chalk.gray('  • Test your application after each sync to ensure everything works'));
    console.log(chalk.gray('  • Commit your changes to source control before syncing'));
    console.log(chalk.gray('  • Review the changes before applying them (use --dry-run or --diff or --visual-diff)'));
    console.log();

    console.log(chalk.bold('Sync Options:'));
    console.log(chalk.gray('  • --dry-run: Show what would be updated without applying changes'));
    console.log(chalk.gray('  • --diff: Show diffs for changed files'));
    console.log(chalk.gray('  • --visual-diff: Open diffs in your IDE visually (Cursor or VS Code)'));
    console.log(chalk.gray('  • --debug: Enable detailed debug logging'));
    console.log(chalk.gray('  • --verbose: Show detailed sync information and configuration'));
    console.log(chalk.gray('  • --branch: Sync from a specific branch'));
    console.log(chalk.gray('  • --version: Sync to a specific version (not implemented yet)'));
    console.log();

    console.log(chalk.bold('Configuration Files:'));
    console.log(chalk.gray('  • .pika-sync.json: Tracks sync status and user protection preferences'));
    console.log(chalk.gray('  • pika-config.ts: Project configuration (automatically protected)'));
    console.log(chalk.gray('  • Both files are protected from framework updates'));
    console.log();

    console.log(chalk.bold('Source Control Integration:'));
    console.log(chalk.gray('  • Your project is a complete, standalone repository'));
    console.log(chalk.gray('  • You can commit it to your own Git repository'));
    console.log(chalk.gray('  • The sync system works independently of your source control'));
    console.log(chalk.gray('  • Framework updates are applied to your local working directory'));
    console.log(chalk.gray('  • You control when and how to commit framework updates'));
    console.log();

    console.log(chalk.bold('Troubleshooting:'));
    console.log(chalk.gray('  • If sync fails, check your internet connection and GitHub access'));
    console.log(chalk.gray("  • Use --debug to see detailed information about what's happening"));
    console.log(chalk.gray('  • If you accidentally overwrite changes, check your Git history'));
    console.log(chalk.gray('  • Protected areas are never overwritten, so your core customizations are safe'));
    console.log();

    console.log(chalk.bold('Learn More:'));
    console.log(chalk.gray('  • Framework documentation: https://github.com/rithum/pika'));
    console.log(chalk.gray('  • Customization guide: ./docs/help/customization.md'));
    console.log(chalk.gray('  • Run "pika sync --help" for command-line options'));
}
