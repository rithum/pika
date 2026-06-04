import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import path from 'path';

export interface CapturePatchOptions {
    name?: string;
    reason?: string;
    upstreamTicket?: string;
    owner?: string;
}

export const PATCHES_DIR = 'pika-patches';

/**
 * `pika capture-patch [file]` — capture an edit to a framework-owned file as a pika-patches/ patch
 * so it survives the next sync. Diffs the working tree against HEAD (pristine→custom) and does NOT
 * revert: commit the custom file + the patch together. `pika sync` re-derives the edit via
 * `git apply --3way` after the file is overwritten; the patch's pristine pre-image stays reachable
 * in history from the last clean sync.
 */
export async function capturePatchCommand(file: string | undefined, options: CapturePatchOptions = {}): Promise<void> {
    const projectRoot = findProjectRoot(process.cwd());
    if (!projectRoot) {
        logger.error('Not in a Pika project (no .pika-sync.json found in this or any parent directory).');
        process.exit(1);
    }

    // Auto-detect the target from the working tree if not given.
    let target = file;
    if (!target) {
        const changed = gitChangedFiles(projectRoot);
        if (changed.length === 0) {
            logger.error('No modified files detected. Edit a framework file first, or pass an explicit <file>.');
            process.exit(1);
        }
        if (changed.length > 1) {
            logger.error('Multiple modified files detected — pass the one to capture explicitly:');
            changed.forEach((f) => console.log(chalk.gray(`    ${f}`)));
            process.exit(1);
        }
        target = changed[0];
        console.log(chalk.gray(`Auto-detected changed file: ${target}`));
    }
    target = toRepoRelative(projectRoot, target);

    // Diff vs the committed (pristine) version.
    const diff = gitDiffHead(projectRoot, target);
    if (!diff.trim()) {
        logger.error(`No uncommitted changes in ${target}.`);
        console.log(chalk.gray('  capture-patch diffs the working tree against HEAD; edit the file before capturing.'));
        console.log(chalk.gray('  (Migrating an already-committed divergence? Reset the committed file to pristine first — see CUSTOM_PROTECTION.md.)'));
        process.exit(1);
    }

    const name = options.name || deriveName(target);
    const patchesDir = path.join(projectRoot, PATCHES_DIR);
    if (!existsSync(patchesDir)) {
        mkdirSync(patchesDir, { recursive: true });
    }
    const seq = nextSequence(patchesDir);
    const patchPath = path.join(patchesDir, `${seq}-${name}.patch`);

    const owner = options.owner || gitConfig(projectRoot, 'user.email') || 'unknown';
    const created = new Date().toISOString().slice(0, 10);
    const header =
        [
            `# patch: ${name}`,
            `# file: ${target}`,
            `# reason: ${options.reason ?? '(none given)'}`,
            `# owner: ${owner}`,
            `# upstream: ${options.upstreamTicket ?? '(none)'}`,
            `# created: ${created}`,
            `#`,
            `# Reapplied by 'pika sync' via 'git apply --3way' after the framework file is overwritten.`,
            `# On conflict: resolve the markers in ${target}, then re-run 'pika capture-patch ${target}' to`,
            `# refresh this patch against the new pristine base, and delete any '.rej'.`
        ].join('\n') + '\n';

    writeFileSync(patchPath, header + diff);

    logger.success(`Captured ${path.posix.join(PATCHES_DIR, path.basename(patchPath))}`);
    console.log(chalk.gray('  Working tree left CUSTOM (no revert). Commit the custom file + this patch together —'));
    console.log(chalk.gray('  committing pristine would make your change vanish between syncs.'));
    console.log(chalk.gray('  The patch reapplies automatically on the next `pika sync`.'));
}

function findProjectRoot(startDir: string): string | null {
    let dir = path.resolve(startDir);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (existsSync(path.join(dir, '.pika-sync.json'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

function deriveName(target: string): string {
    return path
        .basename(target)
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

function nextSequence(patchesDir: string): string {
    let max = 0;
    for (const entry of readdirSync(patchesDir)) {
        const m = entry.match(/^(\d+)-.*\.patch$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return String(max + 1).padStart(3, '0');
}

function toRepoRelative(projectRoot: string, file: string): string {
    const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    return path.relative(projectRoot, abs).split(path.sep).join('/');
}

function git(projectRoot: string, args: string[]): string {
    return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Files changed in the working tree vs HEAD (staged + unstaged), excluding the patches dir itself. */
function gitChangedFiles(projectRoot: string): string[] {
    const out = git(projectRoot, ['diff', '--name-only', 'HEAD']);
    return out
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((f) => !f.startsWith(`${PATCHES_DIR}/`));
}

function gitDiffHead(projectRoot: string, target: string): string {
    return git(projectRoot, ['diff', 'HEAD', '--', target]);
}

function gitConfig(projectRoot: string, key: string): string | null {
    try {
        return git(projectRoot, ['config', key]).trim() || null;
    } catch {
        return null;
    }
}
