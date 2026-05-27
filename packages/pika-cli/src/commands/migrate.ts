import chalk from 'chalk';
import { exec } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, lstatSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

interface MigrateOptions {
    dryRun?: boolean;
    force?: boolean;
    /**
     * When set, allow deleting files whose contents differ from the known v0.26.0 default stub
     * (e.g. a consumer customized the legacy hook in place). Defaults to false — diverged files
     * are skipped with a warning so the consumer can review.
     */
    forceContentMismatch?: boolean;
}

const MIGRATION_ID = 'v0.26.0-v0.27.0';

/**
 * Files removed in pika v0.27.0 that must be deleted from consumer trees, with the SHA-256
 * of the v0.26.0 default no-op stub. If the file content matches, deletion is safe. If it
 * diverges, the consumer customized the file in place — the migrate tool warns and skips
 * unless --force-content-mismatch is passed.
 */
const FILES_TO_DELETE: ReadonlyArray<{ relPath: string; defaultSha256: string }> = [
    {
        relPath: 'apps/pika-chat/src/lib/custom/legacy-session-loader.ts',
        defaultSha256: '83914a46e834763cf451cec350d9090e30b2481b9ba1a15e5074bd74f59639a8'
    },
    {
        relPath: 'apps/pika-chat/src/lib/custom/legacy-chats-section-header.ts',
        defaultSha256: 'b7ac0674e2f749731a351ebf2aec6acb4d8e29fbdd6323637169d9d9dc74be50'
    },
    {
        relPath: 'apps/pika-chat/src/lib/custom/legacy-chats-section-trigger.ts',
        defaultSha256: '077837a6e731e8ec831f53ae7ad6a9d10dfeead4fdb97919e2e6c02b37f16e76'
    },
    {
        relPath: 'apps/pika-chat/src/lib/custom/legacy-user-validator.ts',
        defaultSha256: 'b92a0f662011701095752f8b9ef76a4ff73fc96b7c2b29bb7f35b60272a8f4c5'
    }
];

function sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
}

function looksLikePikaConsumer(projectRoot: string): boolean {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (!existsSync(pkgPath)) return false;
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
            name?: string;
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        if (pkg.name === '@pika/root') return true;
        const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        return Object.keys(allDeps).some(d => d === 'pika-cli' || d.startsWith('@pika/'));
    } catch {
        return false;
    }
}

export async function migrateCommand(migrationId: string, options: MigrateOptions = {}): Promise<void> {
    if (migrationId !== MIGRATION_ID) {
        logger.error(`Unknown migration: ${migrationId}`);
        logger.info(`Available migrations: ${MIGRATION_ID}`);
        process.exit(1);
    }

    const projectRoot = process.cwd();

    if (!options.force && !looksLikePikaConsumer(projectRoot)) {
        logger.error(`${projectRoot} does not look like a pika consumer tree (no package.json with a pika dependency).`);
        logger.info('Re-run from the consumer project root, or pass --force to override this check.');
        process.exit(1);
    }

    if (!options.dryRun && !options.force) {
        // Check for dirty working tree; refuse if uncommitted changes exist.
        let gitStatusOutput: string | undefined;
        let gitCheckSkipped = false;
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
        } catch (err) {
            // ENOENT (git not installed) or "not a git repo" — log and require --force to proceed.
            gitCheckSkipped = true;
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`git status check failed: ${msg}`);
        }
        if (gitCheckSkipped) {
            logger.error('Could not verify a clean working tree. Re-run inside a git repo with `git` on PATH, or pass --force.');
            process.exit(1);
        }
        if (gitStatusOutput !== undefined && gitStatusOutput.trim().length > 0) {
            logger.error('Working tree has uncommitted changes.');
            logger.info('Commit or stash your changes before running migrate, or pass --force to skip this check.');
            process.exit(1);
        }
    }

    if (options.dryRun) {
        console.log(chalk.cyan(`Dry run — migration ${MIGRATION_ID}:`));
        for (const { relPath, defaultSha256 } of FILES_TO_DELETE) {
            const absPath = path.join(projectRoot, relPath);
            if (!existsSync(absPath)) {
                console.log(chalk.gray(`  already removed: ${relPath}`));
                continue;
            }
            const stat = lstatSync(absPath);
            if (stat.isSymbolicLink()) {
                console.log(chalk.red(`  SKIP (symlink): ${relPath}`));
                continue;
            }
            const actualSha256 = sha256(readFileSync(absPath));
            if (actualSha256 === defaultSha256) {
                console.log(chalk.yellow(`  would delete (matches v0.26.0 default): ${relPath}`));
            } else if (options.forceContentMismatch) {
                console.log(chalk.yellow(`  would delete (--force-content-mismatch, customized): ${relPath}`));
            } else {
                console.log(chalk.red(`  SKIP (customized — content differs from v0.26.0 default): ${relPath}`));
            }
        }
        return;
    }

    console.log(chalk.cyan(`Running migration ${MIGRATION_ID}...`));
    let deletedCount = 0;
    const failures: { relPath: string; reason: string }[] = [];
    const skipped: { relPath: string; reason: string }[] = [];

    for (const { relPath, defaultSha256 } of FILES_TO_DELETE) {
        const absPath = path.join(projectRoot, relPath);
        if (!existsSync(absPath)) {
            logger.info(`already removed: ${relPath}`);
            continue;
        }

        let stat;
        try {
            stat = lstatSync(absPath);
        } catch (err) {
            failures.push({ relPath, reason: err instanceof Error ? err.message : String(err) });
            continue;
        }

        if (stat.isSymbolicLink()) {
            skipped.push({ relPath, reason: 'path is a symlink (refusing to follow)' });
            continue;
        }

        const actualSha256 = sha256(readFileSync(absPath));
        if (actualSha256 !== defaultSha256 && !options.forceContentMismatch) {
            skipped.push({ relPath, reason: 'content differs from v0.26.0 default (likely customized); pass --force-content-mismatch to delete anyway' });
            continue;
        }

        try {
            rmSync(absPath);
            logger.success(`deleted: ${relPath}`);
            deletedCount++;
        } catch (err) {
            failures.push({ relPath, reason: err instanceof Error ? err.message : String(err) });
        }
    }

    for (const { relPath, reason } of skipped) {
        logger.warn(`skipped ${relPath}: ${reason}`);
    }
    for (const { relPath, reason } of failures) {
        logger.error(`failed to delete ${relPath}: ${reason}`);
    }

    if (failures.length > 0) {
        logger.error(`Migration ${MIGRATION_ID} completed with ${failures.length} failure(s).`);
        process.exit(1);
    }

    if (deletedCount === 0 && skipped.length === 0) {
        logger.info('Nothing to do — all files already removed.');
    } else if (deletedCount === 0) {
        logger.warn(`Migration ${MIGRATION_ID}: no files deleted (${skipped.length} skipped). Review the warnings above.`);
    } else {
        logger.success(`Migration ${MIGRATION_ID} complete. ${deletedCount} file(s) deleted${skipped.length > 0 ? `, ${skipped.length} skipped` : ''}.`);
    }
}
