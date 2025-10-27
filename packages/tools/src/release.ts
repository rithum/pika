#!/usr/bin/env tsx
/**
 * Pika Framework Release Tool
 *
 * Professional CLI tool for managing releases with Cursor AI integration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import clipboardy from 'clipboardy';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ReleaseMetadata {
    latestVersion: string;
    currentDevelopment: string;
    releases: Array<{
        version: string;
        date: string;
        status: 'released' | 'unreleased';
        breaking: boolean;
        summary: string;
        highlights?: string[];
        migrationGuideUrl?: string;
        requiresManualSteps?: boolean;
        affectedComponents?: string[];
    }>;
}

// ============================================================================
// Utility Functions
// ============================================================================

function getProjectRoot(): string {
    // From packages/tools, go up two levels to project root
    return path.join(process.cwd(), '..', '..');
}

function getReleasesPath(): string {
    return path.join(getProjectRoot(), 'releases.json');
}

/**
 * Load and parse prompt templates from release-prompt.md
 */
function loadPromptTemplates(): Map<string, string> {
    const promptPath = path.join(__dirname, 'release-prompt.md');
    const content = readFileSync(promptPath, 'utf8');
    const templates = new Map<string, string>();

    // Split by ## headers to get each prompt section
    const sections = content.split(/^## /gm).filter((s) => s.trim());

    for (const section of sections) {
        const lines = section.split('\n');
        const name = lines[0].trim();

        // Find the content between ``` markers
        const startIdx = section.indexOf('```\n');
        const endIdx = section.lastIndexOf('\n```');

        if (startIdx !== -1 && endIdx !== -1) {
            const template = section.substring(startIdx + 4, endIdx);
            templates.set(name, template);
        }
    }

    return templates;
}

/**
 * Replace template variables in a prompt
 */
function replacePromptVariables(template: string, variables: { [key: string]: string }): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(regex, value);
    }
    // Unescape backticks that are escaped in the markdown file
    result = result.replace(/\\`/g, '`');
    return result;
}

/**
 * Get the appropriate prompt based on the scenario
 */
function getPrompt(options: { baseBranch: string; workingVersion?: string; existingVersion?: string; finalizeVersion?: string; addToUnpublishedVersion?: boolean }): string {
    const templates = loadPromptTemplates();
    const currentDate = new Date().toISOString().split('T')[0];

    let templateName: string;
    const variables: { [key: string]: string } = {
        baseBranch: options.baseBranch,
        currentDate
    };

    if (options.existingVersion) {
        templateName = 'PROMPT_EXISTING_VERSION';
        variables.existingVersion = options.existingVersion;
    } else if (options.addToUnpublishedVersion && options.finalizeVersion) {
        templateName = 'PROMPT_UNPUBLISHED_VERSION';
        variables.finalizeVersion = options.finalizeVersion;
    } else if (options.finalizeVersion) {
        templateName = 'PROMPT_FINALIZE';
        variables.finalizeVersion = options.finalizeVersion;
    } else if (options.workingVersion) {
        templateName = 'PROMPT_INCREMENTAL';
        variables.workingVersion = options.workingVersion;
    } else {
        templateName = 'PROMPT_INCREMENTAL';
    }

    const template = templates.get(templateName);
    if (!template) {
        throw new Error(`Prompt template "${templateName}" not found`);
    }

    return replacePromptVariables(template, variables);
}

/**
 * Load releases.json from main branch (source of truth for what's actually released)
 * Falls back to 0.4.0 baseline if main doesn't have the file
 */
function loadReleasesJsonFromMain(): ReleaseMetadata {
    try {
        // Try to read from main branch
        const mainContent = execSync('git show main:releases.json 2>/dev/null', { encoding: 'utf8' });
        return JSON.parse(mainContent);
    } catch (error) {
        // Main doesn't have releases.json, use baseline
        return {
            latestVersion: '0.4.0',
            currentDevelopment: '0.5.0',
            releases: [
                {
                    version: '0.4.0',
                    date: new Date().toISOString().split('T')[0],
                    status: 'released',
                    breaking: false,
                    summary: 'Baseline release (pre-versioning)'
                }
            ]
        };
    }
}

/**
 * Load releases.json from working directory (may include unreleased versions)
 */
function loadReleasesJson(): ReleaseMetadata {
    const releasesPath = getReleasesPath();

    if (!existsSync(releasesPath)) {
        console.log(chalk.yellow('⚠ No releases.json found, creating with baseline version 0.4.0'));
        const baseline: ReleaseMetadata = {
            latestVersion: '0.4.0',
            currentDevelopment: '0.5.0',
            releases: [
                {
                    version: '0.4.0',
                    date: new Date().toISOString().split('T')[0],
                    status: 'released',
                    breaking: false,
                    summary: 'Baseline release (pre-versioning)'
                }
            ]
        };
        saveReleasesJson(baseline);
        return baseline;
    }

    try {
        return JSON.parse(readFileSync(releasesPath, 'utf8'));
    } catch (error) {
        console.error(chalk.red('✗ Error parsing releases.json:'), error);
        process.exit(1);
    }
}

function saveReleasesJson(data: ReleaseMetadata): void {
    const releasesPath = getReleasesPath();
    writeFileSync(releasesPath, JSON.stringify(data, null, 2) + '\n');
}

