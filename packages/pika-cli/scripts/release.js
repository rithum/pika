#!/usr/bin/env node

/**
 * Release script for pika-app
 * Handles version bumping, changelog generation, and publishing
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PACKAGE_PATH = resolve(process.cwd(), 'package.json');

function execCommand(command, options = {}) {
    try {
        return execSync(command, {
            stdio: 'inherit',
            encoding: 'utf-8',
            ...options
        });
    } catch (error) {
        console.error(`Failed to execute: ${command}`);
        process.exit(1);
    }
}

function getCurrentVersion() {
    const pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf-8'));
    return pkg.version;
}

function validateWorkingDirectory() {
    try {
        const status = execSync('git status --porcelain', { encoding: 'utf-8' });
        if (status.trim()) {
            console.error('❌ Working directory is not clean. Please commit or stash changes first.');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Not a git repository or git command failed.');
        process.exit(1);
    }
}

function runTests() {
    console.log('🧪 Running tests...');
    execCommand('pnpm run test');
    execCommand('pnpm run type-check');
    execCommand('pnpm run lint');
}

function bumpVersion(type) {
    console.log(`📈 Bumping ${type} version...`);
    const oldVersion = getCurrentVersion();
    execCommand(`pnpm version ${type} --git-tag-version=true`);
    const newVersion = getCurrentVersion();

    console.log(`Version bumped: ${oldVersion} → ${newVersion}`);
    console.log(`✅ Git commit and tag created automatically`);
    return newVersion;
}

function updateChangelog(version) {
    console.log('📝 Please update CHANGELOG.md with the new version changes');
    // Here you could integrate with conventional-changelog or similar
}

function buildPackage() {
    console.log('🔨 Building package...');
    execCommand('pnpm run build');
}

function publishPackage(isDryRun = false) {
    const dryRunFlag = isDryRun ? '--dry-run' : '';
    console.log(`📦 ${isDryRun ? 'Dry run - ' : ''}Publishing package...`);
    execCommand(`pnpm publish ${dryRunFlag}`);
}

// Git tag and commit are now handled automatically by pnpm version command

function pushToRemote() {
    console.log('🚀 Pushing to remote...');
    execCommand('git push');
    execCommand('git push --tags');
}

async function main() {
    const [, , releaseType, ...flags] = process.argv;
    const isDryRun = flags.includes('--dry-run');

    if (!releaseType || !['patch', 'minor', 'major'].includes(releaseType)) {
        console.error('Usage: node scripts/release.js <patch|minor|major> [--dry-run]');
        process.exit(1);
    }

    console.log(`🚀 Starting ${releaseType} release${isDryRun ? ' (dry run)' : ''}...`);

    // Pre-release checks
    validateWorkingDirectory();
    runTests();

    // Version and build
    const newVersion = bumpVersion(releaseType);
    updateChangelog(newVersion);
    buildPackage();

    if (isDryRun) {
        publishPackage(true);
        console.log('✅ Dry run completed successfully!');
    } else {
        // Publish
        publishPackage(false);

        // Push git changes (commit and tag were created by version command)
        pushToRemote();

        console.log(`✅ Successfully released v${newVersion}!`);
        console.log(`📦 Package published: https://www.npmjs.com/package/pika-app`);
    }
}

main().catch((error) => {
    console.error('❌ Release failed:', error);
    process.exit(1);
});
