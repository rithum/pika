/**
 * Integration tests for the non-interactive release tooling (ES-2703).
 *
 * Each test creates a temporary git repo with a local bare origin containing
 * a baseline releases.json. The CLI runs as a subprocess via tsx, and tests
 * assert on stdout, stderr, and exit code.
 */

import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

const CLI_PATH = path.resolve(__dirname, '../src/release.ts');
const TSX = 'tsx';

interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

interface TempRepo {
    baseDir: string;
    repoDir: string;
}

function gitExec(cwd: string, cmd: string): void {
    const r = spawnSync('git', cmd.split(' '), { cwd, stdio: 'pipe' });
    if (r.status !== 0) {
        throw new Error(`git ${cmd} failed in ${cwd}: ${r.stderr?.toString()}`);
    }
}

function createTempRepo(): TempRepo {
    const baseDir = mkdtempSync(path.join(os.tmpdir(), 'pika-release-test-'));
    const bareDir = path.join(baseDir, 'origin.git');
    const repoDir = path.join(baseDir, 'repo');

    mkdirSync(bareDir);
    spawnSync('git', ['init', '--bare'], { cwd: bareDir, stdio: 'pipe' });

    mkdirSync(path.join(repoDir, 'packages', 'tools'), { recursive: true });
    mkdirSync(path.join(repoDir, 'apps', 'pika-docs', 'src', 'content', 'docs', 'platform', 'releases'), { recursive: true });

    spawnSync('git', ['init'], { cwd: repoDir, stdio: 'pipe' });
    gitExec(repoDir, 'config user.email test@test.com');
    gitExec(repoDir, 'config user.name Test');
    gitExec(repoDir, `remote add origin ${bareDir}`);

    const releasesJson = {
        latestVersion: '0.20.0',
        currentDevelopment: '0.21.0',
        releases: [
            {
                version: '0.20.0',
                date: '2026-03-01',
                status: 'released',
                breaking: false,
                summary: 'Test baseline'
            }
        ]
    };
    writeFileSync(path.join(repoDir, 'releases.json'), JSON.stringify(releasesJson, null, 2) + '\n');
    writeFileSync(path.join(repoDir, 'CHANGELOG.md'), '# Changelog\n\n## [0.20.0] - 2026-03-01\n\n- Baseline\n');

    gitExec(repoDir, 'add -A');
    spawnSync('git', ['commit', '-m', 'initial commit'], { cwd: repoDir, stdio: 'pipe' });
    gitExec(repoDir, 'branch -M main');
    gitExec(repoDir, 'push -u origin main');

    return { baseDir, repoDir };
}

function run(repoDir: string, args: string, overrideCwd?: string): RunResult {
    const cwd = overrideCwd || path.join(repoDir, 'packages', 'tools');
    const result = spawnSync(TSX, [CLI_PATH, ...args.split(/\s+/)], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout: 20000
    });
    return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.status ?? 1
    };
}

function createFeatureBranch(repoDir: string, branchName: string): void {
    spawnSync('git', ['checkout', '-b', branchName], { cwd: repoDir, stdio: 'pipe' });
    writeFileSync(path.join(repoDir, 'test-file.txt'), `change on ${branchName}\n`);
    gitExec(repoDir, 'add -A');
    spawnSync('git', ['commit', '-m', `feat: test change on ${branchName}`], { cwd: repoDir, stdio: 'pipe' });
}

function cleanup(baseDir: string): void {
    try {
        rmSync(baseDir, { recursive: true, force: true });
    } catch {
        // best effort
    }
}

const TODAY = new Date().toISOString().split('T')[0];

// ============================================================================
// Tests
// ============================================================================

describe('release CLI --help', () => {
    it('shows --non-interactive in program help', () => {
        const result = run(os.tmpdir(), '--help', __dirname);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('--non-interactive');
    });
});

