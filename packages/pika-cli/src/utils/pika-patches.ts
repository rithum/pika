// pika-patches overlay: reapply consumer patches after sync + a capture-completeness gate.
// Kept dependency-light (git + fs only) so it's unit-testable without the sync module graph.

import chalk from 'chalk';
import { exec } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import fsExtra from 'fs-extra';
import { mkdtemp, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { promisify } from 'util';
import { logger } from './logger.js';

const execAsync = promisify(exec);

export const PATCHES_DIR_NAME = 'pika-patches';

/** Minimal shape of a sync change the gate cares about (subset of sync.ts's SyncChange). */
export interface PatchableChange {
    type: 'modified' | 'added' | 'deleted';
    path: string;
}

/** Lexically-ordered absolute paths of pika-patches/*.patch (NNN- prefix controls apply order). */
export async function listPatchFiles(projectRoot: string): Promise<string[]> {
    const patchesDir = path.join(projectRoot, PATCHES_DIR_NAME);
    if (!existsSync(patchesDir)) return [];
    const entries = await readdir(patchesDir);
    return entries
        .filter((f) => f.endsWith('.patch'))
        .sort()
        .map((f) => path.join(patchesDir, f));
}

/** Target file paths a patch touches (the `+++ b/<path>` lines). */
export function parsePatchTargets(patchText: string): string[] {
    const targets: string[] = [];
    for (const line of patchText.split('\n')) {
        const m = line.match(/^\+\+\+ b\/(.+?)\s*$/);
        if (m) targets.push(m[1]);
    }
    return targets;
}

/**
 * Reapply pika-patches/*.patch onto the just-synced files via `git apply --3way`. Failure is keyed
 * off git-apply's exit code (covers both `.rej` and in-file conflict markers), so it never passes
 * silently. Throws on failure; no-op if there are no patches.
 */
export async function reapplyPikaPatches(projectRoot: string): Promise<void> {
    const patchFiles = await listPatchFiles(projectRoot);
    if (patchFiles.length === 0) return;

    // `git apply --3way` needs the index to match the just-overwritten (pristine) working tree, so
    // stage the patch targets first; reset the index back to HEAD afterwards (a clean reapply then
    // leaves the working tree == committed-custom with no spurious staged diff).
    const targets = new Set<string>();
    for (const pf of patchFiles) {
        for (const t of parsePatchTargets(readFileSync(pf, 'utf8'))) {
            if (existsSync(path.join(projectRoot, t))) targets.add(t);
        }
    }
    const targetArgs = [...targets].map((t) => `"${t}"`).join(' ');

    const failed: string[] = [];
    try {
        if (targetArgs) await execAsync(`git add -- ${targetArgs}`, { cwd: projectRoot });
        for (const patchPath of patchFiles) {
            try {
                await execAsync(`git apply --3way "${patchPath}"`, { cwd: projectRoot });
                logger.debug(`[DEBUG] reapplied patch: ${path.basename(patchPath)}`);
            } catch (e) {
                failed.push(path.basename(patchPath));
                logger.debug(`[DEBUG] patch failed to reapply: ${path.basename(patchPath)}: ${e instanceof Error ? e.message : e}`);
            }
        }
    } finally {
        if (targetArgs) await execAsync(`git reset -q -- ${targetArgs}`, { cwd: projectRoot }).catch(() => {});
    }

    if (failed.length > 0) {
        console.log();
        console.log(chalk.red.bold(`✗ ${failed.length} pika-patch(es) failed to reapply after sync:`));
        failed.forEach((f) => console.log(chalk.red(`    ${PATCHES_DIR_NAME}/${f}`)));
        console.log();
        console.log(chalk.yellow('  The framework changed underneath these patches. This is the promotion signal:'));
        console.log(chalk.gray('    1. Resolve the <<<<<<< conflict markers (or .rej hunks) in the affected file(s).'));
        console.log(chalk.gray(`    2. Re-run \`pika capture-patch <file>\` to refresh the patch against the new pristine, OR`));
        console.log(chalk.gray('       promote the change to a pika seam upstream and delete the obsolete patch.'));
        throw new Error(`pika sync: ${failed.length} pika-patch(es) failed to reapply`);
    }

    logger.success(`Reapplied ${patchFiles.length} pika-patch(es)`);
}

/**
 * Returns framework files whose committed content != `pristine + pika-patches` — uncaptured
 * divergence a sync would overwrite. The equality is checked over the union of (framework files that
 * differ from pristine) and (files any patch targets), minus protected files (`isProtected`).
 */
export async function checkCaptureCompleteness(
    pristineDir: string,
    changes: PatchableChange[],
    projectRoot: string,
    isProtected: (rel: string) => boolean
): Promise<string[]> {
    const patchFiles = await listPatchFiles(projectRoot);

    const patchTargets = new Set<string>();
    for (const pf of patchFiles) {
        for (const t of parsePatchTargets(readFileSync(pf, 'utf8'))) patchTargets.add(t);
    }

    // Universe: framework files that differ from pristine ∪ files any patch targets — minus protected
    // files (sync never overwrites those, so they can't be "lost", incl. pika-patches/** itself).
    const universe = new Set<string>();
    for (const c of changes) {
        if (c.type === 'modified') universe.add(c.path);
    }
    for (const t of patchTargets) universe.add(t);
    for (const rel of [...universe]) {
        if (isProtected(rel)) universe.delete(rel);
    }
    if (universe.size === 0) return [];

    // expected = pristine + patches, built in a scratch dir (plain `git apply`; the patch pre-image
    // IS the pinned pristine, so no 3-way needed).
    const scratch = await mkdtemp(path.join(tmpdir(), 'pika-gate-'));
    const offenders = new Set<string>();
    try {
        for (const rel of universe) {
            const src = path.join(pristineDir, rel);
            if (existsSync(src)) {
                const dest = path.join(scratch, rel);
                fsExtra.ensureDirSync(path.dirname(dest));
                fsExtra.copySync(src, dest);
            }
        }
        for (const pf of patchFiles) {
            try {
                await execAsync(`git apply -p1 "${pf}"`, { cwd: scratch });
            } catch {
                // Stale patch (no longer applies to pinned pristine) → flag its targets.
                for (const t of parsePatchTargets(readFileSync(pf, 'utf8'))) offenders.add(t);
            }
        }
        for (const rel of universe) {
            const consumerPath = path.join(projectRoot, rel);
            const expectedPath = path.join(scratch, rel);
            const consumer = existsSync(consumerPath) ? readFileSync(consumerPath, 'utf8') : null;
            const expected = existsSync(expectedPath)
                ? readFileSync(expectedPath, 'utf8')
                : existsSync(path.join(pristineDir, rel))
                  ? readFileSync(path.join(pristineDir, rel), 'utf8')
                  : null;
            if (consumer !== expected) offenders.add(rel);
        }
    } finally {
        fsExtra.removeSync(scratch);
    }
    return [...offenders].sort();
}
