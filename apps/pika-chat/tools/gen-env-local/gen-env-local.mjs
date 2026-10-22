#!/usr/bin/env node
// Regenerates apps/pika-chat/.env.local from the deployed pika-chat ECS task definition.
// Usage: `pnpm env:local [stage] [-w]` (default stage test; -w writes the file).
// Requires the AWS CLI and credentials.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnvValueError, renderEnvFile } from './render.js';

const CHAT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const IS_WINDOWS = process.platform === 'win32';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('-')));
const stage = args.find((a) => !a.startsWith('-')) ?? 'test';
const proj = process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE ?? 'pika';
const chatProj = process.env.PIKA_CHAT_PROJ_NAME_KEBAB_CASE ?? 'pika-chat';

const LOCAL_WEBAPP_URL = process.env.PIKA_LOCAL_WEBAPP_URL ?? `https://localhost:${process.env.VITE_PORT ?? '8443'}`;
const STRANDS_PORT = process.env.STRANDS_PORT ?? '8765';

function fail(msg) {
    console.error(`[env:local] ${msg}`);
    process.exit(1);
}

function aws(cliArgs, { allowFail = false } = {}) {
    const r = spawnSync('aws', cliArgs, { encoding: 'utf8', shell: IS_WINDOWS });
    if (r.status !== 0) {
        if (allowFail) return null;
        fail(`aws ${cliArgs.slice(0, 2).join(' ')} failed:\n${(r.stderr ?? '').trim()}`);
    }
    return (r.stdout ?? '').trim();
}

const clusters = (aws(['ecs', 'list-clusters', '--output', 'text', '--query', 'clusterArns[]']) ?? '').split(/\s+/);
const cluster = clusters.find((c) => c.includes(`cluster/${chatProj}-${stage}-`));
if (!cluster) {
    console.error(`[env:local] no ${chatProj}-${stage} ECS cluster found. Are your AWS credentials valid?`);
    process.exit(1);
}

const service = (aws(['ecs', 'list-services', '--cluster', cluster, '--output', 'text', '--query', 'serviceArns[]']) ?? '').split(/\s+/)[0];
const taskDef = aws(['ecs', 'describe-services', '--cluster', cluster, '--services', service, '--query', 'services[0].taskDefinition', '--output', 'text']);
const envJson = aws(['ecs', 'describe-task-definition', '--task-definition', taskDef, '--query', 'taskDefinition.containerDefinitions[0].environment[]', '--output', 'json']);

// A container with no environment yields the string "null", which parses to null - so the
// alternative to this guard is a TypeError on .filter rather than a message naming the cause.
const env = envJson && envJson !== 'null' ? JSON.parse(envJson) : null;
if (!env?.length) {
    fail(`${taskDef.split('/').pop()} declares no container environment - wrong stage, or a broken deploy?`);
}

const strandsUrl = aws(['ssm', 'get-parameter', '--name', `/stack/${proj}/${stage}/function/converse_strands_url`, '--query', 'Parameter.Value', '--output', 'text'], {
    allowFail: true
});

let out;
try {
    out = renderEnvFile({
        taskDefName: taskDef.split('/').pop(),
        stage,
        generatedAt: new Date().toISOString(),
        webappUrl: LOCAL_WEBAPP_URL,
        vars: env,
        strandsPort: STRANDS_PORT,
        strandsUrl
    });
} catch (err) {
    if (err instanceof EnvValueError) fail(err.message);
    throw err;
}

if (flags.has('-w')) {
    const target = join(CHAT_DIR, '.env.local');
    writeFileSync(target, out);
    console.error(`[env:local] wrote ${target}`);
} else {
    process.stdout.write(out);
}
