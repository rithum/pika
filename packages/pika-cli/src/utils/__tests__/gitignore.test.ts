import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { loadGitignore } from '../gitignore.js';

describe('loadGitignore', () => {
    const projectRoot = '/project/root';
    let readFile: jest.Mock<(filePath: string) => Promise<string>>;

    beforeEach(() => {
        readFile = jest.fn<(filePath: string) => Promise<string>>();
    });

    it('returns a checker that always returns false when .gitignore is missing', async () => {
        readFile.mockRejectedValue(new Error('ENOENT'));
        const checker = await loadGitignore(projectRoot, readFile);
        expect(checker.ignores('scripts/my-tests')).toBe(false);
        expect(checker.ignores('apps/pika-chat/src/App.svelte')).toBe(false);
    });

    it('returns a checker that always returns false when readFile throws', async () => {
        readFile.mockRejectedValue(new Error('EACCES'));
        const checker = await loadGitignore(projectRoot, readFile);
        expect(checker.ignores('any/path')).toBe(false);
    });

    it('returns a checker that respects .gitignore patterns', async () => {
        readFile.mockResolvedValue('scripts/my-tests\n*.local\n');
        const checker = await loadGitignore(projectRoot, readFile);
        expect(checker.ignores('scripts/my-tests')).toBe(true);
        expect(checker.ignores('scripts/my-tests/foo.js')).toBe(true);
        expect(checker.ignores('config/.env.local')).toBe(true);
        expect(checker.ignores('apps/pika-chat/src/App.svelte')).toBe(false);
    });

    it('returns a checker that always returns false for empty .gitignore', async () => {
        readFile.mockResolvedValue('');
        const checker = await loadGitignore(projectRoot, readFile);
        expect(checker.ignores('scripts/my-tests')).toBe(false);
    });

    it('returns a checker that always returns false for whitespace-only .gitignore', async () => {
        readFile.mockResolvedValue('   \n\n  \n');
        const checker = await loadGitignore(projectRoot, readFile);
        expect(checker.ignores('scripts/my-tests')).toBe(false);
    });
});
