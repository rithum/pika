import { exec } from 'child_process';
import { promisify } from 'util';
import semver from 'semver';
import { logger } from './logger.js';

const execAsync = promisify(exec);

/**
 * Validates that pnpm is installed on the system
 */
export async function validatePnpm(): Promise<void> {
    try {
        await execAsync('pnpm --version');
    } catch (error) {
        logger.error('pnpm is not installed.');
        logger.info('Please install pnpm:');
        console.log('  npm install -g pnpm');
        console.log('  # or (Unix/Mac):');
        console.log('  curl -fsSL https://get.pnpm.io/install.sh | sh -');
        console.log('  # or (Windows):');
        console.log('  iwr https://get.pnpm.io/install.ps1 -useb | iex');
        process.exit(1);
    }
}

/**
 * Validates that Node.js version is at least 22
 */
export async function validateNodeVersion(): Promise<void> {
    const currentVersion = process.version;
    const requiredVersion = '22.0.0';

    if (!semver.gte(currentVersion, requiredVersion)) {
        logger.error(`Node.js version ${requiredVersion} or higher is required.`);
        logger.info(`Current version: ${currentVersion}`);
        logger.info('Please upgrade Node.js:');
        console.log('  Use nvm: nvm install 22');
        console.log('  Or download from: https://nodejs.org/');
        process.exit(1);
    }
}

/**
 * Validates project name format
 */
export function validateProjectName(name: string): boolean | string {
    if (!name.trim()) {
        return 'Project name is required';
    }

    if (!/^[a-zA-Z]/.test(name)) {
        return 'Project name must start with a letter';
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
        return 'Project name may only contain letters, numbers, underscores, and hyphens';
    }

    return true;
}

/**
 * Converts a project name to a human-readable format
 * Examples:
 *   my-awesome-app => My Awesome App
 *   myAwesomeApp => My Awesome App
 *   my_awesome_app => My Awesome App
 */
export function toHumanReadable(projectName: string): string {
    // Split on hyphens, underscores, and camelCase boundaries
    const parts = projectName
        .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase
        .split(/[-_\s]+/) // Split on hyphens, underscores, spaces
        .filter((part) => part.length > 0);

    // Capitalize each word
    return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}
