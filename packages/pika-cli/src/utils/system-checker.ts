import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';
import semver from 'semver';

const execAsync = promisify(exec);

export interface SystemInfo {
    node: string;
    npm: string;
    pnpm?: string;
    yarn?: string;
    git: string;
    os: string;
    arch: string;
}

export class SystemChecker {
    async checkSystemRequirements(): Promise<{
        compatible: boolean;
        issues: string[];
        warnings: string[];
        info: SystemInfo;
    }> {
        const issues: string[] = [];
        const warnings: string[] = [];
        const info = await this.getSystemInfo();

        // Check Node.js version
        if (!semver.gte(info.node, '18.0.0')) {
            issues.push(`Node.js v18.0.0 or higher required (current: ${info.node})`);
        }

        // Check Git availability
        if (!info.git) {
            issues.push('Git is required but not found');
        }

        // Check package manager
        if (!info.npm && !info.pnpm && !info.yarn) {
            issues.push('No package manager found (npm, pnpm, or yarn required)');
        }

        // Warnings for optimal setup
        if (!info.pnpm) {
            warnings.push('pnpm is recommended for better performance and disk usage');
        }

        return {
            compatible: issues.length === 0,
            issues,
            warnings,
            info
        };
    }

    async getSystemInfo(): Promise<SystemInfo> {
        const info: Partial<SystemInfo> = {
            os: process.platform,
            arch: process.arch
        };

        try {
            const { stdout: nodeVersion } = await execAsync('node --version');
            info.node = nodeVersion.trim().replace('v', '');
        } catch {
            info.node = process.version.replace('v', '');
        }

        try {
            const { stdout: npmVersion } = await execAsync('npm --version');
            info.npm = npmVersion.trim();
        } catch {
            // npm not available
        }

        try {
            const { stdout: pnpmVersion } = await execAsync('pnpm --version');
            info.pnpm = pnpmVersion.trim();
        } catch {
            // pnpm not available
        }

        try {
            const { stdout: yarnVersion } = await execAsync('yarn --version');
            info.yarn = yarnVersion.trim();
        } catch {
            // yarn not available
        }

        try {
            const { stdout: gitVersion } = await execAsync('git --version');
            info.git = gitVersion.trim().replace('git version ', '');
        } catch {
            // git not available
        }

        return info as SystemInfo;
    }

    async detectPackageManager(directory: string = process.cwd()): Promise<string> {
        const { fileManager } = await import('./file-manager.js');

        if (await fileManager.exists(`${directory}/pnpm-lock.yaml`)) {
            return 'pnpm';
        }

        if (await fileManager.exists(`${directory}/yarn.lock`)) {
            return 'yarn';
        }

        if (await fileManager.exists(`${directory}/package-lock.json`)) {
            return 'npm';
        }

        // Default preference: pnpm > yarn > npm
        try {
            await execAsync('pnpm --version');
            return 'pnpm';
        } catch {
            try {
                await execAsync('yarn --version');
                return 'yarn';
            } catch {
                return 'npm';
            }
        }
    }

    async runCommand(command: string, cwd?: string): Promise<{ success: boolean; output: string; error?: string }> {
        try {
            const { stdout, stderr } = await execAsync(command, { cwd });
            return {
                success: true,
                output: stdout.trim(),
                error: stderr.trim() || undefined
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }

    async installPackages(packages: string[], directory: string = process.cwd()): Promise<boolean> {
        const packageManager = await this.detectPackageManager(directory);

        let command = '';
        switch (packageManager) {
            case 'pnpm':
                command = `pnpm add ${packages.join(' ')}`;
                break;
            case 'yarn':
                command = `yarn add ${packages.join(' ')}`;
                break;
            case 'npm':
                command = `npm install ${packages.join(' ')}`;
                break;
        }

        logger.debug(`Installing packages with: ${command}`);

        const result = await this.runCommand(command, directory);

        if (!result.success) {
            logger.error('Package installation failed:', result.error);
            return false;
        }

        return true;
    }

    async runPackageScript(script: string, directory: string = process.cwd()): Promise<boolean> {
        const packageManager = await this.detectPackageManager(directory);

        let command = '';
        switch (packageManager) {
            case 'pnpm':
                command = `pnpm ${script}`;
                break;
            case 'yarn':
                command = `yarn ${script}`;
                break;
            case 'npm':
                command = `npm run ${script}`;
                break;
        }

        logger.debug(`Running script: ${command}`);

        const result = await this.runCommand(command, directory);

        if (!result.success) {
            logger.error(`Script '${script}' failed:`, result.error);
            return false;
        }

        logger.success(`Script '${script}' completed successfully`);
        return true;
    }
}

export const systemChecker = new SystemChecker();