describe('release --non-interactive (unified flow)', () => {
    let repo: TempRepo;

    beforeEach(() => {
        repo = createTempRepo();
    });

    afterEach(() => {
        cleanup(repo.baseDir);
    });

    it('exits 1 on main branch', () => {
        const result = run(repo.repoDir, '--non-interactive');
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('feature branch');
    });

    it('exits 1 on unrecognized branch prefix', () => {
        spawnSync('git', ['checkout', '-b', 'random-branch'], { cwd: repo.repoDir, stdio: 'pipe' });
        const result = run(repo.repoDir, '--non-interactive');
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('standard prefix');
    });

    it('detects minor bump from feat/ branch and outputs prompt to stdout', () => {
        createFeatureBranch(repo.repoDir, 'feat/test-feature');
        const result = run(repo.repoDir, '--non-interactive');

        expect(result.exitCode).toBe(0);

        // stdout contains the prompt
        expect(result.stdout).toContain('**TASK: Release version 0.21.0**');
        expect(result.stdout).toContain('Git Context');
        expect(result.stdout).toContain('feat: test change on feat/test-feature');
        expect(result.stdout).toContain('git tag -a v0.21.0');

        // stderr has informational output, not the prompt
        expect(result.stderr).toContain('minor');
        expect(result.stderr).not.toContain('**TASK:');
    });

    it('detects patch bump from fix/ branch', () => {
        createFeatureBranch(repo.repoDir, 'fix/test-bugfix');
        const result = run(repo.repoDir, '--non-interactive');

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('**TASK: Release version 0.20.1**');
    });

    it('detects breaking bump from breaking/ branch', () => {
        createFeatureBranch(repo.repoDir, 'breaking/api-change');
        const result = run(repo.repoDir, '--non-interactive');

        expect(result.exitCode).toBe(0);
        // In 0.x, both major and minor bump the minor number → 0.21.0
        expect(result.stdout).toContain('**TASK: Release version 0.21.0**');
        const releases = JSON.parse(readFileSync(path.join(repo.repoDir, 'releases.json'), 'utf8'));
        const entry = releases.releases.find((r: { version: string }) => r.version === '0.21.0');
        expect(entry?.breaking).toBe(true);
    });

    it('updates releases.json with released status and today\'s date', () => {
        createFeatureBranch(repo.repoDir, 'feat/test-release');
        run(repo.repoDir, '--non-interactive');

        const releases = JSON.parse(readFileSync(path.join(repo.repoDir, 'releases.json'), 'utf8'));
        const entry = releases.releases.find((r: { version: string }) => r.version === '0.21.0');
        expect(entry?.status).toBe('released');
        expect(entry?.date).toBe(TODAY);
        expect(releases.latestVersion).toBe('0.21.0');
    });

    it('uses existing unreleased version when present', () => {
        const releasesJson = JSON.parse(readFileSync(path.join(repo.repoDir, 'releases.json'), 'utf8'));
        releasesJson.releases.unshift({
            version: '0.25.0',
            date: 'TBD',
            status: 'unreleased',
            breaking: false,
            summary: 'Pre-existing'
        });
        writeFileSync(path.join(repo.repoDir, 'releases.json'), JSON.stringify(releasesJson, null, 2) + '\n');
        gitExec(repo.repoDir, 'add -A');
        spawnSync('git', ['commit', '-m', 'add unreleased'], { cwd: repo.repoDir, stdio: 'pipe' });

        createFeatureBranch(repo.repoDir, 'fix/small-fix');
        const result = run(repo.repoDir, '--non-interactive');

        expect(result.exitCode).toBe(0);
        // Uses existing 0.25.0 even though fix/ suggests patch
        expect(result.stdout).toContain('**TASK: Release version 0.25.0**');
        // Warning about mismatch on stderr
        expect(result.stderr).toContain('0.25.0');
    });

    it('dry-run skips marking release as published', () => {
        createFeatureBranch(repo.repoDir, 'feat/dry-run-test');

        const result = run(repo.repoDir, '--non-interactive --dry-run');

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('[DRY RUN]');

        // The unreleased entry is created (preparation step), but NOT marked released
        const releases = JSON.parse(readFileSync(path.join(repo.repoDir, 'releases.json'), 'utf8'));
        const entry = releases.releases.find((r: { version: string }) => r.version === '0.21.0');
        expect(entry).toBeDefined();
        expect(entry.status).toBe('unreleased');
        // latestVersion should NOT be updated
        expect(releases.latestVersion).toBe('0.20.0');
    });

    it('includes changed files in git context', () => {
        createFeatureBranch(repo.repoDir, 'feat/with-changes');
        const result = run(repo.repoDir, '--non-interactive');

        expect(result.stdout).toContain('Changed files:');
        expect(result.stdout).toContain('test-file.txt');
    });

    it('replaces all template variables', () => {
        createFeatureBranch(repo.repoDir, 'feat/variable-test');
        const result = run(repo.repoDir, '--non-interactive');

        // No unreplaced {{variables}} should remain
        expect(result.stdout).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
    });

    it('includes recovery instructions in output', () => {
        createFeatureBranch(repo.repoDir, 'feat/recovery');
        const result = run(repo.repoDir, '--non-interactive');

        expect(result.stdout).toContain('Recovery');
        expect(result.stdout).toContain('git checkout');
    });
});