function exec(command: string, options: { silent?: boolean } = {}): string {
    try {
        return execSync(command, { encoding: 'utf8', stdio: options.silent ? 'pipe' : 'inherit' });
    } catch (error) {
        throw new Error(`Command failed: ${command}`);
    }
}

function validateVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+$/.test(version);
}

function incrementVersion(version: string, type: 'major' | 'minor' | 'patch' = 'patch'): string {
    const parts = version.split('.').map(Number);
    if (type === 'major') {
        // In 0.x, major changes bump minor (0.5.0 -> 0.6.0)
        // After 1.0, major changes bump major (1.0.0 -> 2.0.0)
        if (parts[0] === 0) {
            parts[1]++;
            parts[2] = 0;
        } else {
            parts[0]++;
            parts[1] = 0;
            parts[2] = 0;
        }
    } else if (type === 'minor') {
        // In 0.x, minor is same as major
        // After 1.0, minor bumps middle number
        if (parts[0] === 0) {
            parts[1]++;
            parts[2] = 0;
        } else {
            parts[1]++;
            parts[2] = 0;
        }
    } else {
        parts[2]++;
    }
    return parts.join('.');
}

/**
 * Detect version bump type from git branch name
 *
 * Supported prefixes:
 * - major: breaking/, major/
 * - minor: feat/, feature/
 * - patch: fix/, chore/, docs/, refactor/, test/, build/, ci/, perf/
 */
function detectVersionBumpFromBranch(): 'major' | 'minor' | 'patch' | null {
    try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        console.log(chalk.dim(`Current branch: ${chalk.cyan(branch)}`));

        // breaking/* or major/* -> major version bump
        if (branch.startsWith('breaking/') || branch.startsWith('major/')) {
            console.log(chalk.yellow(`Detected ${chalk.bold('major')} version bump from branch name`));
            return 'major';
        }

        // feat/* or feature/* -> minor version bump
        if (branch.startsWith('feat/') || branch.startsWith('feature/')) {
            console.log(chalk.cyan(`Detected ${chalk.bold('minor')} version bump from branch name`));
            return 'minor';
        }

        // fix/*, chore/*, docs/*, refactor/*, test/*, build/*, ci/*, perf/* -> patch version bump
        const patchPrefixes = ['fix/', 'chore/', 'docs/', 'refactor/', 'test/', 'build/', 'ci/', 'perf/'];
        if (patchPrefixes.some((prefix) => branch.startsWith(prefix))) {
            console.log(chalk.green(`Detected ${chalk.bold('patch')} version bump from branch name`));
            return 'patch';
        }

        // No recognized prefix
        console.log(chalk.yellow('\n⚠ Branch name does not use a standard prefix'));
        console.log(chalk.dim('Supported prefixes:'));
        console.log(chalk.dim('  • breaking/ or major/ → major version bump (breaking changes)'));
        console.log(chalk.dim('  • feat/ or feature/ → minor version bump (new features)'));
        console.log(chalk.dim('  • fix/, chore/, docs/, refactor/, test/, build/, ci/, perf/ → patch version bump'));
        console.log(chalk.yellow('\nYou will be prompted to choose the version bump type.\n'));
        return null;
    } catch {
        return null;
    }
}

/**
 * Ensure there's an unreleased version in releases.json
 * Creates one if it doesn't exist, returns existing if it does
 * Uses main branch as source of truth for baseline version
 */
async function ensureUnreleasedVersion(): Promise<string> {
    const releases = loadReleasesJson();
    const mainReleases = loadReleasesJsonFromMain();

    // Check if there's already an unreleased version in working copy
    const unreleased = releases.releases.find((r) => r.status === 'unreleased');
    if (unreleased) {
        console.log(chalk.cyan(`Using existing unreleased version: ${chalk.bold(unreleased.version)}\n`));
        return unreleased.version;
    }

    // No unreleased version, create one based on main's latest
    console.log(chalk.yellow('No unreleased version found, creating one...\n'));
    console.log(chalk.dim(`Latest in main: ${mainReleases.latestVersion}\n`));

    const newVersion = await promptForVersion();

    // Detect if it's a breaking change from branch name
    const bumpType = detectVersionBumpFromBranch();
    const isBreaking = bumpType === 'major';

    // Create new unreleased entry
    releases.releases.unshift({
        version: newVersion,
        date: 'TBD',
        status: 'unreleased',
        breaking: isBreaking,
        summary: `Version ${newVersion} (in development)`,
        highlights: []
    });

    // Update currentDevelopment
    releases.currentDevelopment = newVersion;

    saveReleasesJson(releases);
    console.log(chalk.green(`✓ Created unreleased version ${newVersion} in releases.json\n`));

    return newVersion;
}

