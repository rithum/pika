import path from 'path';
import ignore from 'ignore';

export interface GitignoreChecker {
    ignores(relativePath: string): boolean;
}

const NOOP_CHECKER: GitignoreChecker = {
    ignores: () => false
};

/**
 * Loads the project root .gitignore and returns a checker that reports whether
 * a relative path (from project root, forward slashes) is ignored.
 * If .gitignore is missing or unreadable, returns a no-op that never ignores.
 */
export async function loadGitignore(
    projectRoot: string,
    readFile: (filePath: string) => Promise<string>
): Promise<GitignoreChecker> {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    let content: string;
    try {
        content = await readFile(gitignorePath);
    } catch {
        return NOOP_CHECKER;
    }
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length === 0) {
        return NOOP_CHECKER;
    }
    const ig = ignore().add(lines);
    return {
        ignores(relativePath: string): boolean {
            const normalized = relativePath.replace(/\\/g, '/');
            return ig.ignores(normalized);
        }
    };
}
