#!/usr/bin/env node
// Runs pika-chat locally against a local Strands converse server. Usage: `pnpm dev:nosudo`.
// Set PIKA_SKIP_LOCAL_STRANDS=1 to use the deployed Strands function instead.
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, openSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHAT_DIR = resolve(HERE, '../..');
const REPO_ROOT = resolve(CHAT_DIR, '../..');
const STRANDS_DIR = join(REPO_ROOT, 'services/pika/src/lambda/converse-strands');
const IS_WINDOWS = process.platform === 'win32';

const log = (msg) => console.log(`[dev-local] ${msg}`);
const fail = (msg) => {
    console.error(`[dev-local] ${msg}`);
    process.exit(1);
};

// SvelteKit loads .env.local into $env/dynamic/private, not process.env, so server code reading
// process.env directly sees nothing. Load it here so the child inherits a complete environment.
function loadEnvLocal() {
    const file = join(CHAT_DIR, '.env.local');
    if (!existsSync(file)) return;
    if (typeof process.loadEnvFile !== 'function') {
        fail(`Node ${process.versions.node} has no process.loadEnvFile (needs >= 20.12). This repo targets Node 22+; check .nvmrc.`);
    }
    try {
        process.loadEnvFile(file);
    } catch (err) {
        console.error(`[dev-local] could not read .env.local: ${err.message}`);
    }
}

// Ahead of the constants below, so .env.local configures this script and not only the app. Read
// after them, the file would set STAGE and PIKA_SKIP_LOCAL_STRANDS but be ignored for the ports.
loadEnvLocal();

const STRANDS_PORT = Number(process.env.STRANDS_PORT ?? 8765);
const VITE_PORT = process.env.VITE_PORT ?? '8443';
const LOG_DIR = process.env.PIKA_LOCAL_LOG_DIR ?? join(REPO_ROOT, '.local-logs');
const LOG_FILE = join(LOG_DIR, `strands-${STRANDS_PORT}.log`);
const MARKER = join(LOG_DIR, `strands-${STRANDS_PORT}.json`);

