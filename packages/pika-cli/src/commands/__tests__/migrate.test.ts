import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { existsSync, cpSync, rmSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';

// Mock logger to suppress output during tests
jest.mock('../../utils/logger.js');

// Mock child_process to control git status responses
jest.mock('child_process', () => ({
    exec: jest.fn()
}));

import { exec } from 'child_process';
import { migrateCommand } from '../migrate.js';

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
        // Default: clean working tree (exec callback signature: error, stdout, stderr)
        (mockExec as any).mockImplementation((_cmd: string, _opts: any, cb: any) => {
            cb(null, '', '');
        });
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
        (mockExec as any).mockImplementation((_cmd: string, _opts: any, cb: any) => {
            cb(null, ' M some-file.ts\n', '');
        });
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((_code?: any) => { throw new Error('process.exit'); });
        await expect(migrateCommand('v0.26.0-v0.27.0')).rejects.toThrow('process.exit');
        exitSpy.mockRestore();
    });

    it('rejects unknown migration IDs', async () => {
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((_code?: any) => { throw new Error('process.exit'); });
        await expect(migrateCommand('v0.99.0-v0.100.0', { force: true })).rejects.toThrow('process.exit');
        exitSpy.mockRestore();
    });
});
