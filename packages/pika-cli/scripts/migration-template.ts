#!/usr/bin/env node

/**
 * Migration Script Template
 *
 * This script template can be used to create migration scripts for
 * Pika Framework updates that require user code changes.
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { glob } from 'glob';

type LogType = 'info' | 'success' | 'warn' | 'error';

interface PikaConfig {
    projectName: string;
    version: string;
    framework: {
        version: string;
        lastSync: string;
    };
    [key: string]: any;
}

interface ReplacerConfig {
    from: string | RegExp;
    to: string;
}

export class Migration {
    private fromVersion: string;
    private toVersion: string;
    private changes: string[] = [];

    constructor(fromVersion: string, toVersion: string) {
        this.fromVersion = fromVersion;
        this.toVersion = toVersion;
    }

    private log(message: string, type: LogType = 'info'): void {
        const colors = {
            info: chalk.blue,
            success: chalk.green,
            warn: chalk.yellow,
            error: chalk.red
        };

        console.log(colors[type](`[Migration ${this.fromVersion} → ${this.toVersion}] ${message}`));
    }

    async run(): Promise<void> {
        this.log(`Starting migration from v${this.fromVersion} to v${this.toVersion}`);

        try {
            await this.checkPrerequisites();
            await this.performMigration();
            await this.updateConfig();

            this.log('Migration completed successfully!', 'success');
            this.showSummary();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log(`Migration failed: ${errorMessage}`, 'error');
            process.exit(1);
        }
    }

    async checkPrerequisites(): Promise<void> {
        // Check if this is a Pika project
        if (!(await fs.pathExists('pika.config.json'))) {
            throw new Error('Not a Pika project. pika.config.json not found.');
        }

        // Check current version
        const config: PikaConfig = await fs.readJson('pika.config.json');
        if (config.framework.version !== this.fromVersion) {
            throw new Error(`Expected version ${this.fromVersion}, found ${config.framework.version}`);
        }

        this.log('Prerequisites check passed');
    }

    async performMigration(): Promise<void> {
        // Override this method in specific migration scripts
        this.log('No migration steps defined');
    }

    async updateConfig(): Promise<void> {
        const config: PikaConfig = await fs.readJson('pika.config.json');
        config.framework.version = this.toVersion;
        config.framework.lastSync = new Date().toISOString();

        await fs.writeJson('pika.config.json', config, { spaces: 2 });
        this.log('Updated configuration');
    }

    addChange(description: string): void {
        this.changes.push(description);
    }

    showSummary(): void {
        if (this.changes.length > 0) {
            this.log('Changes made:', 'info');
            this.changes.forEach((change) => {
                console.log(`  • ${change}`);
            });
        }
    }

    // Utility methods for common migration tasks
    async moveFile(from: string, to: string): Promise<void> {
        if (await fs.pathExists(from)) {
            await fs.move(from, to);
            this.addChange(`Moved ${from} to ${to}`);
            this.log(`Moved ${from} to ${to}`);
        }
    }

    async updateFile(filePath: string, updater: (content: string) => string): Promise<void> {
        if (await fs.pathExists(filePath)) {
            const content = await fs.readFile(filePath, 'utf8');
            const newContent = updater(content);

            if (content !== newContent) {
                await fs.writeFile(filePath, newContent);
                this.addChange(`Updated ${filePath}`);
                this.log(`Updated ${filePath}`);
            }
        }
    }

    async renamePattern(pattern: string, replacer: ReplacerConfig): Promise<void> {
        const files = await glob(pattern);

        for (const file of files) {
            const newName = file.replace(replacer.from, replacer.to);
            if (newName !== file) {
                await this.moveFile(file, newName);
            }
        }
    }

    async replaceInFiles(pattern: string, searchReplace: ReplacerConfig): Promise<void> {
        const files = await glob(pattern);

        for (const file of files) {
            await this.updateFile(file, (content) => {
                return content.replace(searchReplace.from, searchReplace.to);
            });
        }
    }

    async addToFile(filePath: string, content: string, position: 'start' | 'end' = 'end'): Promise<void> {
        if (await fs.pathExists(filePath)) {
            const existingContent = await fs.readFile(filePath, 'utf8');
            const newContent = position === 'start' ? content + '\n' + existingContent : existingContent + '\n' + content;

            await fs.writeFile(filePath, newContent);
            this.addChange(`Added content to ${filePath}`);
            this.log(`Added content to ${filePath}`);
        }
    }

    async createFile(filePath: string, content: string): Promise<void> {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, content);
        this.addChange(`Created ${filePath}`);
        this.log(`Created ${filePath}`);
    }

    async removeFile(filePath: string): Promise<void> {
        if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
            this.addChange(`Removed ${filePath}`);
            this.log(`Removed ${filePath}`);
        }
    }

    async copyFile(from: string, to: string): Promise<void> {
        if (await fs.pathExists(from)) {
            await fs.ensureDir(path.dirname(to));
            await fs.copy(from, to);
            this.addChange(`Copied ${from} to ${to}`);
            this.log(`Copied ${from} to ${to}`);
        }
    }
}

// Example usage for a specific migration
export class Migration_1_0_0_to_1_1_0 extends Migration {
    constructor() {
        super('1.0.0', '1.1.0');
    }

    async performMigration(): Promise<void> {
        this.log('Performing migration from 1.0.0 to 1.1.0');

        // Example: Update auth provider structure
        await this.updateFile('apps/pika-chat/src/auth/providers/custom-auth.ts', (content) => {
            // Example transformation
            return content.replace('export class CustomAuthProvider', 'export class CustomAuthProvider');
        });

        // Example: Move deprecated files
        await this.moveFile('apps/pika-chat/src/hooks.server.ts', 'apps/pika-chat/src/auth/hooks.server.ts');

        // Example: Update configuration structure
        await this.updateFile('pika.config.json', (content) => {
            const config = JSON.parse(content);

            // Add new configuration option
            if (!config.deployment) {
                config.deployment = {
                    region: 'us-east-1',
                    stage: 'dev'
                };
            }

            return JSON.stringify(config, null, 2);
        });

        this.log('Migration steps completed');
    }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error('Usage: tsx migration-template.ts <from-version> <to-version>');
        process.exit(1);
    }

    const [fromVersion, toVersion] = args;
    const migration = new Migration(fromVersion, toVersion);
    migration.run();
}

export default Migration;