async function promptForVersion(autoDetect: boolean = true): Promise<string> {
    // Get current version from main branch (source of truth)
    const mainReleases = loadReleasesJsonFromMain();
    const currentVersion = mainReleases.latestVersion || '0.4.0';

    // Check if there's already an unreleased version in working copy
    let unreleasedVersion: string | null = null;
    try {
        const releases = loadReleasesJson();
        const unreleased = releases.releases.find((r) => r.status === 'unreleased');
        if (unreleased) {
            unreleasedVersion = unreleased.version;
        }
    } catch (error) {
        // Working copy doesn't have releases.json, that's fine
    }

    // If there's an unreleased version, use that
    if (unreleasedVersion) {
        console.log(chalk.cyan(`Found unreleased version: ${chalk.bold(unreleasedVersion)}`));
        const { useExisting } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'useExisting',
                message: `Continue working on version ${unreleasedVersion}?`,
                default: true
            }
        ]);

        if (useExisting) {
            return unreleasedVersion;
        }
    }

    console.log(chalk.cyan(`Latest released version: ${chalk.bold(currentVersion)}\n`));

    // Try to auto-detect from branch name
    let suggestedType: 'major' | 'minor' | 'patch' | null = null;
    if (autoDetect) {
        suggestedType = detectVersionBumpFromBranch();
    }

    const suggestedPatch = incrementVersion(currentVersion, 'patch');
    const suggestedMinor = incrementVersion(currentVersion, 'minor');
    const suggestedMajor = incrementVersion(currentVersion, 'major');

    // Build choices with auto-detected default
    const choices = [
        { name: `${suggestedPatch} (patch - bug fixes)`, value: suggestedPatch },
        { name: `${suggestedMinor} (minor - new features)`, value: suggestedMinor },
        { name: `${suggestedMajor} (major - breaking changes)`, value: suggestedMajor },
        { name: 'Enter custom version', value: 'custom' }
    ];

    let defaultChoice = suggestedPatch;
    if (suggestedType === 'major') {
        defaultChoice = suggestedMajor;
    } else if (suggestedType === 'minor') {
        defaultChoice = suggestedMinor;
    } else if (suggestedType === 'patch') {
        defaultChoice = suggestedPatch;
    }

    const { versionChoice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'versionChoice',
            message: 'What version are you working on?',
            choices,
            default: defaultChoice
        }
    ]);

    if (versionChoice === 'custom') {
        const { customVersion } = await inquirer.prompt([
            {
                type: 'input',
                name: 'customVersion',
                message: 'Enter version (e.g., 0.5.0):',
                validate: (input: string) => {
                    if (validateVersion(input)) {
                        return true;
                    }
                    return 'Please enter a valid semantic version (e.g., 0.5.0)';
                }
            }
        ]);
        return customVersion;
    }

    return versionChoice;
}

function checkUncommittedChanges(): boolean {
    try {
        const status = execSync('git status --porcelain', { encoding: 'utf8' });
        return status.trim().length > 0;
    } catch {
        return false;
    }
}

function getLastTag(): string | null {
    try {
        const tag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""', {
            encoding: 'utf8'
        }).trim();
        return tag || null;
    } catch {
        return null;
    }
}

function getCommitsSinceTag(tag: string | null): string {
    try {
        if (tag) {
            return execSync(`git log ${tag}..HEAD --oneline --no-decorate`, { encoding: 'utf8' });
        } else {
            return execSync('git log --oneline --no-decorate', { encoding: 'utf8' });
        }
    } catch {
        return '';
    }
}

/**
 * Check if a git tag exists locally or remotely
 */
function checkTagExists(version: string): { local: boolean; remote: boolean } {
    const tag = `v${version}`;
    let local = false;
    let remote = false;

    try {
        execSync(`git rev-parse ${tag} 2>/dev/null`, { encoding: 'utf8' });
        local = true;
    } catch {
        local = false;
    }

    try {
        execSync(`git ls-remote --tags origin ${tag} 2>/dev/null`, { encoding: 'utf8' });
        remote = true;
    } catch {
        remote = false;
    }

    return { local, remote };
}

interface DeploymentState {
    version: string;
    inMainReleases: boolean;
    markedAsReleased: boolean;
    hasLocalTag: boolean;
    hasRemoteTag: boolean;
    issues: string[];
}

/**
 * Verify deployment state consistency
 * Checks that releases.json in main is consistent with git tags
 */
function verifyDeploymentState(version: string): DeploymentState {
    const issues: string[] = [];
    const mainReleases = loadReleasesJsonFromMain();

    // Check if version exists in main's releases.json
    const releaseEntry = mainReleases.releases.find((r) => r.version === version);
    const inMainReleases = !!releaseEntry;
    const markedAsReleased = releaseEntry?.status === 'released';

    // Check tags
    const { local: hasLocalTag, remote: hasRemoteTag } = checkTagExists(version);

    // Validate consistency
    if (!inMainReleases) {
        issues.push(`Version ${version} not found in main branch releases.json`);
    } else if (!markedAsReleased) {
        issues.push(`Version ${version} in main has status "${releaseEntry?.status}" (expected "released")`);
    }

    if (markedAsReleased && !hasLocalTag) {
        issues.push(`Version ${version} marked as released but no local tag v${version} exists`);
    }

    if (markedAsReleased && !hasRemoteTag) {
        issues.push(`Version ${version} marked as released but no remote tag v${version} exists (not pushed?)`);
    }

    if (hasRemoteTag && !markedAsReleased) {
        issues.push(`Tag v${version} exists remotely but version not marked as released in main's releases.json`);
    }

    return {
        version,
        inMainReleases,
        markedAsReleased,
        hasLocalTag,
        hasRemoteTag,
        issues
    };
}

// ============================================================================
// Release Command
// ============================================================================

