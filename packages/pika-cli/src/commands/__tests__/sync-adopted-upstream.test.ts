import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../../utils/logger.js');
jest.mock('../../utils/module-dir.js', () => ({ moduleDir: '/unused-in-these-tests' }));

import { identifyChanges, reportAdoptedUpstream, analyzeAndReportChanges } from '../sync.js';
import type { GitignoreChecker } from '../../utils/gitignore.js';

// Behaviour matrix for adopted-upstream reporting. The immutable guarantee lives next door in
// sync-adopted-upstream.contract.test.ts; these cover the surrounding cases and may evolve.

const NEVER_IGNORES: GitignoreChecker = { ignores: () => false };
const CUSTOM_DIR = 'apps/pika-chat/src/lib/custom';

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

describe('adopted-upstream reporting — behaviour matrix', () => {
    it('10: reports a protected directory present on both sides, still finding files missing locally', async () => {
        const source = makeTree({
            'README.md': 'framework',
            [`${CUSTOM_DIR}/present.ts`]: 'pika version',
            [`${CUSTOM_DIR}/missing-locally.ts`]: 'pika only'
        });
        const target = makeTree({ 'README.md': 'framework', [`${CUSTOM_DIR}/present.ts`]: 'our version' });

        const { changes, adoptedUpstream } = await identifyChanges(source, target, [CUSTOM_DIR], NEVER_IGNORES);

        expect(adoptedUpstream).toContain(CUSTOM_DIR);
        // The existing "recurse into a protected directory to find missing files" behaviour must survive.
        expect(changes.map((change) => change.path)).toContain(`${CUSTOM_DIR}/missing-locally.ts`);
    });

    it('11: reports the adopted child when protection is expressed as a /** glob', async () => {
        const source = makeTree({ 'README.md': 'framework', [`${CUSTOM_DIR}/adopted.ts`]: 'pika version' });
        const target = makeTree({ 'README.md': 'framework', [`${CUSTOM_DIR}/adopted.ts`]: 'our version' });

        const { adoptedUpstream } = await identifyChanges(source, target, [`${CUSTOM_DIR}/**`], NEVER_IGNORES);

        expect(adoptedUpstream).toContain(`${CUSTOM_DIR}/adopted.ts`);
    });

    // 12 — the report must be identical for a dry run. identifyChanges takes no options, so the data
    // surface cannot differ by mode; what remains is that the render happens before sync's early
    // returns. This covers the renderer; placement ahead of both early returns is by inspection.
    it('12: renders a user-protected adoption with migration guidance, and summarises the defaults', () => {
        const logged: string[] = [];
        const spy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
            logged.push(args.join(' '));
        });

        reportAdoptedUpstream([`${CUSTOM_DIR}/adopted.ts`, 'package.json', '.gitignore'], [`${CUSTOM_DIR}/**`]);
        spy.mockRestore();

        const output = logged.join('\n');
        expect(output).toContain(`${CUSTOM_DIR}/adopted.ts`);
        expect(output).toContain('pika capture-patch <file>');
        // The two framework defaults are counted, not listed, so they cannot bury the real signal.
        expect(output).toContain('2 default-protected');
        expect(output).not.toContain('package.json');
    });

    // The adoption-only case: nothing ordinary to update, only a coexisting protected path. sync has
    // early returns for zero-changes, --diff, --visual-diff and --dry-run between analysis and apply,
    // so a report placed after any of them is precisely the one the consumer never sees. Reporting is
    // fused to the analysis, which is what this asserts.
    it('reports the adoption even when there are no ordinary changes to apply', async () => {
        const source = makeTree({ 'README.md': 'framework', [`${CUSTOM_DIR}/adopted.ts`]: 'pika version' });
        const target = makeTree({ 'README.md': 'framework', [`${CUSTOM_DIR}/adopted.ts`]: 'our version' });

        const logged: string[] = [];
        const spy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
            logged.push(args.join(' '));
        });
        const changes = await analyzeAndReportChanges(source, target, [`${CUSTOM_DIR}/**`], NEVER_IGNORES, [`${CUSTOM_DIR}/**`]);
        spy.mockRestore();

        // Nothing ordinary to do — this is the branch that returns "no framework updates to apply".
        expect(changes).toEqual([]);
        // ...and the consumer is told anyway, because the report happens during analysis.
        expect(logged.join('\n')).toContain(`${CUSTOM_DIR}/adopted.ts`);
    });

    it('prints nothing at all when no protected path exists upstream', () => {
        const logged: string[] = [];
        const spy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
            logged.push(args.join(' '));
        });

        reportAdoptedUpstream([], ['anything/**']);
        spy.mockRestore();

        expect(logged).toEqual([]);
    });
});
