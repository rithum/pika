import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { existsSync, cpSync, rmSync, mkdirSync, symlinkSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';

// Mock logger to suppress output during tests
jest.mock('../../utils/logger.js');

// Mock child_process to control git status responses. The production code calls
// `util.promisify(exec)`. `util.promisify` checks for a `util.promisify.custom` symbol on the
// function; the real Node.js `exec` defines this symbol so promisify resolves to
// `{stdout, stderr}` instead of an array. Our mock replicates that so the production code can
// rely on the canonical `{stdout}` shape without test-mock-shape branching.
jest.mock('child_process', () => {
    const promisifyCustom = promisify.custom;
    const execFn = jest.fn() as unknown as ((...args: unknown[]) => unknown) & {
        [k: symbol]: unknown;
    };
    execFn[promisifyCustom] = (cmd: string, opts?: unknown) =>
        new Promise((resolve, reject) => {
            (execFn as unknown as (c: string, o: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => void)(cmd, opts, (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({ stdout, stderr });
            });
        });
    return { exec: execFn };
});

import { exec } from 'child_process';
import { migrateCommand } from '../migrate.js';

// `exec` is heavily overloaded; for these mocks we only need the 3-arg callback form.
type ExecImpl = (cmd: string, opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => void;

// jest's `process.exit` typings require a never return; reuse a single typed throw stub.
const throwOnExit = (_code?: string | number | null | undefined): never => {
    throw new Error('process.exit');
};

const FIXTURE_DIR = path.join(__dirname, 'fixtures/v0.26.0-consumer');

const DELETABLE_FILES = [
    'apps/pika-chat/src/lib/custom/legacy-session-loader.ts',
    'apps/pika-chat/src/lib/custom/legacy-chats-section-header.ts',
    'apps/pika-chat/src/lib/custom/legacy-chats-section-trigger.ts',
    'apps/pika-chat/src/lib/custom/legacy-user-validator.ts'
];

const PRESERVED_FILE = 'apps/pika-chat/src/lib/custom/session-read-only.ts';

function copyFixture(dest: string): void {
    cpSync(FIXTURE_DIR, dest, { recursive: true });
}

describe('pika migrate v0.26.0-v0.27.0', () => {
    let tmpDir: string;
    let originalCwd: string;
    const mockExec = exec as jest.MockedFunction<typeof exec>;

    beforeEach(() => {
        jest.clearAllMocks();
        originalCwd = process.cwd();
        // Create a temp copy of the fixture for each test so mutations don't bleed across
        tmpDir = path.join(os.tmpdir(), `pika-migrate-test-${Date.now()}`);
        copyFixture(tmpDir);
        process.chdir(tmpDir);
        // Default: clean working tree. The `exec` callback signature is heavily overloaded; we cast
        // to the canonical 3-arg-callback form for testing.
        const cleanTreeImpl: ExecImpl = (_cmd, _opts, cb) => {
            cb(null, '', '');
        };
        mockExec.mockImplementation(cleanTreeImpl as unknown as typeof exec);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        if (existsSync(tmpDir)) {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('deletes the 4 legacy hook files', async () => {
        await migrateCommand('v0.26.0-v0.27.0', { force: true });
        for (const rel of DELETABLE_FILES) {
            expect(existsSync(path.join(tmpDir, rel))).toBe(false);
        }
    });

    it('preserves session-read-only.ts (not in the delete list)', async () => {
        await migrateCommand('v0.26.0-v0.27.0', { force: true });
        expect(existsSync(path.join(tmpDir, PRESERVED_FILE))).toBe(true);
    });

    it('--dry-run leaves all files untouched', async () => {
        await migrateCommand('v0.26.0-v0.27.0', { dryRun: true });
        for (const rel of DELETABLE_FILES) {
            expect(existsSync(path.join(tmpDir, rel))).toBe(true);
        }
    });

    it('is idempotent: second invocation succeeds when files are already absent', async () => {
        await migrateCommand('v0.26.0-v0.27.0', { force: true });
        // All 4 already gone — second run must not throw
        await expect(migrateCommand('v0.26.0-v0.27.0', { force: true })).resolves.toBeUndefined();
    });

    it('refuses to run with uncommitted changes unless --force is passed', async () => {
        const dirtyTreeImpl: ExecImpl = (_cmd, _opts, cb) => {
            cb(null, ' M some-file.ts\n', '');
        };
        mockExec.mockImplementation(dirtyTreeImpl as unknown as typeof exec);
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(throwOnExit);
        await expect(migrateCommand('v0.26.0-v0.27.0')).rejects.toThrow('process.exit');
        exitSpy.mockRestore();
    });

    it('rejects unknown migration IDs', async () => {
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(throwOnExit);
        await expect(migrateCommand('v0.99.0-v0.100.0', { force: true })).rejects.toThrow('process.exit');
        exitSpy.mockRestore();
    });

    it('refuses to delete a symlink (does not follow the target)', async () => {
        const sentinelPath = path.join(tmpDir, 'sentinel.txt');
        writeFileSync(sentinelPath, 'sentinel-content');
        const targetRel = 'apps/pika-chat/src/lib/custom/legacy-session-loader.ts';
        const targetAbs = path.join(tmpDir, targetRel);
        rmSync(targetAbs);
        symlinkSync(sentinelPath, targetAbs);

        await migrateCommand('v0.26.0-v0.27.0', { force: true });

        // Sentinel survives untouched; symlink itself also survives (skipped, not deleted).
        expect(readFileSync(sentinelPath, 'utf8')).toBe('sentinel-content');
        expect(existsSync(targetAbs)).toBe(true);
        // Other 3 files (not symlinks) should be deleted.
        for (const rel of DELETABLE_FILES.slice(1)) {
            expect(existsSync(path.join(tmpDir, rel))).toBe(false);
        }
    });

    it('skips files that differ from the v0.26.0 default stub (customized)', async () => {
        const customizedRel = 'apps/pika-chat/src/lib/custom/legacy-session-loader.ts';
        writeFileSync(
            path.join(tmpDir, customizedRel),
            '// my custom implementation\nexport async function loadLegacyChatsIfNeeded() { return { sessions: [{ id: "mine" }], loaded: true }; }'
        );

        await migrateCommand('v0.26.0-v0.27.0', { force: true });

        expect(existsSync(path.join(tmpDir, customizedRel))).toBe(true);
        // Other 3 still match defaults and are deleted.
        for (const rel of DELETABLE_FILES.slice(1)) {
            expect(existsSync(path.join(tmpDir, rel))).toBe(false);
        }
    });

    it('--force-content-mismatch deletes customized files too', async () => {
        const customizedRel = 'apps/pika-chat/src/lib/custom/legacy-session-loader.ts';
        writeFileSync(path.join(tmpDir, customizedRel), '// my custom implementation');

        await migrateCommand('v0.26.0-v0.27.0', { force: true, forceContentMismatch: true });

        expect(existsSync(path.join(tmpDir, customizedRel))).toBe(false);
    });

    it('refuses to run outside a pika consumer tree (no package.json with pika dep) unless --force', async () => {
        rmSync(path.join(tmpDir, 'package.json'));
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(throwOnExit);
        await expect(migrateCommand('v0.26.0-v0.27.0')).rejects.toThrow('process.exit');
        exitSpy.mockRestore();
    });

    it('--force bypasses the consumer-tree check', async () => {
        rmSync(path.join(tmpDir, 'package.json'));
        await migrateCommand('v0.26.0-v0.27.0', { force: true });
        for (const rel of DELETABLE_FILES) {
            expect(existsSync(path.join(tmpDir, rel))).toBe(false);
        }
    });

    it('--dry-run + --force combination is a no-op (force does not enable deletes)', async () => {
        await migrateCommand('v0.26.0-v0.27.0', { dryRun: true, force: true });
        for (const rel of DELETABLE_FILES) {
            expect(existsSync(path.join(tmpDir, rel))).toBe(true);
        }
    });

    it('partial-state recovery: succeeds when some files already absent', async () => {
        // Pre-delete 2 of 4 files
        rmSync(path.join(tmpDir, DELETABLE_FILES[0]));
        rmSync(path.join(tmpDir, DELETABLE_FILES[1]));

        await migrateCommand('v0.26.0-v0.27.0', { force: true });

        for (const rel of DELETABLE_FILES) {
            expect(existsSync(path.join(tmpDir, rel))).toBe(false);
        }
    });
});