async function publishRelease(versionArg: string | undefined, options: { dryRun?: boolean }): Promise<void> {
    const { dryRun = false } = options;

    console.log(chalk.bold('\n╔════════════════════════════════════════╗'));
    console.log(chalk.bold('║   🚀 Pika Framework Release Tool      ║'));
    console.log(chalk.bold('╚════════════════════════════════════════╝\n'));

    if (dryRun) {
        console.log(chalk.cyan('DRY RUN MODE - No changes will be made\n'));
    }

    // Auto-detect version if not provided
    let version = versionArg;
    if (!version) {
        const releases = loadReleasesJson();
        const unreleased = releases.releases.filter((r) => r.status === 'unreleased');

        if (unreleased.length === 0) {
            console.error(chalk.red('✗ No unreleased versions found'));
            console.log(chalk.yellow('\nRun "pnpm release notes" first to create a version'));
            process.exit(1);
        } else if (unreleased.length === 1) {
            version = unreleased[0].version;
            console.log(chalk.cyan(`Auto-detected version: ${chalk.bold(version)}\n`));
        } else {
            console.error(chalk.red('✗ Multiple unreleased versions found:'));
            unreleased.forEach((r) => console.log(chalk.yellow(`  - ${r.version}`)));
            console.log(chalk.dim('\nPlease specify which version to publish:'));
            console.log(chalk.dim('  pnpm release publish <version>'));
            process.exit(1);
        }
    }

    // Validate version format
    if (!validateVersion(version)) {
        console.error(chalk.red('✗ Invalid version format. Use semantic versioning (e.g., 0.5.0)'));
        process.exit(1);
    }

    // Check deployment state of main branch
    const mainReleases = loadReleasesJsonFromMain();
    const mainState = verifyDeploymentState(mainReleases.latestVersion);

    if (mainState.issues.length > 0) {
        console.log(chalk.yellow('\n⚠ Warning: Deployment issues detected in main branch:\n'));
        mainState.issues.forEach((issue) => {
            console.log(chalk.dim(`  • ${issue}`));
        });
        console.log(chalk.yellow('\nYou may want to fix these before publishing a new version.'));
        console.log(chalk.dim('Run "pnpm release info" for more details and suggested fixes.\n'));

        // In dry-run mode, continue anyway, but in real mode ask for confirmation
        if (!dryRun) {
            const { continueAnyway } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'continueAnyway',
                    message: 'Continue with publish anyway?',
                    default: false
                }
            ]);

            if (!continueAnyway) {
                console.log(chalk.yellow('\nPublish cancelled. Fix deployment issues and try again.'));
                process.exit(0);
            }
        }
    }

    // Check for uncommitted changes
    if (!dryRun && checkUncommittedChanges()) {
        console.error(chalk.red('✗ You have uncommitted changes'));
        console.error(chalk.yellow('  Please commit or stash them first\n'));
        console.error(chalk.dim('  Run: git status'));
        process.exit(1);
    }

    // Step 1: Update releases.json
    const spinner = ora('Updating releases.json').start();
    try {
        const releases = loadReleasesJson();

        spinner.text = `Publishing version: ${chalk.green(version)}`;

        // Find the release entry and mark it as released
        const releaseIndex = releases.releases.findIndex((r) => r.version === version);
        if (releaseIndex === -1) {
            spinner.fail(`Version ${version} not found in releases array`);
            console.log(chalk.yellow('\nTip: Run "pnpm release notes" first to create the release entry'));
            process.exit(1);
        }

        const release = releases.releases[releaseIndex];
        if (release.status === 'released') {
            spinner.warn(`Version ${version} is already marked as released`);
        }

        // Mark as released and update date
        release.status = 'released';
        release.date = new Date().toISOString().split('T')[0];

        // Update latestVersion
        releases.latestVersion = version;

        if (!dryRun) {
            saveReleasesJson(releases);
            spinner.succeed('releases.json updated (marked as released)');
        } else {
            spinner.info('Would update releases.json');
        }
    } catch (error) {
        spinner.fail('Failed to update releases.json');
        throw error;
    }

    // Step 2: Get commits since last release
    console.log(chalk.bold('\nChanges Since Last Release\n'));
    const lastTag = getLastTag();
    const commits = getCommitsSinceTag(lastTag);

    if (lastTag) {
        console.log(chalk.dim(`Since ${lastTag}:\n`));
    } else {
        console.log(chalk.dim('All commits (no previous release found):\n'));
    }

    if (commits) {
        console.log(chalk.gray(commits));
    } else {
        console.log(chalk.yellow('No commits found\n'));
    }

    // Step 3: Generate Cursor AI Prompt
    generateCursorPrompt(version, commits);

    // Step 4: Create git tag
    const tagSpinner = ora('Creating git tag').start();
    try {
        if (!dryRun) {
            exec(`git tag -a v${version} -m "Release v${version}"`, { silent: true });
            tagSpinner.succeed(`Created tag ${chalk.green(`v${version}`)}`);
        } else {
            tagSpinner.info(`Would create tag v${version}`);
        }
    } catch (error) {
        tagSpinner.fail('Failed to create git tag');
        throw error;
    }

    // Step 5: Show next steps
    showNextSteps(version);
}

