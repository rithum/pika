import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

// Suppress CLI logging during tests.
jest.mock('../../utils/logger.js');
// `module-dir` is the one module that touches `import.meta`, which the CommonJS test transform
// cannot parse. A factory mock keeps the real file from ever being loaded here.
jest.mock('../../utils/module-dir.js', () => ({ moduleDir: '/unused-in-these-tests' }));

import { findDeletedFiles, applyChanges, type SyncChange } from '../sync.js';
import type { GitignoreChecker } from '../../utils/gitignore.js';

// These tests use a REAL filesystem on throwaway temp trees (no fs mocks). The behaviour under
// test is an actual recursive remove, so faking the filesystem would prove nothing: a mocked
// `fs.remove` cannot delete a file that a mocked `fs.exists` reports as still present.
//
// THE CONTRACT
// ------------
// No filesystem path matching protectedAreas/userProtectedAreas is ever removed by a sync,
// regardless of whether the deletion was queued as a file-level or a directory-level change.
//
// This file is the immutable lock on that guarantee. If a change makes one of these fail, the
// change is wrong — not the test. Strengthen these assertions; never weaken them.
//
// AMENDED deliberately (2026-08-18, PR review): `applyChanges` now *requires* the protected-areas
// argument rather than defaulting it to none, so the delete path cannot be invoked without its
// protection context. These calls pass it. The assertions are unchanged — only the call shape is.
// Note this means C1 now exercises the production configuration, where both the queue and apply
// guards are active; a queue-site regression on its own is caught by the queue-list behaviour test.

const NEVER_IGNORES: GitignoreChecker = { ignores: () => false };

const cleanups: string[] = [];
afterEach(() => {
    while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

/** Builds a throwaway tree from a {relativePath: contents} map and returns its root. */
function makeTree(files: Record<string, string>): string {
    const root = mkdtempSync(path.join(os.tmpdir(), 'pika-protected-'));
    cleanups.push(root);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolute = path.join(root, relativePath);
        mkdirSync(path.dirname(absolute), { recursive: true });
        writeFileSync(absolute, contents);
    }
    return root;
}

/** Every file remaining under `root`, as sorted forward-slash relative paths. */
function survivingFiles(root: string, relativePath = ''): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(path.join(root, relativePath), { withFileTypes: true })) {
        const child = path.join(relativePath, entry.name).replace(/\\/g, '/');
        if (entry.isDirectory()) {
            found.push(...survivingFiles(root, child));
        } else {
            found.push(child);
        }
    }
    return found.sort();
}

/** Runs the real sync deletion pipeline: build the change list, then apply it. */
async function runSync(source: string, target: string, protectedAreas: string[]): Promise<void> {
    const changes: SyncChange[] = [];
    await findDeletedFiles(source, target, '', protectedAreas, changes, NEVER_IGNORES);
    await applyChanges(changes, {}, target, NEVER_IGNORES, protectedAreas);
}

describe('sync protected-areas contract', () => {
    // C1 — THE CONTRACT. Reproduces the ai-bot ES-3459 incident: a directory the framework does
    // not have at all, holding one protected and one unprotected consumer file.
    it('C1: never deletes a protected file inside a directory the framework does not have', async () => {
        const source = makeTree({ 'README.md': 'framework' });
        const target = makeTree({
            'README.md': 'framework',
            'services/pika/test/lambda/session-insights-analyzer.test.ts': 'PROTECTED — consumer owns this',
            'services/pika/test/lambda/insights-analyzer.test.ts': 'unprotected leftover'
        });

        await runSync(source, target, ['services/pika/test/lambda/session-insights-analyzer.test.ts']);

        // The protected file must survive. Asserted against the full surviving-file list so that a
        // failure names the file that was deleted rather than just printing "true !== false".
        expect(survivingFiles(target)).toContain('services/pika/test/lambda/session-insights-analyzer.test.ts');

        // ...and the fix must not over-correct: the unprotected sibling is still deleted.
        expect(existsSync(path.join(target, 'services/pika/test/lambda/insights-analyzer.test.ts'))).toBe(false);
    });

    // T7 — REGRESSION BASELINE. File-level protection works today; lock it before touching
    // shared code so a fix to the directory path cannot silently break the file path.
    it('T7: never deletes a protected file queued as a plain file-level deletion', async () => {
        const source = makeTree({ 'README.md': 'framework', 'services/pika/keep/.keep': '' });
        const target = makeTree({
            'README.md': 'framework',
            'services/pika/keep/.keep': '',
            'services/pika/keep/protected-config.ts': 'PROTECTED — consumer owns this',
            'services/pika/keep/stale.ts': 'unprotected leftover'
        });

        await runSync(source, target, ['services/pika/keep/protected-config.ts']);

        expect(survivingFiles(target)).toContain('services/pika/keep/protected-config.ts');
        expect(existsSync(path.join(target, 'services/pika/keep/stale.ts'))).toBe(false);
    });

    // T6 — REGRESSION BASELINE. The existing .gitignore guard is the only guard on the delete
    // path today. It must keep working unchanged after protection is added alongside it.
    it('T6: leaves a .gitignore-matched directory alone', async () => {
        const source = makeTree({ 'README.md': 'framework' });
        const target = makeTree({
            'README.md': 'framework',
            'services/pika/generated/output.ts': 'build output, gitignored'
        });
        const ignoresGenerated: GitignoreChecker = {
            ignores: (relativePath) => relativePath.startsWith('services/pika/generated')
        };

        const changes: SyncChange[] = [];
        await findDeletedFiles(source, target, '', [], changes, ignoresGenerated);
        await applyChanges(changes, {}, target, ignoresGenerated, []);

        expect(survivingFiles(target)).toContain('services/pika/generated/output.ts');
    });
});
