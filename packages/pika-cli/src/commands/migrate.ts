import chalk from 'chalk';
import { exec } from 'child_process';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

interface MigrateOptions {
    dryRun?: boolean;
    force?: boolean;
}

const MIGRATION_ID = 'v0.26.0-v0.27.0';

// Files removed in pika v0.27.0 that must be deleted from consumer trees.
const FILES_TO_DELETE = [
    'apps/pika-chat/src/lib/custom/legacy-session-loader.ts',
    'apps/pika-chat/src/lib/custom/legacy-chats-section-header.ts',
    'apps/pika-chat/src/lib/custom/legacy-chats-section-trigger.ts',
    'apps/pika-chat/src/lib/custom/legacy-user-validator.ts'
];

export async function migrateCommand(migrationId: string, options: MigrateOptions = {}): Promise<void> {
    if (migrationId !== MIGRATION_ID) {
        logger.error(`Unknown migration: ${migrationId}`);
        logger.info(`Available migrations: ${MIGRATION_ID}`);
        process.exit(1);
    }

    const projectRoot = process.cwd();

    if (!options.dryRun && !options.force) {
        // Check for dirty working tree; refuse if uncommitted changes exist.
        let gitStatusOutput: string | undefined;
        try {
            const result = await execAsync('git status --porcelain', { cwd: projectRoot });
            // execAsync resolves to {stdout, stderr} in production (util.promisify.custom on real exec).
            // Under jest mocks (no custom symbol), promisify resolves to [stdout, stderr] when the
            // callback passes two success args. Handle all three shapes.
            if (typeof result === 'string') {
                gitStatusOutput = result;
            } else if (Array.isArray(result)) {
                gitStatusOutput = (result as string[])[0] ?? '';
            } else {
                gitStatusOutput = (result as { stdout: string }).stdout ?? '';
            }
        } catch {
            // git not available or not a git repo — proceed without the check
        }
        if (gitStatusOutput !== undefined && gitStatusOutput.trim().length > 0) {
            logger.error('Working tree has uncommitted changes.');
            logger.info('Commit or stash your changes before running migrate, or pass --force to skip this check.');
            process.exit(1);
        }
    }

    if (options.dryRun) {
        console.log(chalk.cyan(`Dry run — migration ${MIGRATION_ID}:`));
        for (const relPath of FILES_TO_DELETE) {
            const absPath = path.join(projectRoot, relPath);
            if (existsSync(absPath)) {
                console.log(chalk.yellow(`  would delete: ${relPath}`));
            } else {
                console.log(chalk.gray(`  already removed: ${relPath}`));
            }
        }
        return;
    }

    console.log(chalk.cyan(`Running migration ${MIGRATION_ID}...`));
    let deletedCount = 0;

    for (const relPath of FILES_TO_DELETE) {
        const absPath = path.join(projectRoot, relPath);
        if (!existsSync(absPath)) {
            logger.info(`already removed: ${relPath}`);
            continue;
        }
        rmSync(absPath);
        logger.success(`deleted: ${relPath}`);
        deletedCount++;
    }

    if (deletedCount === 0) {
        logger.info('Nothing to do — all files already removed.');
    } else {
        logger.success(`Migration ${MIGRATION_ID} complete. ${deletedCount} file(s) deleted.`);
    }
}
