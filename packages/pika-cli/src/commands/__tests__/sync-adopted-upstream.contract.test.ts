import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

// Suppress CLI logging during tests.
jest.mock('../../utils/logger.js');
// `module-dir` is the one module that touches `import.meta`, which the CommonJS test transform
// cannot parse. A factory mock keeps the real file from ever being loaded here.
jest.mock('../../utils/module-dir.js', () => ({ moduleDir: '/unused-in-these-tests' }));

import { identifyChanges, type SyncChange } from '../sync.js';
import type { GitignoreChecker } from '../../utils/gitignore.js';

// THE CONTRACT
// ------------
// When a path matching protectedAreas/userProtectedAreas exists BOTH locally and in the incoming
// Pika version, sync must report that path as adopted upstream. The file must still not be
// overwritten — reporting changes visibility, never behaviour.
//
// Both halves are load-bearing. A change that starts overwriting protected files to "resolve" the
// divergence is a regression, not a fix.
//
// This file is the immutable lock on that guarantee. Strengthen these assertions; never weaken them.

const NEVER_IGNORES: GitignoreChecker = { ignores: () => false };
const ADOPTED = 'apps/pika-chat/src/lib/custom/legacy-session-loader.ts';

const cleanups: string[] = [];
afterEach(() => {
    while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function makeTree(files: Record<string, string>): string {
    const root = mkdtempSync(path.join(os.tmpdir(), 'pika-adopted-'));
    cleanups.push(root);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolute = path.join(root, relativePath);
        mkdirSync(path.dirname(absolute), { recursive: true });
        writeFileSync(absolute, contents);
    }
    return root;
}

/** The reported adopted-upstream paths, or [] when the surface does not exist yet. */
function adoptedUpstream(result: unknown): string[] {
    return (result as { adoptedUpstream?: string[] })?.adoptedUpstream ?? [];
}

/** The change list, tolerant of identifyChanges returning either the bare array or a result object. */
function changeList(result: unknown): SyncChange[] {
    return Array.isArray(result) ? (result as SyncChange[]) : ((result as { changes?: SyncChange[] })?.changes ?? []);
}

describe('adopted-upstream contract', () => {
    // C2 — THE CONTRACT. Pika has adopted a file the consumer protects. Today the consumer has no
    // way to find out: the file is skipped in silence and never tracks upstream again.
    it('C2: reports a protected path that now also exists upstream, without overwriting it', async () => {
        const source = makeTree({ 'README.md': 'framework', [ADOPTED]: 'PIKA VERSION — newly adopted upstream' });
        const target = makeTree({ 'README.md': 'framework', [ADOPTED]: 'OUR VERSION — customised locally' });

        const result = await identifyChanges(source, target, [ADOPTED], NEVER_IGNORES);

        // The consumer must be told. Asserted first, so the failure names the unreported path.
        expect(adoptedUpstream(result)).toContain(ADOPTED);

        // ...and telling them must not change what happens: the file is neither overwritten now
        // nor queued to be overwritten later.
        expect(readFileSync(path.join(target, ADOPTED), 'utf8')).toBe('OUR VERSION — customised locally');
        expect(changeList(result).map((change) => change.path)).not.toContain(ADOPTED);
    });

    // 8 — REGRESSION BASELINE. The ordinary case: protected locally, absent upstream. Nothing to
    // report, and nothing about it may change.
    it('8: says nothing about a protected file that does not exist upstream', async () => {
        const source = makeTree({ 'README.md': 'framework' });
        const target = makeTree({ 'README.md': 'framework', [ADOPTED]: 'OUR VERSION — customised locally' });

        const result = await identifyChanges(source, target, [ADOPTED], NEVER_IGNORES);

        expect(adoptedUpstream(result)).not.toContain(ADOPTED);
        expect(readFileSync(path.join(target, ADOPTED), 'utf8')).toBe('OUR VERSION — customised locally');
    });

    // 9 — REGRESSION BASELINE. First-time sync: a protected path absent locally still falls
    // through and takes Pika's copy. That is deliberate, and is not an adoption.
    it('9: still takes Pika’s copy for a protected path missing locally, and reports no adoption', async () => {
        const source = makeTree({ 'README.md': 'framework', [ADOPTED]: 'PIKA VERSION — first-time sync' });
        const target = makeTree({ 'README.md': 'framework' });

        const result = await identifyChanges(source, target, [ADOPTED], NEVER_IGNORES);

        expect(changeList(result).map((change) => change.path)).toContain(ADOPTED);
        expect(adoptedUpstream(result)).not.toContain(ADOPTED);
    });
});