describe('release:notes --non-interactive', () => {
    let repo: TempRepo;

    beforeEach(() => {
        repo = createTempRepo();
    });

    afterEach(() => {
        cleanup(repo.baseDir);
    });

    it('outputs prompt to stdout and info to stderr', () => {
        createFeatureBranch(repo.repoDir, 'feat/notes-test');
        const result = run(repo.repoDir, 'notes --non-interactive');

        expect(result.exitCode).toBe(0);
        // stdout has the prompt template (PROMPT_INCREMENTAL)
        expect(result.stdout).toContain('**TASK: Update release notes');
        // stderr has informational output
        expect(result.stderr).toContain('Release Notes Helper');
    });

    it('creates unreleased version in releases.json', () => {
        createFeatureBranch(repo.repoDir, 'feat/notes-create');
        run(repo.repoDir, 'notes --non-interactive');

        const releases = JSON.parse(readFileSync(path.join(repo.repoDir, 'releases.json'), 'utf8'));
        const unreleased = releases.releases.find((r: { status: string }) => r.status === 'unreleased');
        expect(unreleased).toBeDefined();
        expect(unreleased.version).toBe('0.21.0');
    });

    it('guards against main branch', () => {
        const result = run(repo.repoDir, 'notes --non-interactive');
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('feature branch');
    });
});

describe('release:notes --finalize --non-interactive', () => {
    let repo: TempRepo;

    beforeEach(() => {
        repo = createTempRepo();
        const releasesJson = JSON.parse(readFileSync(path.join(repo.repoDir, 'releases.json'), 'utf8'));
        releasesJson.releases.unshift({
            version: '0.21.0',
            date: 'TBD',
            status: 'unreleased',
            breaking: false,
            summary: 'In development'
        });
        writeFileSync(path.join(repo.repoDir, 'releases.json'), JSON.stringify(releasesJson, null, 2) + '\n');
        gitExec(repo.repoDir, 'add -A');
        spawnSync('git', ['commit', '-m', 'add unreleased'], { cwd: repo.repoDir, stdio: 'pipe' });
    });

    afterEach(() => {
        cleanup(repo.baseDir);
    });

    it('auto-detects single unreleased version and sets date', () => {
        createFeatureBranch(repo.repoDir, 'feat/finalize-test');
        run(repo.repoDir, 'notes --finalize --non-interactive');

        const releases = JSON.parse(readFileSync(path.join(repo.repoDir, 'releases.json'), 'utf8'));
        const entry = releases.releases.find((r: { version: string }) => r.version === '0.21.0');
        expect(entry?.date).toBe(TODAY);
    });

    it('errors when multiple unreleased versions exist', () => {
        const releasesJson = JSON.parse(readFileSync(path.join(repo.repoDir, 'releases.json'), 'utf8'));
        releasesJson.releases.unshift({
            version: '0.22.0',
            date: 'TBD',
            status: 'unreleased',
            breaking: false,
            summary: 'Another'
        });
        writeFileSync(path.join(repo.repoDir, 'releases.json'), JSON.stringify(releasesJson, null, 2) + '\n');
        gitExec(repo.repoDir, 'add -A');
        spawnSync('git', ['commit', '-m', 'add second unreleased'], { cwd: repo.repoDir, stdio: 'pipe' });
        createFeatureBranch(repo.repoDir, 'feat/multi-unreleased');

        const result = run(repo.repoDir, 'notes --finalize --non-interactive');
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Multiple unreleased');
    });
});

