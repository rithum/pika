import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

// Suppress CLI logging during tests.
jest.mock('../../utils/logger.js');
// `module-dir` is the one module that touches `import.meta`, which the CommonJS test transform
// cannot parse. A factory mock keeps the real file from ever being loaded here.
jest.mock('../../utils/module-dir.js', () => ({ moduleDir: '/unused-in-these-tests' }));

import { isProtectedArea, getEffectiveProtectedAreas } from '../sync.js';
import { findProtectedTargetPatches } from '../../utils/pika-patches.js';

const patchFor = (...targets: string[]): string =>
    targets.map((t) => `diff --git a/${t} b/${t}\n--- a/${t}\n+++ b/${t}\n@@ -1 +1 @@\n-a\n+b\n`).join('');

const cleanups: string[] = [];
afterEach(() => {
    while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function makeTempDir(): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'patch-targets-'));
    cleanups.push(dir);
    return dir;
}

describe('isProtectedArea', () => {
    it('protects an exact path listed in the areas', () => {
        expect(isProtectedArea('services/x/a.py', ['services/x/a.py'])).toBe(true);
    });

    it('protects nested files and the directory itself for a directory glob', () => {
        expect(isProtectedArea('services/custom/a/b.ts', ['services/custom/**'])).toBe(true);
        expect(isProtectedArea('services/custom', ['services/custom/**'])).toBe(true);
    });

    it('protects the subtree of a trailing-slash area', () => {
        expect(isProtectedArea('apps/custom/x.ts', ['apps/custom/'])).toBe(true);
    });

    it('matches a basename pattern at any depth', () => {
        expect(isProtectedArea('apps/pika-chat/package.json', ['package.json'])).toBe(true);
    });

    it('matches glob basename variants at any depth', () => {
        expect(isProtectedArea('apps/pika-chat/.env.local', ['.env*'])).toBe(true);
    });

    it('protects a custom- path segment with no areas', () => {
        expect(isProtectedArea('apps/pika-chat/src/custom-foo/x.ts', [])).toBe(true);
    });

    it('does not protect an unprotected framework path', () => {
        expect(isProtectedArea('services/pika/src/lambda/converse-strands/handler.py', ['services/custom/**'])).toBe(false);
    });
});

describe('findProtectedTargetPatches', () => {
    it('reports only protected targets in patch order', async () => {
        const dir = makeTempDir();
        const patches = path.join(dir, 'pika-patches');
        mkdirSync(patches);
        writeFileSync(path.join(patches, '001-a.patch'), patchFor('services/x/handler.py'));
        writeFileSync(path.join(patches, '002-b.patch'), patchFor('services/x/tests/test_a.py'));
        writeFileSync(path.join(patches, '003-c.patch'), patchFor('services/x/y.ts', 'docs/README.md'));
        writeFileSync(path.join(patches, 'README.md'), 'not a patch\n');

        const result = await findProtectedTargetPatches(dir, (rel) => isProtectedArea(rel, ['README.md', 'services/x/tests/test_a.py']));

        expect(result).toEqual([
            { patch: '002-b.patch', target: 'services/x/tests/test_a.py' },
            { patch: '003-c.patch', target: 'docs/README.md' },
        ]);
    });

    it('returns an empty list when pika-patches is missing', async () => {
        const dir = makeTempDir();
        expect(await findProtectedTargetPatches(dir, () => true)).toEqual([]);
    });
});

describe('getEffectiveProtectedAreas', () => {
    it('merges defaults, stored and user areas without duplicates', () => {
        const result = getEffectiveProtectedAreas(['a/**'], { protectedAreas: ['b.ts', 'a/**'], userProtectedAreas: ['c/'] });
        expect(result).toEqual(['a/**', 'b.ts', 'c/']);
        expect(isProtectedArea('c/x.ts', result)).toBe(true);
    });
});
