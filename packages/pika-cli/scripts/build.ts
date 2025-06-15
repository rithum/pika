#!/usr/bin/env node

/**
 * Build script for Pika CLI
 *
 * This script handles the build process for the CLI package,
 * including TypeScript compilation, asset copying, and validation.
 */

import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

const BUILD_DIR = 'dist';
const SRC_DIR = 'src';
const TEMPLATES_DIR = 'templates';
const SCRIPTS_DIR = 'scripts';

type LogType = 'info' | 'success' | 'warn' | 'error';

function log(message: string, type: LogType = 'info'): void {
    const colors = {
        info: chalk.blue,
        success: chalk.green,
        warn: chalk.yellow,
        error: chalk.red
    };

    console.log(colors[type](`[Build] ${message}`));
}

async function clean(): Promise<void> {
    log('Cleaning build directory...');
    await fs.remove(BUILD_DIR);
    log('Build directory cleaned', 'success');
}

async function compileTypeScript(): Promise<void> {
    log('Compiling TypeScript...');

    try {
        execSync('tsc', {
            stdio: 'inherit',
            cwd: process.cwd()
        });
        log('TypeScript compilation completed', 'success');
    } catch (error) {
        log('TypeScript compilation failed', 'error');
        throw error;
    }
}

async function copyAssets(): Promise<void> {
    log('Copying assets...');

    const assetDirs = [
        { src: TEMPLATES_DIR, dest: path.join(BUILD_DIR, TEMPLATES_DIR) },
        { src: SCRIPTS_DIR, dest: path.join(BUILD_DIR, SCRIPTS_DIR) }
    ];

    for (const { src, dest } of assetDirs) {
        if (await fs.pathExists(src)) {
            await fs.copy(src, dest);
            log(`Copied ${src} to ${dest}`);
        }
    }

    // Copy package.json for runtime dependency resolution
    await fs.copy('package.json', path.join(BUILD_DIR, 'package.json'));
    log('Copied package.json');

    log('Assets copied successfully', 'success');
}

async function makeExecutable(): Promise<void> {
    log('Making CLI executable...');

    const cliPath = path.join(BUILD_DIR, 'index.js');

    if (await fs.pathExists(cliPath)) {
        // Add shebang if not present
        const content = await fs.readFile(cliPath, 'utf8');
        if (!content.startsWith('#!/usr/bin/env node')) {
            const newContent = '#!/usr/bin/env node\n' + content;
            await fs.writeFile(cliPath, newContent);
        }

        // Make executable on Unix systems
        if (process.platform !== 'win32') {
            try {
                execSync(`chmod +x ${cliPath}`);
                log('CLI made executable', 'success');
            } catch (error) {
                log('Failed to make CLI executable', 'warn');
            }
        }
    }
}

async function validateBuild(): Promise<void> {
    log('Validating build...');

    const requiredFiles = [
        'index.js',
        'commands/create-app.js',
        'commands/sync.js',
        'commands/component.js',
        'commands/auth.js',
        'utils/logger.js',
        'utils/file-manager.js',
        'utils/git-manager.js',
        'utils/config-manager.js'
    ];

    const missingFiles: string[] = [];

    for (const file of requiredFiles) {
        const filePath = path.join(BUILD_DIR, file);
        if (!(await fs.pathExists(filePath))) {
            missingFiles.push(file);
        }
    }

    if (missingFiles.length > 0) {
        log(`Missing required files: ${missingFiles.join(', ')}`, 'error');
        throw new Error('Build validation failed');
    }

    log('Build validation passed', 'success');
}

interface BuildInfo {
    name: string;
    version: string;
    buildDate: string;
    nodeVersion: string;
    platform: string;
    arch: string;
}

async function generatePackageInfo(): Promise<void> {
    log('Generating package info...');

    const packageJson = await fs.readJson('package.json');
    const buildInfo: BuildInfo = {
        name: packageJson.name,
        version: packageJson.version,
        buildDate: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
    };

    await fs.writeJson(path.join(BUILD_DIR, 'build-info.json'), buildInfo, { spaces: 2 });

    log('Package info generated', 'success');
}

async function showBuildSummary(): Promise<void> {
    const packageJson = await fs.readJson('package.json');

    console.log(chalk.cyan('\n📦 Build Summary'));
    console.log(chalk.cyan('─'.repeat(50)));
    console.log(`Package: ${packageJson.name}`);
    console.log(`Version: ${packageJson.version}`);
    console.log(`Build: ${new Date().toISOString()}`);
    console.log(`Output: ${BUILD_DIR}/`);
    console.log(`Size: ${(await getBuildSize()).toFixed(2)} MB`);
    console.log(chalk.green('\n✅ Build completed successfully!\n'));
}

async function getBuildSize(): Promise<number> {
    try {
        const output = execSync(`du -sm ${BUILD_DIR}`, { encoding: 'utf8' });
        return parseFloat(output.split('\t')[0]);
    } catch (error) {
        // Fallback for Windows or if du command fails
        return 0;
    }
}

async function main(): Promise<void> {
    const startTime = Date.now();

    try {
        log('Starting build process...');

        await clean();
        await compileTypeScript();
        await copyAssets();
        await makeExecutable();
        await validateBuild();
        await generatePackageInfo();

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        log(`Build completed in ${duration}s`, 'success');

        await showBuildSummary();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(`Build failed: ${errorMessage}`, 'error');
        process.exit(1);
    }
}

// Run build if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { clean, compileTypeScript, copyAssets, makeExecutable, validateBuild, generatePackageInfo, main };