function listening(port) {
    return new Promise((done) => {
        const sock = createConnection({ port, host: '127.0.0.1' })
            .on('connect', () => (sock.destroy(), done(true)))
            .on('error', () => done(false));
        sock.setTimeout(700, () => (sock.destroy(), done(false)));
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function alive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

// A listener we did not start may be a stale server from another checkout serving old code,
// and there is no portable way to inspect a foreign process's working directory.
function ownsPort() {
    if (!existsSync(MARKER)) return null;
    try {
        const m = JSON.parse(readFileSync(MARKER, 'utf8'));
        return m.repoRoot === REPO_ROOT && alive(m.pid) ? m : null;
    } catch {
        return null;
    }
}

const VENV_PYTHON = join(STRANDS_DIR, '.venv', IS_WINDOWS ? 'Scripts/python.exe' : 'bin/python');
const REQUIREMENTS = join(STRANDS_DIR, 'requirements-dev.txt');
const DEPS_STAMP = join(STRANDS_DIR, '.venv', '.deps-installed');

/** Hash of the requirement files, so an edited pin reinstalls rather than being ignored. */
function requirementsFingerprint() {
    const parts = [REQUIREMENTS, join(STRANDS_DIR, 'requirements.txt')]
        .filter((f) => existsSync(f))
        .map((f) => readFileSync(f, 'utf8'));
    return createHash('sha256').update(parts.join('\0')).digest('hex');
}

/**
 * The interpreter existing does not mean the dependencies do: `uv venv` succeeds before
 * `uv pip install` runs, so a failed install leaves a venv that satisfies a naive check and
 * then dies on the first import.
 */
function venvReady() {
    if (!existsSync(VENV_PYTHON) || !existsSync(DEPS_STAMP)) return false;
    return readFileSync(DEPS_STAMP, 'utf8').trim() === requirementsFingerprint();
}

function ensureVenv() {
    if (venvReady()) return;
    log('building the Strands venv (first run, Python 3.14 via uv)');
    const uv = spawnSync('uv', ['venv', '--clear', '--python', process.env.PYTHON_VERSION ?? '3.14', '.venv'], {
        cwd: STRANDS_DIR,
        stdio: 'inherit',
        shell: IS_WINDOWS
    });
    if (uv.status !== 0) fail('uv venv failed. Install uv, or run scripts/setup.sh under bash.');
    const deps = spawnSync('uv', ['pip', 'install', '--python', VENV_PYTHON, '-q', '-r', 'requirements-dev.txt'], {
        cwd: STRANDS_DIR,
        stdio: 'inherit',
        shell: IS_WINDOWS
    });
    if (deps.status !== 0) {
        fail('installing Strands dependencies failed. Fix the error above, then re-run - the venv is left in place but will reinstall.');
    }
    writeFileSync(DEPS_STAMP, requirementsFingerprint());
}

// Windows cannot source local-env.sh, so take the deployed function's own environment. Same
// tactic as gen-env-local: authoritative, and it never drifts from the table naming.
function strandsEnvFromDeployed() {
    const stage = process.env.STAGE ?? 'test';
    const proj = process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE ?? 'pika';
    const q = `Functions[?starts_with(FunctionName, '${proj}-${stage}-') && contains(FunctionName, 'ConverseStrands')].FunctionName`;
    const list = spawnSync('aws', ['lambda', 'list-functions', '--query', q, '--output', 'text'], { encoding: 'utf8', shell: IS_WINDOWS });
    const fn = (list.stdout ?? '').split(/\s+/).filter(Boolean)[0];
    if (!fn) fail(`no ConverseStrands function found for stage ${stage} - are your AWS credentials valid?`);
    const cfg = spawnSync('aws', ['lambda', 'get-function-configuration', '--function-name', fn, '--query', 'Environment.Variables', '--output', 'json'], {
        encoding: 'utf8',
        shell: IS_WINDOWS
    });
    if (cfg.status !== 0) fail('could not read the deployed function configuration.');
    const body = (cfg.stdout ?? '').trim();
    // An env-less function yields the string "null", which parses to null and would spread into
    // an empty environment - a silent start with no table configuration.
    if (!body || body === 'null') fail(`${fn} reports no environment variables.`);
    return JSON.parse(body);
}

let child = null;
function stopStrands() {
    if (!child) return;
    log(`stopping Strands (pid ${child.pid})`);
    try {
        process.kill(child.pid);
    } catch {}
    child = null;
    rmSync(MARKER, { force: true });
}
for (const sig of ['exit', 'SIGINT', 'SIGTERM']) process.on(sig, stopStrands);

async function startStrands() {
    ensureVenv();
    mkdirSync(LOG_DIR, { recursive: true });
    const out = openSync(LOG_FILE, 'a');
    log(`starting Strands converse on ${STRANDS_PORT} (log: ${LOG_FILE})`);

    const useBash = !IS_WINDOWS && existsSync(join(STRANDS_DIR, 'scripts/local-server.sh'));
    child = useBash
        ? spawn('bash', ['scripts/local-server.sh'], {
              cwd: STRANDS_DIR,
              env: { ...process.env, PORT: String(STRANDS_PORT) },
              stdio: ['ignore', out, out]
          })
        : spawn(VENV_PYTHON, ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', String(STRANDS_PORT)], {
              cwd: STRANDS_DIR,
              env: { ...strandsEnvFromDeployed(), ...process.env, PYTHONPATH: STRANDS_DIR },
              stdio: ['ignore', out, out]
          });

    writeFileSync(MARKER, JSON.stringify({ pid: child.pid, repoRoot: REPO_ROOT, startedAt: new Date().toISOString() }));

    for (let i = 0; i < 180; i++) {
        if (await listening(STRANDS_PORT)) return;
        if (child.exitCode !== null) {
            console.error(readFileSync(LOG_FILE, 'utf8').split('\n').slice(-20).join('\n'));
            fail('Strands failed to start. Refusing to fall back to the deprecated in-process converse.');
        }
        await sleep(1000);
    }
    fail(`Strands did not come up within 180s - see ${LOG_FILE}`);
}

if (process.env.PIKA_SKIP_LOCAL_STRANDS === '1') {
    log('PIKA_SKIP_LOCAL_STRANDS=1 - leaving converse routing to .env.local');
} else {
    if (await listening(STRANDS_PORT)) {
        const owned = ownsPort();
        if (!owned) {
            fail(
                `port ${STRANDS_PORT} is already in use by something this launcher did not start.\n` +
                    `[dev-local] It may be a stale server from another checkout. Kill it, or set STRANDS_PORT.`
            );
        }
        log(`reusing Strands on ${STRANDS_PORT} (pid ${owned.pid}, this checkout)`);
    } else {
        await startStrands();
    }
    process.env.LOCAL_CONVERSE_FUNCTION_URL = `http://127.0.0.1:${STRANDS_PORT}`;
}

const vite = spawn('pnpm', ['exec', 'vite', 'dev', '--port', VITE_PORT, ...process.argv.slice(2)], {
    cwd: CHAT_DIR,
    stdio: 'inherit',
    env: process.env,
    shell: IS_WINDOWS
});
vite.on('exit', (code) => {
    stopStrands();
    process.exit(code ?? 0);
});
