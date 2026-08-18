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

// Behaviour matrix for protected areas on deletion. The immutable guarantee lives next door in
// sync-protected-areas.contract.test.ts; these cover the surrounding cases and may evolve.
// Real filesystem on temp trees — the behaviour under test is an actual recursive remove.

const NEVER_IGNORES: GitignoreChecker = { ignores: () => false };

const cleanups: string[] = [];
afterEach(() => {
    while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

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

async function runSync(source: string, target: string, protectedAreas: string[]): Promise<void> {
    const changes: SyncChange[] = [];
    await findDeletedFiles(source, target, '', protectedAreas, changes, NEVER_IGNORES);
    await applyChanges(changes, {}, target, NEVER_IGNORES, protectedAreas);
}

const FRAMEWORK_ONLY = { 'README.md': 'framework' };

describe('protected areas on deletion — behaviour matrix', () => {
    it('1: keeps the directory and every child when all children are protected', async () => {
        const source = makeTree(FRAMEWORK_ONLY);
        const target = makeTree({
            ...FRAMEWORK_ONLY,
            'services/pika/test/lambda/one.test.ts': 'protected one',
            'services/pika/test/lambda/two.test.ts': 'protected two'
        });

        await runSync(source, target, [
            'services/pika/test/lambda/one.test.ts',
            'services/pika/test/lambda/two.test.ts'
        ]);

        expect(survivingFiles(target)).toEqual([
            'README.md',
            'services/pika/test/lambda/one.test.ts',
            'services/pika/test/lambda/two.test.ts'
        ]);
    });

    it('2: still deletes the whole directory when nothing in it is protected', async () => {
        const source = makeTree(FRAMEWORK_ONLY);
        const target = makeTree({
            ...FRAMEWORK_ONLY,
            'services/pika/test/lambda/one.test.ts': 'stale',
            'services/pika/test/lambda/nested/two.test.ts': 'stale'
        });

        await runSync(source, target, []);

        // The guard must not over-correct into "never delete directories".
        expect(survivingFiles(target)).toEqual(['README.md']);
        expect(existsSync(path.join(target, 'services/pika/test/lambda'))).toBe(false);
    });

    it('3: honours protection expressed as a /** glob', async () => {
        const source = makeTree(FRAMEWORK_ONLY);
        const target = makeTree({
            ...FRAMEWORK_ONLY,
            'services/pika/test/lambda/one.test.ts': 'protected by glob',
            'services/pika/test/lambda/nested/two.test.ts': 'protected by glob'
        });

        await runSync(source, target, ['services/pika/test/lambda/**']);

        expect(survivingFiles(target)).toContain('services/pika/test/lambda/one.test.ts');
        expect(survivingFiles(target)).toContain('services/pika/test/lambda/nested/two.test.ts');
    });

    it('4: keeps a protected file nested two levels below the deleted directory', async () => {
        const source = makeTree(FRAMEWORK_ONLY);
        const target = makeTree({
            ...FRAMEWORK_ONLY,
            'services/pika/test/lambda/deep/keeper.ts': 'protected, buried',
            'services/pika/test/lambda/shallow.ts': 'stale',
            'services/pika/test/other/stale.ts': 'stale'
        });

        await runSync(source, target, ['services/pika/test/lambda/deep/keeper.ts']);

        expect(survivingFiles(target)).toEqual(['README.md', 'services/pika/test/lambda/deep/keeper.ts']);
    });

    it('5: keeps the directory when the protected path is the directory itself', async () => {
        const source = makeTree(FRAMEWORK_ONLY);
        const target = makeTree({
            ...FRAMEWORK_ONLY,
            'services/pika/test/lambda/one.test.ts': 'inside a protected directory'
        });

        await runSync(source, target, ['services/pika/test/lambda']);

        expect(survivingFiles(target)).toContain('services/pika/test/lambda/one.test.ts');
    });

    // The queue site is what the consumer SEES: a dry-run that lists a directory for deletion when
    // protected content lives under it is telling the consumer something untrue. Assert the change
    // list itself, since a correct apply cannot make a misleading dry-run right.
    it('never queues a directory-level deletion when protected content lives under it', async () => {
        const source = makeTree(FRAMEWORK_ONLY);
        const target = makeTree({
            ...FRAMEWORK_ONLY,
            'services/pika/test/lambda/keeper.ts': 'protected',
            'services/pika/test/lambda/stale.ts': 'unprotected'
        });

        const changes: SyncChange[] = [];
        await findDeletedFiles(source, target, '', ['services/pika/test/lambda/keeper.ts'], changes, NEVER_IGNORES);

        const queued = changes.map((change) => change.path).sort();
        expect(queued).not.toContain('services/pika/test/lambda');
        expect(queued).toEqual(['services/pika/test/lambda/stale.ts']);
    });

    // The apply site is the real safety boundary: a directory-level deletion that reaches it by any
    // route — a stale change list, a future caller, a hand-built change — must still be guarded.
    it('guards a hand-constructed directory deletion that never went through the queue', async () => {
        const target = makeTree({
            ...FRAMEWORK_ONLY,
            'services/pika/test/lambda/keeper.ts': 'protected',
            'services/pika/test/lambda/stale.ts': 'unprotected'
        });

        const handBuilt: SyncChange[] = [
            {
                type: 'deleted',
                path: 'services/pika/test/lambda',
                sourcePath: '',
                targetPath: path.join(target, 'services/pika/test/lambda')
            }
        ];

        await applyChanges(handBuilt, {}, target, NEVER_IGNORES, ['services/pika/test/lambda/keeper.ts']);

        expect(survivingFiles(target)).toContain('services/pika/test/lambda/keeper.ts');
        expect(existsSync(path.join(target, 'services/pika/test/lambda/stale.ts'))).toBe(false);
    });
});