describe('release:publish --non-interactive', () => {
    let repo: TempRepo;

    beforeEach(() => {
        repo = createTempRepo();
    });

    afterEach(() => {
        cleanup(repo.baseDir);
    });

    it('skips confirmation prompts and creates tag', () => {
        const releasesJson = JSON.parse(readFileSync(path.join(repo.repoDir, 'releases.json'), 'utf8'));
        releasesJson.releases.unshift({
            version: '0.21.0',
            date: 'TBD',
            status: 'unreleased',
            breaking: false,
            summary: 'Ready to publish'
        });
        writeFileSync(path.join(repo.repoDir, 'releases.json'), JSON.stringify(releasesJson, null, 2) + '\n');
        gitExec(repo.repoDir, 'add -A');
        spawnSync('git', ['commit', '-m', 'add unreleased'], { cwd: repo.repoDir, stdio: 'pipe' });
        createFeatureBranch(repo.repoDir, 'feat/publish-test');

        const result = run(repo.repoDir, 'publish --non-interactive');
        expect(result.exitCode).toBe(0);

        const tags = spawnSync('git', ['tag'], { cwd: repo.repoDir, encoding: 'utf8' });
        expect(tags.stdout).toContain('v0.21.0');

        const releases = JSON.parse(readFileSync(path.join(repo.repoDir, 'releases.json'), 'utf8'));
        const entry = releases.releases.find((r: { version: string }) => r.version === '0.21.0');
        expect(entry?.status).toBe('released');
    });

    it('guards against main branch', () => {
        const result = run(repo.repoDir, 'publish --non-interactive');
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('feature branch');
    });
});

describe('release:plan-breaking --non-interactive', () => {
    it('errors immediately with exit code 1', () => {
        const result = run(os.tmpdir(), 'plan-breaking --non-interactive', __dirname);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('interactive mode');
    });
});

describe('template variable replacement', () => {
    let repo: TempRepo;

    beforeEach(() => {
        repo = createTempRepo();
    });

    afterEach(() => {
        cleanup(repo.baseDir);
    });

    it('PROMPT_UNIFIED contains correct version in commit/tag commands', () => {
        createFeatureBranch(repo.repoDir, 'feat/template-vars');
        const result = run(repo.repoDir, '--non-interactive');

        expect(result.stdout).toContain('git commit -m "chore: release v0.21.0"');
        expect(result.stdout).toContain('git tag -a v0.21.0 -m "Release v0.21.0"');
    });

    it('PROMPT_UNIFIED contains current date', () => {
        createFeatureBranch(repo.repoDir, 'feat/date-test');
        const result = run(repo.repoDir, '--non-interactive');
        expect(result.stdout).toContain(TODAY);
    });
});

describe('branch detection', () => {
    let repo: TempRepo;

    beforeEach(() => {
        repo = createTempRepo();
    });

    afterEach(() => {
        cleanup(repo.baseDir);
    });

    // In 0.x: major and minor both bump minor (0.20.0 → 0.21.0), patch bumps patch (0.20.0 → 0.20.1)
    const cases: Array<[string, string, string]> = [
        ['feat/', 'feat/my-feature', '0.21.0'],
        ['feature/', 'feature/my-feature', '0.21.0'],
        ['fix/', 'fix/my-bugfix', '0.20.1'],
        ['chore/', 'chore/cleanup', '0.20.1'],
        ['docs/', 'docs/update-readme', '0.20.1'],
        ['refactor/', 'refactor/simplify', '0.20.1'],
        ['breaking/', 'breaking/api-change', '0.21.0'],
        ['major/', 'major/overhaul', '0.21.0']
    ];

    it.each(cases)('prefix %s -> version %s', (_prefix, branch, expectedVersion) => {
        createFeatureBranch(repo.repoDir, branch);
        const result = run(repo.repoDir, '--non-interactive --dry-run');

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`Release version ${expectedVersion}`);
    });
});

describe('log routing', () => {
    let repo: TempRepo;

    beforeEach(() => {
        repo = createTempRepo();
    });

    afterEach(() => {
        cleanup(repo.baseDir);
    });

    it('routes informational messages to stderr in non-interactive mode', () => {
        createFeatureBranch(repo.repoDir, 'feat/log-test');
        const result = run(repo.repoDir, '--non-interactive');

        // Informational messages go to stderr
        expect(result.stderr).toContain('minor');
        // Prompt goes to stdout only
        expect(result.stderr).not.toContain('**TASK:');
        expect(result.stdout).toContain('**TASK:');
    });

    it('does not pollute stdout with anything other than the prompt', () => {
        createFeatureBranch(repo.repoDir, 'feat/stdout-clean');
        const result = run(repo.repoDir, '--non-interactive');

        // stdout should start with the prompt, not log lines
        expect(result.stdout.trimStart().startsWith('**TASK:')).toBe(true);
    });
});