function generateCursorPrompt(version: string, commits: string): void {
    console.log(chalk.bold('\n╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold('║         🤖 CURSOR AI INTEGRATION - NEXT STEP              ║'));
    console.log(chalk.bold('╚════════════════════════════════════════════════════════════╝\n'));

    console.log(chalk.cyan('Copy the following prompt and paste into Cursor Composer:\n'));
    console.log(chalk.dim('─'.repeat(60)));

    const prompt = `
Review the git commits above and verify release notes for version ${version}.

Please verify/update these files:

1. CHANGELOG.md
   - Verify [${version}] section has today's date: ${new Date().toISOString().split('T')[0]}
   - Ensure all changes are documented in appropriate categories:
     * Breaking Changes (if any)
     * Added (new features)
     * Changed (modifications to existing features)
     * Fixed (bug fixes)
     * Deprecated (soon-to-be removed features)
   - Verify all descriptions are clear and user-focused

2. apps/pika-docs/src/content/docs/platform/releases/changelog.mdoc
   - Verify it matches CHANGELOG.md
   - Check proper markdoc formatting per doc guidelines

3. releases.json
   - Verify [${version}] entry has status: "released" and today's date

Focus on changes that matter to users. Ignore internal refactors unless they impact user experience.
Be concise but clear. Each entry should explain WHAT changed and WHY it matters.

NOTE: The changelog should already be finalized via "pnpm release notes --finalize". This is a final verification step.
`;

    console.log(chalk.white(prompt));
    console.log(chalk.dim('─'.repeat(60)));
    console.log(chalk.yellow('\nTIP: You can refine this prompt by adding:'));
    console.log(chalk.dim('   - Specific areas to focus on'));
    console.log(chalk.dim('   - Breaking changes you know about'));
    console.log(chalk.dim('   - Migration guide links to include\n'));
}

function showNextSteps(version: string): void {
    console.log(chalk.bold.green('\nRelease preparation complete!\n'));
    console.log(chalk.bold('Next steps:\n'));

    const steps = [
        {
            emoji: '🤖',
            title: 'Use Cursor AI to update changelogs',
            commands: ['Open Cursor Composer (Cmd+Shift+I or Ctrl+Shift+I)', 'Paste the prompt shown above', 'Review and approve the AI-generated changelog']
        },
        {
            emoji: '✅',
            title: 'Review changes',
            commands: ['git status', 'Review releases.json, CHANGELOG.md, and docs']
        },
        {
            emoji: '📦',
            title: 'Commit to your feature branch',
            commands: ['git add releases.json CHANGELOG.md apps/pika-docs/src/content/docs/platform/releases/', `git commit -m "docs: release v${version}"`]
        },
        {
            emoji: '🔀',
            title: 'Merge to main',
            commands: ['git checkout main', 'git merge your-feature-branch', 'git push origin main', `git push origin v${version}`]
        },
        {
            emoji: '🧪',
            title: 'Test the release (optional)',
            commands: ['pika create-app test-project', 'cd test-project && pika sync']
        },
        {
            emoji: '🚀',
            title: 'Publish packages (optional)',
            commands: ['cd packages/pika-cli && pnpm publish', 'cd packages/pika-serverless && pnpm publish']
        },
        {
            emoji: '🌐',
            title: 'Deploy documentation',
            commands: ['cd apps/pika-docs && pnpm build && [deploy]']
        }
    ];

    steps.forEach((step, index) => {
        console.log(chalk.bold(`${index + 1}. ${step.emoji} ${step.title}`));
        step.commands.forEach((cmd) => {
            console.log(chalk.dim(`   ${cmd}`));
        });
        console.log();
    });
}

// ============================================================================
// Info Command
// ============================================================================

async function showInfo(): Promise<void> {
    console.log(chalk.bold('\n📊 Pika Framework Release Information\n'));

    const releases = loadReleasesJson();
    const mainReleases = loadReleasesJsonFromMain();
    const lastTag = getLastTag();

    console.log(chalk.bold('Latest in Main (Published):'), chalk.green(mainReleases.latestVersion));
    console.log(
        chalk.bold('Latest in Working Copy:'),
        releases.latestVersion === mainReleases.latestVersion ? chalk.dim(releases.latestVersion + ' (same)') : chalk.yellow(releases.latestVersion + ' (differs!)')
    );
    console.log(chalk.bold('Last Git Tag:'), lastTag ? chalk.cyan(lastTag) : chalk.dim('none'));
    console.log(chalk.bold('Development Version:'), chalk.yellow(releases.currentDevelopment));
    console.log();

    // Verify deployment state for main's latest version
    console.log(chalk.bold('Deployment State Check:\n'));
    const deploymentState = verifyDeploymentState(mainReleases.latestVersion);

    if (deploymentState.issues.length === 0) {
        console.log(chalk.green(`✓ Version ${mainReleases.latestVersion} deployment is consistent`));
        console.log(chalk.dim(`  • In main's releases.json: ${deploymentState.inMainReleases ? '✓' : '✗'}`));
        console.log(chalk.dim(`  • Marked as released: ${deploymentState.markedAsReleased ? '✓' : '✗'}`));
        console.log(chalk.dim(`  • Local tag v${mainReleases.latestVersion}: ${deploymentState.hasLocalTag ? '✓' : '✗'}`));
        console.log(chalk.dim(`  • Remote tag v${mainReleases.latestVersion}: ${deploymentState.hasRemoteTag ? '✓' : '✗'}`));
    } else {
        console.log(chalk.red(`✗ Deployment issues detected for version ${mainReleases.latestVersion}:\n`));
        deploymentState.issues.forEach((issue) => {
            console.log(chalk.yellow(`  ⚠ ${issue}`));
        });
        console.log(chalk.dim('\n  Possible fixes:'));
        if (!deploymentState.hasLocalTag && deploymentState.markedAsReleased) {
            console.log(chalk.dim(`    • Create local tag: git tag -a v${mainReleases.latestVersion} -m "Release v${mainReleases.latestVersion}"`));
        }
        if (!deploymentState.hasRemoteTag && deploymentState.hasLocalTag) {
            console.log(chalk.dim(`    • Push tag: git push origin v${mainReleases.latestVersion}`));
        }
        if (deploymentState.hasRemoteTag && !deploymentState.markedAsReleased) {
            console.log(chalk.dim(`    • Update releases.json in main to mark version as "released"`));
        }
    }
    console.log();

    // Show unreleased versions
    const unreleased = releases.releases.filter((r) => r.status === 'unreleased');
    if (unreleased.length > 0) {
        console.log(chalk.bold.yellow('Unreleased Versions (In Progress):\n'));
        unreleased.forEach((release) => {
            const breakingBadge = release.breaking ? chalk.red('[BREAKING]') : '';
            const statusBadge = chalk.yellow('[UNRELEASED]');
            console.log(`  ${chalk.cyan(release.version)} ${statusBadge} ${breakingBadge}`);
            console.log(`  ${chalk.dim(release.summary)}`);
            if (release.migrationGuideUrl) {
                console.log(`  ${chalk.dim('Migration guide: ' + release.migrationGuideUrl)}`);
            }
            console.log();
        });
    }

    // Show recent released versions
    const released = releases.releases.filter((r) => r.status === 'released');
    if (released.length > 0) {
        console.log(chalk.bold('Recent Releases:\n'));
        released
            .slice(-5)
            .reverse()
            .forEach((release) => {
                const breakingBadge = release.breaking ? chalk.red('[BREAKING]') : '';
                console.log(`  ${chalk.cyan(release.version)} ${breakingBadge}`);
                console.log(`  ${chalk.dim(release.date)} - ${release.summary}`);
                console.log();
            });
    }

    // Show uncommitted changes
    if (checkUncommittedChanges()) {
        console.log(chalk.yellow('⚠ You have uncommitted changes'));
    } else {
        console.log(chalk.green('✓ Working directory clean'));
    }
    console.log();
}

// ============================================================================
// Validate Command
// ============================================================================

async function validate(): Promise<void> {
    console.log(chalk.bold('\nValidating Release Configuration\n'));

    const checks = [];

    // Check releases.json exists
    checks.push({
        name: 'releases.json exists',
        passed: existsSync(getReleasesPath())
    });

    // Check CHANGELOG.md exists
    checks.push({
        name: 'CHANGELOG.md exists',
        passed: existsSync(path.join(getProjectRoot(), 'CHANGELOG.md'))
    });

    // Check git repository
    try {
        exec('git rev-parse --git-dir', { silent: true });
        checks.push({ name: 'Git repository', passed: true });
    } catch {
        checks.push({ name: 'Git repository', passed: false });
    }

    // Check for uncommitted changes
    checks.push({
        name: 'No uncommitted changes',
        passed: !checkUncommittedChanges()
    });

    // Load and validate releases.json structure
    try {
        const releases = loadReleasesJson();
        checks.push({ name: 'releases.json is valid JSON', passed: true });
        checks.push({
            name: 'latestVersion is set',
            passed: !!releases.latestVersion && validateVersion(releases.latestVersion)
        });
        checks.push({ name: 'releases array exists', passed: Array.isArray(releases.releases) });
    } catch {
        checks.push({ name: 'releases.json is valid JSON', passed: false });
    }

    // Display results
    checks.forEach((check) => {
        if (check.passed) {
            console.log(chalk.green('✓'), check.name);
        } else {
            console.log(chalk.red('✗'), check.name);
        }
    });

    const allPassed = checks.every((c) => c.passed);
    console.log();

    if (allPassed) {
        console.log(chalk.green.bold('✓ All checks passed!'));
    } else {
        console.log(chalk.red.bold('✗ Some checks failed'));
        process.exit(1);
    }
    console.log();
}

// ============================================================================
// Plan Breaking Change Command
// ============================================================================

async function planBreakingChange(options: { showPrompt?: boolean }): Promise<void> {
    console.log(chalk.bold('\nPlan Breaking Change - Documentation Helper\n'));

    const templates = loadPromptTemplates();
    const promptTemplate = templates.get('PROMPT_PLAN_BREAKING');

    if (!promptTemplate) {
        console.error(chalk.red('Could not find PROMPT_PLAN_BREAKING template'));
        process.exit(1);
    }

    // No variable replacement needed for this prompt - it's interactive
    // But we need to unescape backticks that are escaped in the markdown file
    const prompt = promptTemplate.replace(/\\`/g, '`');

    console.log(chalk.dim('This command helps you document breaking changes BEFORE implementation.'));
    console.log(chalk.dim('It will guide you through creating migration guides and changelog entries.\n'));

    // Copy to clipboard
    const spinner = ora('Copying prompt to clipboard...').start();
    try {
        await clipboardy.write(prompt);
        spinner.succeed(chalk.green('✓ Prompt copied to clipboard!'));
    } catch (error) {
        spinner.fail(chalk.yellow('Could not copy to clipboard'));
        console.log(chalk.dim('You can copy the prompt manually below.\n'));
    }

    console.log(chalk.bold.cyan('\nReady to paste into Cursor Composer (Cmd+Shift+I)\n'));

    if (options.showPrompt) {
        console.log(chalk.dim('─'.repeat(80)));
        console.log(prompt);
        console.log(chalk.dim('─'.repeat(80)));
        console.log();
    } else {
        console.log(chalk.dim('Tip: Use --show-prompt to display the full prompt text\n'));
    }
}

// ============================================================================
// Notes Command
// ============================================================================

async function updateNotes(options: { since?: string; ignoreUncommitted?: boolean; finalize?: string | boolean; showPrompt?: boolean }): Promise<void> {
    console.log(chalk.bold('\nPika Framework Release Notes Helper\n'));

    const baseBranch = options.since || 'main';
    let finalizeVersion: string | undefined;
    let workingVersion: string | undefined;

    // Handle --finalize flag (can be boolean if no version provided, or string if version provided)
    if (options.finalize === true) {
        // No version provided, auto-detect and prompt
        finalizeVersion = await promptForVersion();
    } else if (typeof options.finalize === 'string') {
        // Version was provided
        finalizeVersion = options.finalize;
    } else {
        // Not finalizing, just updating notes - ensure we have an unreleased version
        workingVersion = await ensureUnreleasedVersion();
    }

    const includeUncommitted = !options.ignoreUncommitted;

    // Get current branch
    let currentBranch = 'unknown';
    try {
        currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        console.log(chalk.dim(`Current branch: ${chalk.cyan(currentBranch)}`));
        console.log(chalk.dim(`Comparing against: ${chalk.cyan(baseBranch)}\n`));
    } catch {
        console.log(chalk.yellow('Not on a git branch\n'));
    }

    // Get committed changes on this branch
    console.log(chalk.bold('Committed Changes:\n'));
    let commits = '';
    try {
        // Get commits that are on current branch but not on base branch
        commits = execSync(`git log ${baseBranch}..HEAD --oneline --no-decorate 2>/dev/null || git log --oneline --no-decorate -10`, {
            encoding: 'utf8'
        });

        if (commits.trim()) {
            console.log(chalk.gray(commits));
        } else {
            console.log(chalk.dim('  No commits yet on this branch\n'));
        }
    } catch (error) {
        console.log(chalk.yellow('  Could not retrieve commits\n'));
    }

    // Get uncommitted changes (included by default unless --ignore-uncommitted)
    // Note: Data gathering happens silently - Cursor AI will see changes via git commands
    let changedFiles = '';
    if (includeUncommitted) {
        try {
            changedFiles = execSync('git status --short', { encoding: 'utf8' });
        } catch {
            // Silently continue if git status fails
        }
    }

    // Check if version is already published or just finalized (if finalizing)
    let versionPublished = false;
    let versionFinalized = false;

    if (finalizeVersion) {
        try {
            const projectRoot = getProjectRoot();

            // Check if version is published (in releases.json)
            const releasesPath = path.join(projectRoot, 'releases.json');
            if (existsSync(releasesPath)) {
                const releases = JSON.parse(readFileSync(releasesPath, 'utf8'));
                versionPublished = releases.latestVersion === finalizeVersion;
            }

            // Check if version is finalized (in CHANGELOG.md)
            const changelogPath = path.join(projectRoot, 'CHANGELOG.md');
            if (existsSync(changelogPath)) {
                const changelog = readFileSync(changelogPath, 'utf8');
                versionFinalized = changelog.includes(`## [${finalizeVersion}]`);
            }

            if (versionPublished) {
                console.log(chalk.yellow(`\nVersion [${finalizeVersion}] is already PUBLISHED\n`));
                console.log(chalk.cyan('Creating/adding to next version instead - these changes go in the next release.\n'));
            } else if (versionFinalized) {
                console.log(chalk.yellow(`\nVersion [${finalizeVersion}] is finalized but not yet published\n`));
                console.log(chalk.cyan('Adding to [${finalizeVersion}] - perfect for "one more fix" before publishing!\n'));
            }
        } catch (error) {
            console.log(chalk.dim('Could not check version status\n'));
        }
    }

    // Generate Cursor Composer prompt
    // Four scenarios:
    // 1. Normal incremental update: add to working version
    // 2. Normal finalize: version doesn't exist yet
    // 3. Version finalized but not published: add to that version
    // 4. Version already published: create new working version
    await generateNotesPrompt(
        baseBranch,
        workingVersion, // Pass working version for incremental updates
        versionPublished ? undefined : finalizeVersion, // Pass finalize version unless already published
        versionPublished ? finalizeVersion : undefined, // If published, treat as "existing version"
        versionFinalized && !versionPublished, // Flag for "add to existing unpublished version"
        options.showPrompt
    );
}

async function generateNotesPrompt(
    baseBranch: string,
    workingVersion?: string,
    finalizeVersion?: string,
    existingVersion?: string,
    addToUnpublishedVersion?: boolean,
    showPrompt?: boolean
): Promise<void> {
    console.log(chalk.bold('╔═══════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold('║       🤖 CURSOR COMPOSER - RELEASE NOTES UPDATE          ║'));
    console.log(chalk.bold('╚═══════════════════════════════════════════════════════════╝\n'));

    if (existingVersion) {
        console.log(chalk.yellow(`Version [${existingVersion}] already published - creating/adding to next version\n`));
    } else if (addToUnpublishedVersion && finalizeVersion) {
        console.log(chalk.yellow(`🔧 ADD TO UNPUBLISHED: Adding to [${finalizeVersion}] before publishing\n`));
    } else if (finalizeVersion) {
        console.log(chalk.yellow(`🎯 FINALIZE MODE: Updating [${finalizeVersion}] date and marking as released\n`));
    } else if (workingVersion) {
        console.log(chalk.cyan(`📝 UPDATE MODE: Adding changes to [${workingVersion}]\n`));
    }

    // Load the appropriate prompt from the template file
    const prompt = getPrompt({
        baseBranch,
        workingVersion,
        existingVersion,
        finalizeVersion,
        addToUnpublishedVersion
    });

    // Copy to clipboard
    const spinner = ora('Copying prompt to clipboard...').start();
    try {
        await clipboardy.write(prompt);
        spinner.succeed(chalk.green('✓ Prompt copied to clipboard!'));
    } catch (error) {
        spinner.fail(chalk.yellow('Could not copy to clipboard'));
        console.log(chalk.dim('You can copy the prompt manually below.\n'));
        showPrompt = true; // Force show if clipboard failed
    }

    console.log(chalk.bold.cyan('\nReady to paste into Cursor Composer (Cmd+Shift+I)\n'));

    if (showPrompt) {
        console.log(chalk.dim('─'.repeat(60)));
        console.log(chalk.white(prompt));
        console.log(chalk.dim('─'.repeat(60)));
    } else {
        console.log(chalk.dim('Tip: Use --show-prompt to display the full prompt text\n'));
    }

    console.log(chalk.yellow('\nQuick Tips:\n'));
    console.log(chalk.dim('   • Cursor will run git commands to see your changes'));
    console.log(chalk.dim('   • Uncommitted changes are included by default'));
    console.log(chalk.dim('   • @mention files for more context if needed'));
    if (existingVersion) {
        console.log(chalk.dim(`   • [${existingVersion}] is published - creating/adding to next version`));
        console.log(chalk.dim('   • These changes will be part of the next release\n'));
    } else if (addToUnpublishedVersion && finalizeVersion) {
        console.log(chalk.dim(`   • [${finalizeVersion}] is finalized but not published yet`));
        console.log(chalk.dim(`   • Adding to [${finalizeVersion}] - perfect for last-minute fixes!\n`));
    } else if (!finalizeVersion) {
        console.log(chalk.dim(`   • Run multiple times - AI adds to existing version section`));
        console.log(chalk.dim('   • AI will flag breaking changes and suggest migration guides\n'));
    } else {
        console.log(chalk.dim('   • This updates the version date from TBD to today'));
        console.log(chalk.dim('   • Run before final release commit\n'));
    }

    if (!finalizeVersion) {
        console.log(chalk.green('✨ Workflow:\n'));
        console.log(chalk.dim('   1. Make commits (feat:, fix:, breaking:)'));
        console.log(chalk.dim('   2. pnpm release notes'));
        console.log(chalk.dim('   3. Paste into Cursor Composer → Accept'));
        console.log(chalk.dim('   4. Repeat as you work'));
        console.log(chalk.dim('   5. At release: pnpm release notes --finalize X.Y.Z\n'));
    } else {
        console.log(chalk.green('✨ Next Steps:\n'));
        console.log(chalk.dim('   1. Review the finalized changelog'));
        console.log(chalk.dim('   2. git add CHANGELOG.md apps/pika-docs/src/content/docs/platform/releases/'));
        console.log(chalk.dim('   3. git commit -m "docs: release v' + finalizeVersion + '"'));
        console.log(chalk.dim('   4. git push\n'));
    }
}

// ============================================================================
// CLI Setup
// ============================================================================

const program = new Command();

program.name('release').description('Pika Framework Release Management Tool').version('0.1.0');

program
    .command('publish')
    .description('Publish a new release')
    .argument('[version]', 'Semantic version number (e.g., 0.5.0) - optional if only one unreleased version exists')
    .option('--dry-run', 'Show what would be done without making changes')
    .action(publishRelease);

program
    .command('notes')
    .description('Generate release notes update prompt for Cursor AI')
    .option('--since <branch>', 'Compare against specific branch/ref (default: main)', 'main')
    .option('--ignore-uncommitted', 'Ignore uncommitted changes (by default they are included)')
    .option('--finalize [version]', 'Finalize: Update version date from TBD to today and mark as released (prompts if version not provided)')
    .option('--show-prompt', 'Display the full prompt text in addition to copying to clipboard')
    .action(updateNotes);

program.command('info').description('Show current release information').action(showInfo);

program.command('validate').description('Validate release configuration').action(validate);

program
    .command('plan-breaking')
    .description('Generate prompt for planning a breaking change BEFORE implementation')
    .option('--show-prompt', 'Display the full prompt text in addition to copying to clipboard')
    .action(planBreakingChange);

// Default command (for backward compatibility)
if (process.argv.length > 2 && !process.argv[2].startsWith('-') && !['publish', 'notes', 'info', 'validate', 'plan-breaking'].includes(process.argv[2])) {
    // If first arg is a version number, assume publish command
    if (validateVersion(process.argv[2])) {
        process.argv.splice(2, 0, 'publish');
    }
}

program.parse();
