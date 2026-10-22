// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain ESM tool module, no type declarations
import { EnvValueError, quote, renderEnvFile } from '../../tools/gen-env-local/render.js';

const BASE = {
    taskDefName: 'pikachutestTaskDef:225',
    stage: 'test',
    generatedAt: '2026-08-31T00:00:00.000Z',
    webappUrl: 'https://localhost:8443',
    strandsPort: '8765',
    strandsUrl: 'https://abc.lambda-url.us-east-1.on.aws/'
};

const dirs: string[] = [];

/**
 * Loads the rendered file with Node's real env loader in a clean child process. In-process
 * loadEnvFile will not overwrite a key process.env already holds, which leaks between cases.
 */
function loadRendered(vars: { name: string; value: string }[]): Record<string, string> {
    const dir = mkdtempSync(join(tmpdir(), 'genenv-'));
    dirs.push(dir);
    const file = join(dir, '.env.local');
    writeFileSync(file, renderEnvFile({ ...BASE, vars }));
    const script = `process.loadEnvFile(${JSON.stringify(file)}); console.log(JSON.stringify(process.env));`;
    return JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }));
}

afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('gen-env-local rendering', () => {
    it('round-trips a JSON value through the real env loader', () => {
        const tags = '{"platform":"example","app":"pika","tier":"frontend"}';
        const loaded = loadRendered([{ name: 'STACK_TAGS', value: tags }]);
        expect(loaded.STACK_TAGS).toBe(tags);
        expect(JSON.parse(loaded.STACK_TAGS)).toMatchObject({ platform: 'example' });
    });

    it('preserves a value containing a hash, which an unquoted line would truncate', () => {
        const loaded = loadRendered([{ name: 'TAGS', value: 'a#b#c' }]);
        expect(loaded.TAGS).toBe('a#b#c');
    });

    it('preserves backslashes, which double quoting would mangle', () => {
        const loaded = loadRendered([{ name: 'PATTERN', value: 'a\\nb' }]);
        expect(loaded.PATTERN).toBe('a\\nb');
    });

    it('emits the local flags the launcher and auth gate depend on', () => {
        const loaded = loadRendered([{ name: 'STAGE', value: 'test' }]);
        expect(loaded.STAGE).toBe('test');
        expect(loaded.PIKA_LOCAL_MOCK_AUTH).toBe('true');
        expect(loaded.LOCAL_CONVERSE_FUNCTION_URL).toBe('http://127.0.0.1:8765');
    });

    it('overrides WEBAPP_URL for local dev and drops the deployed value', () => {
        const loaded = loadRendered([{ name: 'WEBAPP_URL', value: 'https://chat.example.com' }]);
        expect(loaded.WEBAPP_URL).toBe('https://localhost:8443');
    });

    it('leaves the deployed Strands URL commented out, not active', () => {
        const rendered = renderEnvFile({ ...BASE, vars: [] });
        expect(rendered).toContain(`# LOCAL_CONVERSE_FUNCTION_URL=${BASE.strandsUrl}`);
        expect(rendered).toMatch(/^LOCAL_CONVERSE_FUNCTION_URL=http:\/\/127\.0\.0\.1:8765$/m);
    });

    it('states the converse URL constraint above the generated line', () => {
        const rendered = renderEnvFile({ ...BASE, vars: [] });
        expect(rendered).toContain('# Must be a loopback or Lambda function URL.\nLOCAL_CONVERSE_FUNCTION_URL=');
    });

    it('refuses a value it cannot represent rather than emitting a mangled one', () => {
        expect(() => quote('ODD', "it's")).toThrow(EnvValueError);
    });
});
