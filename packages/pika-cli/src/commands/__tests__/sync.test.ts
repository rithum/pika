import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

// Suppress CLI logging during tests.
jest.mock('../../utils/logger.js');
// `module-dir` is the one module that touches `import.meta`, which the CommonJS test transform
// cannot parse. A factory mock keeps the real file from ever being loaded here.
jest.mock('../../utils/module-dir.js', () => ({ moduleDir: '/unused-in-these-tests' }));

import { identifyChanges, findDeletedFiles, type SyncChange } from '../sync.js';
import type { GitignoreChecker } from '../../utils/gitignore.js';

// Real filesystem on throwaway temp trees. Sync's job is to compare two directories and decide what
// to copy or remove, so mocking the filesystem would leave nothing meaningful under test.

const NEVER_IGNORES: GitignoreChecker = { ignores: () => false };

const cleanups: string[] = [];
afterEach(() => {
    while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function makeTree(files: Record<string, string>): string {
    const root = mkdtempSync(path.join(os.tmpdir(), 'pika-sync-'));
    cleanups.push(root);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolute = path.join(root, relativePath);
        mkdirSync(path.dirname(absolute), { recursive: true });
        writeFileSync(absolute, contents);
    }
    return root;
}

function changeFor(changes: SyncChange[], relativePath: string): SyncChange | undefined {
    return changes.find((change) => change.path === relativePath);
}

describe('sync command', () => {
    describe('bug fix verification', () => {
        it('should not incorrectly mark remote changes as user modifications', async () => {
            // A file updated upstream is an ordinary remote change. The old detectUserModifications
            // logic mislabelled these as user edits; nothing may set that flag now.
            const source = makeTree({ 'apps/pika-chat/src/app.ts': 'updated upstream' });
            const target = makeTree({ 'apps/pika-chat/src/app.ts': 'the version we synced last time' });

            const { changes } = await identifyChanges(source, target, [], NEVER_IGNORES);

            const change = changeFor(changes, 'apps/pika-chat/src/app.ts');
            expect(change?.type).toBe('modified');
            expect(change?.isUserModification).toBeUndefined();
        });
    });

    describe('protected areas', () => {
        it('should respect protected areas', async () => {
            // A protected file that differs from the framework must never be queued for overwrite,
            // while an unprotected sibling in the same directory still is.
            const source = makeTree({
                'apps/pika-chat/src/lib/custom/mine.ts': 'framework version',
                'apps/pika-chat/src/lib/theirs.ts': 'framework version'
            });
            const target = makeTree({
                'apps/pika-chat/src/lib/custom/mine.ts': 'my customisation',
                'apps/pika-chat/src/lib/theirs.ts': 'stale copy'
            });

            const { changes } = await identifyChanges(source, target, ['apps/pika-chat/src/lib/custom/**'], NEVER_IGNORES);

            expect(changeFor(changes, 'apps/pika-chat/src/lib/custom/mine.ts')).toBeUndefined();
            expect(changeFor(changes, 'apps/pika-chat/src/lib/theirs.ts')?.type).toBe('modified');
        });
    });

    describe('file comparison', () => {
        it('should correctly identify changed files', async () => {
            // Three outcomes: differing content is 'modified', a file the target lacks is 'added',
            // and identical content produces no change at all.
            const source = makeTree({
                'changed.ts': 'new content',
                'brand-new.ts': 'only upstream has this',
                'identical.ts': 'same on both sides'
            });
            const target = makeTree({
                'changed.ts': 'old content',
                'identical.ts': 'same on both sides'
            });

            const { changes } = await identifyChanges(source, target, [], NEVER_IGNORES);

            expect(changeFor(changes, 'changed.ts')?.type).toBe('modified');
            expect(changeFor(changes, 'brand-new.ts')?.type).toBe('added');
            expect(changeFor(changes, 'identical.ts')).toBeUndefined();
        });
    });

    describe('gitignore respect', () => {
        it('should not delete paths matched by downstream .gitignore', async () => {
            // Sync passes a checker built from the project's .gitignore to findDeletedFiles. An
            // ignored path is never marked for deletion; a non-ignored one still is.
            const source = makeTree({ 'keep.ts': 'framework' });
            const target = makeTree({
                'keep.ts': 'framework',
                'build-output.ts': 'generated, gitignored',
                'stale.ts': 'not in the framework any more'
            });
            const ignoresBuildOutput: GitignoreChecker = {
                ignores: (relativePath) => relativePath === 'build-output.ts'
            };

            const changes: SyncChange[] = [];
            await findDeletedFiles(source, target, '', [], changes, ignoresBuildOutput);

            const deleted = changes.filter((change) => change.type === 'deleted').map((change) => change.path);
            expect(deleted).not.toContain('build-output.ts');
            expect(deleted).toContain('stale.ts');
        });
    });
});
