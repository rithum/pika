import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';

const execAsync = promisify(exec);

export class GitManager {
    async isGitRepository(directory: string = process.cwd()): Promise<boolean> {
        try {
            await execAsync('git rev-parse --git-dir', { cwd: directory });
            return true;
        } catch {
            return false;
        }
    }

    async initRepository(directory: string = process.cwd()): Promise<void> {
        try {
            await execAsync('git init', { cwd: directory });
            logger.debug('Initialized git repository');
        } catch (error) {
            throw new Error(`Failed to initialize git repository: ${error}`);
        }
    }

    async addAll(directory: string = process.cwd()): Promise<void> {
        try {
            await execAsync('git add .', { cwd: directory });
            logger.debug('Added all files to git');
        } catch (error) {
            throw new Error(`Failed to add files to git: ${error}`);
        }
    }

    async commit(message: string, directory: string = process.cwd()): Promise<void> {
        try {
            await execAsync(`git commit -m "${message}"`, { cwd: directory });
            logger.debug(`Committed with message: ${message}`);
        } catch (error) {
            throw new Error(`Failed to commit: ${error}`);
        }
    }

    async getCurrentBranch(directory: string = process.cwd()): Promise<string> {
        try {
            const { stdout } = await execAsync('git branch --show-current', { cwd: directory });
            return stdout.trim();
        } catch (error) {
            throw new Error(`Failed to get current branch: ${error}`);
        }
    }

    async getStatus(directory: string = process.cwd()): Promise<string> {
        try {
            const { stdout } = await execAsync('git status --porcelain', { cwd: directory });
            return stdout.trim();
        } catch (error) {
            throw new Error(`Failed to get git status: ${error}`);
        }
    }

    async hasUncommittedChanges(directory: string = process.cwd()): Promise<boolean> {
        const status = await this.getStatus(directory);
        return status.length > 0;
    }

    async createBranch(branchName: string, directory: string = process.cwd()): Promise<void> {
        try {
            await execAsync(`git checkout -b ${branchName}`, { cwd: directory });
            logger.debug(`Created and switched to branch: ${branchName}`);
        } catch (error) {
            throw new Error(`Failed to create branch ${branchName}: ${error}`);
        }
    }

    async switchBranch(branchName: string, directory: string = process.cwd()): Promise<void> {
        try {
            await execAsync(`git checkout ${branchName}`, { cwd: directory });
            logger.debug(`Switched to branch: ${branchName}`);
        } catch (error) {
            throw new Error(`Failed to switch to branch ${branchName}: ${error}`);
        }
    }

    async getRemoteUrl(directory: string = process.cwd()): Promise<string | null> {
        try {
            const { stdout } = await execAsync('git remote get-url origin', { cwd: directory });
            return stdout.trim();
        } catch {
            return null;
        }
    }

    async addRemote(name: string, url: string, directory: string = process.cwd()): Promise<void> {
        try {
            await execAsync(`git remote add ${name} ${url}`, { cwd: directory });
            logger.debug(`Added remote ${name}: ${url}`);
        } catch (error) {
            throw new Error(`Failed to add remote ${name}: ${error}`);
        }
    }

    async fetch(remote: string = 'origin', directory: string = process.cwd()): Promise<void> {
        try {
            await execAsync(`git fetch ${remote}`, { cwd: directory });
            logger.debug(`Fetched from remote: ${remote}`);
        } catch (error) {
            throw new Error(`Failed to fetch from ${remote}: ${error}`);
        }
    }

    async merge(branch: string, directory: string = process.cwd()): Promise<void> {
        try {
            await execAsync(`git merge ${branch}`, { cwd: directory });
            logger.debug(`Merged branch: ${branch}`);
        } catch (error) {
            throw new Error(`Failed to merge ${branch}: ${error}`);
        }
    }

    async getDiff(fromRef: string, toRef: string, directory: string = process.cwd()): Promise<string> {
        try {
            const { stdout } = await execAsync(`git diff ${fromRef}..${toRef}`, { cwd: directory });
            return stdout;
        } catch (error) {
            throw new Error(`Failed to get diff between ${fromRef} and ${toRef}: ${error}`);
        }
    }

    async getCommitHash(ref: string = 'HEAD', directory: string = process.cwd()): Promise<string> {
        try {
            const { stdout } = await execAsync(`git rev-parse ${ref}`, { cwd: directory });
            return stdout.trim();
        } catch (error) {
            throw new Error(`Failed to get commit hash for ${ref}: ${error}`);
        }
    }
}

export const gitManager = new GitManager();
