import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

// Suppress CLI logging during tests.
jest.mock('../../utils/logger.js');

import { capturePatchCommand } from '../capture-patch.js';
import { reapplyPikaPatches, checkCaptureCompleteness, parsePatchTargets, type PatchableChange } from '../../utils/pika-patches.js';

// These tests use REAL git on throwaway repos (no child_process mock) — the overlay logic is
// git-mechanics, so faking git would test nothing useful.

const FILE = 'apps/pika-chat/jest.config.js';
const PRISTINE = ['line1', 'line2', 'line3', 'line4', 'line5', ''].join('\n');
const CUSTOM = ['line1', 'line2 EDITED', 'line3', 'line3.5 ADDED', 'line4', 'line5', ''].join('\n');

function git(cwd: string, args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function writeFile(root: string, rel: string, content: string): void {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
}

/** A consumer repo whose committed FILE is pristine (the state right after a clean sync). */
function makeConsumerRepo(): string {
    const root = mkdtempSync(path.join(os.tmpdir(), 'pika-consumer-'));
    git(root, ['init', '-q']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    writeFile(root, '.pika-sync.json', JSON.stringify({ pikaVersion: '0.0.0', protectedAreas: [], userProtectedAreas: ['pika-patches/**'] }));
    writeFile(root, FILE, PRISTINE);
    git(root, ['add', '-A']);
    git(root, ['commit', '-qm', 'pristine']);
    return root;
}

/** A pristine source tree (what `pika sync` would copy in), for the gate. */
function makePristineDir(fileContent = PRISTINE): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pika-pristine-'));
    writeFile(dir, FILE, fileContent);
    return dir;
}

let cwdSpy: jest.SpiedFunction<typeof process.cwd>;
const cleanups: string[] = [];
afterEach(() => {
    cwdSpy?.mockRestore();
    while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function track(...dirs: string[]): void {
    cleanups.push(...dirs);
}

describe('capturePatchCommand', () => {
    it('writes a patch and leaves the working tree CUSTOM (no revert)', async () => {
        const root = makeConsumerRepo();
        track(root);
        cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root);

        // Edit the framework file (pristine -> custom).
        writeFileSync(path.join(root, FILE), CUSTOM);

        await capturePatchCommand(FILE, { name: 'jest-config', reason: 'test', upstreamTicket: 'ES-3083' });

        const patches = readdirSync(path.join(root, 'pika-patches')).filter((f) => f.endsWith('.patch'));
        expect(patches).toEqual(['001-jest-config.patch']);

        const patchText = readFileSync(path.join(root, 'pika-patches', patches[0]), 'utf8');
        expect(patchText).toContain('# patch: jest-config');
        expect(patchText).toContain('# upstream: ES-3083');
        expect(parsePatchTargets(patchText)).toEqual([FILE]);

        // Critical (Finding A): the working tree stays custom — the patch is NOT reverted.
        expect(readFileSync(path.join(root, FILE), 'utf8')).toBe(CUSTOM);
    });

    it('auto-increments NNN for a second patch', async () => {
        const root = makeConsumerRepo();
        track(root);
        cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root);
        mkdirSync(path.join(root, 'pika-patches'), { recursive: true });
        writeFileSync(path.join(root, 'pika-patches', '001-existing.patch'), '# patch: existing\n');

        writeFileSync(path.join(root, FILE), CUSTOM);
        await capturePatchCommand(FILE, { name: 'second' });

        expect(existsSync(path.join(root, 'pika-patches', '002-second.patch'))).toBe(true);
    });
});

describe('reapplyPikaPatches', () => {
    it('re-derives the custom file after a sync overwrites it with pristine', async () => {
        const root = makeConsumerRepo();
        track(root);
        cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root);

        // Author the patch, then commit custom + patch (committed == custom).
        writeFileSync(path.join(root, FILE), CUSTOM);
        await capturePatchCommand(FILE, { name: 'jest-config' });
        git(root, ['add', '-A']);
        git(root, ['commit', '-qm', 'custom + patch']);

        // Simulate `pika sync` overwriting the file back to pristine, then reapply.
        writeFileSync(path.join(root, FILE), PRISTINE);
        await reapplyPikaPatches(root);

        expect(readFileSync(path.join(root, FILE), 'utf8')).toBe(CUSTOM);
        // Clean reapply leaves no spurious staged diff.
        expect(git(root, ['status', '--porcelain', FILE]).trim()).toBe('');
    });

    it('throws (surfaced, not silent) when the patch no longer applies', async () => {
        const root = makeConsumerRepo();
        track(root);
        cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root);
        writeFileSync(path.join(root, FILE), CUSTOM);
        await capturePatchCommand(FILE, { name: 'jest-config' });
        git(root, ['add', '-A']);
        git(root, ['commit', '-qm', 'custom + patch']);

        // New pristine changed the very lines the patch edits → conflict.
        writeFileSync(path.join(root, FILE), ['line1', 'line2 UPSTREAM CHANGED', 'line3', 'line4', 'line5', ''].join('\n'));
        await expect(reapplyPikaPatches(root)).rejects.toThrow(/failed to reapply/);
    });

    it('is a no-op when there are no patches', async () => {
        const root = makeConsumerRepo();
        track(root);
        await expect(reapplyPikaPatches(root)).resolves.toBeUndefined();
    });
});

describe('checkCaptureCompleteness (committed == pristine + patches)', () => {
    async function setupCaptured(): Promise<{ root: string; pristine: string }> {
        const root = makeConsumerRepo();
        cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root);
        writeFileSync(path.join(root, FILE), CUSTOM);
        await capturePatchCommand(FILE, { name: 'jest-config' });
        git(root, ['add', '-A']);
        git(root, ['commit', '-qm', 'custom + patch']);
        cwdSpy.mockRestore();
        return { root, pristine: makePristineDir() };
    }
    const modified = (): PatchableChange[] => [{ type: 'modified', path: FILE }];
    const notProtected = () => false;

    it('passes when the committed file equals pristine + patch', async () => {
        const { root, pristine } = await setupCaptured();
        track(root, pristine);
        const offenders = await checkCaptureCompleteness(pristine, modified(), root, notProtected);
        expect(offenders).toEqual([]);
    });

    it('flags a covered file that has an extra uncaptured edit', async () => {
        const { root, pristine } = await setupCaptured();
        track(root, pristine);
        writeFileSync(path.join(root, FILE), CUSTOM + '// extra uncaptured\n');
        const offenders = await checkCaptureCompleteness(pristine, modified(), root, notProtected);
        expect(offenders).toEqual([FILE]);
    });

    it('flags an uncaptured edit on a file with no patch', async () => {
        const root = makeConsumerRepo();
        track(root);
        writeFileSync(path.join(root, FILE), CUSTOM); // diverged, never captured
        const pristine = makePristineDir();
        track(pristine);
        const offenders = await checkCaptureCompleteness(pristine, modified(), root, notProtected);
        expect(offenders).toEqual([FILE]);
    });

    it('excludes protected files', async () => {
        const root = makeConsumerRepo();
        track(root);
        writeFileSync(path.join(root, FILE), CUSTOM);
        const pristine = makePristineDir();
        track(pristine);
        const offenders = await checkCaptureCompleteness(pristine, modified(), root, (rel) => rel === FILE);
        expect(offenders).toEqual([]);
    });
});
