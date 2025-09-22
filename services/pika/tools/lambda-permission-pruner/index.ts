import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { LambdaClient, GetPolicyCommand, RemovePermissionCommand } from '@aws-sdk/client-lambda';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

type Statement = {
    Sid?: string;
    Effect?: string;
    Principal?: { Service?: string } | string;
    Action?: string | string[];
    Resource?: string | string[];
    Condition?: Record<string, Record<string, string>>;
};

type PolicyDocument = {
    Version?: string;
    Id?: string;
    Statement: Statement[];
};

function loadEnv(): void {
    // Load .env.local if present (located at services/pika/.env.local)
    const envPath = path.join(__dirname, '../../', '.env.local');
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`Loaded environment variables from ${envPath}`);
    }
}

function requireEnv(keys: string[]): void {
    const missing = keys.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}. Create services/pika/.env.local with these keys or export them in your shell.`);
    }
}

function buildSsmPath(prefix: string, parts: string[]): string {
    return [prefix, ...parts].join('/');
}

async function getSsmParam(ssm: SSMClient, name: string): Promise<string> {
    const resp = await ssm.send(new GetParameterCommand({ Name: name }));
    const value = resp.Parameter?.Value;
    if (!value) throw new Error(`SSM parameter not found or empty: ${name}`);
    return value;
}

function getSourceArn(stmt: Statement): string | undefined {
    const cond = stmt.Condition || {};
    const arnLike = cond.ArnLike || cond['ArnLike'] || cond['StringLike'] || {};
    const arnEq = cond.ArnEquals || cond['ArnEquals'] || cond['StringEquals'] || {};
    return arnLike['AWS:SourceArn'] || arnLike['aws:SourceArn'] || arnEq['AWS:SourceArn'] || arnEq['aws:SourceArn'];
}

function isApiGatewayPrincipal(principal: Statement['Principal']): boolean {
    if (!principal) return false;
    if (typeof principal === 'string') return principal === 'apigateway.amazonaws.com';
    return principal.Service === 'apigateway.amazonaws.com';
}

function isAdminWildcardPermission(sourceArn: string, apiId: string): boolean {
    // Matches:
    // arn:aws:execute-api:REGION:ACCOUNT:APIID/<stage>/*/api/chat-admin
    // arn:aws:execute-api:REGION:ACCOUNT:APIID/<stage>/*/api/chat-admin/...
    const pattern = new RegExp(`:${apiId}/[^/]+/\\*/api/chat-admin(?:/.*)?$`);
    return pattern.test(sourceArn);
}

function isChatbotWildcardPermission(sourceArn: string, apiId: string): boolean {
    // Matches:
    // arn:aws:execute-api:REGION:ACCOUNT:APIID/<stage>/*/api/chat
    // arn:aws:execute-api:REGION:ACCOUNT:APIID/<stage>/*/api/chat/...
    const pattern = new RegExp(`:${apiId}/[^/]+/\\*/api/chat(?:/.*)?$`);
    return pattern.test(sourceArn);
}

function classifyStatements(
    statements: Statement[],
    currentApiId: string,
    isWildcardPermission: (sourceArn: string, apiId: string) => boolean
): { keep: Statement[]; remove: Statement[] } {
    const keep: Statement[] = [];
    const remove: Statement[] = [];
    for (const s of statements) {
        if (!isApiGatewayPrincipal(s.Principal)) {
            // Not from API Gateway → ignore in this tool (treated as keep/no-op)
            keep.push(s);
            continue;
        }
        const sourceArn = getSourceArn(s) || '';
        if (!sourceArn.includes(`:${currentApiId}`)) {
            // Clearly stale (different API id)
            remove.push(s);
            continue;
        }
        // Default behavior: keep only minimal wildcard ANY permissions for proxy/root
        if (isWildcardPermission(sourceArn, currentApiId)) {
            keep.push(s);
        } else {
            remove.push(s);
        }
    }
    return { keep, remove };
}

async function listAdmin(lambda: LambdaClient, ssm: SSMClient, ssmPrefix: string): Promise<void> {
    const adminApiId = await getSsmParam(ssm, buildSsmPath(ssmPrefix, ['api', 'chat_admin_id']));
    const adminFnName = await getSsmParam(ssm, buildSsmPath(ssmPrefix, ['lambda', 'chat_admin_api_name']));

    let policyDoc: PolicyDocument | undefined;
    try {
        const policy = await lambda.send(new GetPolicyCommand({ FunctionName: adminFnName }));
        policyDoc = policy.Policy ? (JSON.parse(policy.Policy) as PolicyDocument) : undefined;
    } catch (err: any) {
        if (err?.name === 'ResourceNotFoundException') {
            console.log(`No resource-based policy found on ${adminFnName}`);
            return;
        }
        throw err;
    }

    const statements = policyDoc?.Statement ?? [];
    const { keep, remove } = classifyStatements(statements, adminApiId, isAdminWildcardPermission);

    console.log(
        JSON.stringify(
            {
                functionName: adminFnName,
                apiId: adminApiId,
                totalStatements: statements.length,
                keepCount: keep.length,
                removeCount: remove.length,
                removeSids: remove.map((s) => s.Sid).filter(Boolean)
            },
            null,
            2
        )
    );
}

async function pruneAdmin(lambda: LambdaClient, ssm: SSMClient, ssmPrefix: string, dryRun: boolean): Promise<void> {
    const adminApiId = await getSsmParam(ssm, buildSsmPath(ssmPrefix, ['api', 'chat_admin_id']));
    const adminFnName = await getSsmParam(ssm, buildSsmPath(ssmPrefix, ['lambda', 'chat_admin_api_name']));

    let policyDoc: PolicyDocument | undefined;
    try {
        const policy = await lambda.send(new GetPolicyCommand({ FunctionName: adminFnName }));
        policyDoc = policy.Policy ? (JSON.parse(policy.Policy) as PolicyDocument) : undefined;
    } catch (err: any) {
        if (err?.name === 'ResourceNotFoundException') {
            console.log(`No resource-based policy found on ${adminFnName}`);
            return;
        }
        throw err;
    }

    const statements = policyDoc?.Statement ?? [];
    const { remove } = classifyStatements(statements, adminApiId, isAdminWildcardPermission);
    const sids = remove.map((s) => s.Sid).filter(Boolean) as string[];

    if (sids.length === 0) {
        console.log('No stale API Gateway permission statements to remove.');
        return;
    }

    console.log(`Target function: ${adminFnName}`);
    console.log(`Current API ID: ${adminApiId}`);
    console.log(`Found ${sids.length} stale statement(s) to remove: ${sids.join(', ')}`);

    if (dryRun) {
        console.log('Dry run: no changes made.');
        return;
    }

    const results = await Promise.allSettled(
        sids.map((sid) =>
            lambda.send(
                new RemovePermissionCommand({
                    FunctionName: adminFnName,
                    StatementId: sid
                })
            )
        )
    );

    const summary = results.map((r, i) => ({ sid: sids[i], status: r.status, reason: (r as any).reason?.message }));
    console.log(JSON.stringify({ removed: summary }, null, 2));
}

async function listChatbot(lambda: LambdaClient, ssm: SSMClient, ssmPrefix: string): Promise<void> {
    const chatbotApiId = await getSsmParam(ssm, buildSsmPath(ssmPrefix, ['api', 'id']));
    const chatbotFnName = await getSsmParam(ssm, buildSsmPath(ssmPrefix, ['lambda', 'chatbot_api_name']));

    let policyDoc: PolicyDocument | undefined;
    try {
        const policy = await lambda.send(new GetPolicyCommand({ FunctionName: chatbotFnName }));
        policyDoc = policy.Policy ? (JSON.parse(policy.Policy) as PolicyDocument) : undefined;
    } catch (err: any) {
        if (err?.name === 'ResourceNotFoundException') {
            console.log(`No resource-based policy found on ${chatbotFnName}`);
            return;
        }
        throw err;
    }

    const statements = policyDoc?.Statement ?? [];
    const { keep, remove } = classifyStatements(statements, chatbotApiId, isChatbotWildcardPermission);

    console.log(
        JSON.stringify(
            {
                functionName: chatbotFnName,
                apiId: chatbotApiId,
                totalStatements: statements.length,
                keepCount: keep.length,
                removeCount: remove.length,
                removeSids: remove.map((s) => s.Sid).filter(Boolean)
            },
            null,
            2
        )
    );
}

async function pruneChatbot(lambda: LambdaClient, ssm: SSMClient, ssmPrefix: string, dryRun: boolean): Promise<void> {
    const chatbotApiId = await getSsmParam(ssm, buildSsmPath(ssmPrefix, ['api', 'id']));
    const chatbotFnName = await getSsmParam(ssm, buildSsmPath(ssmPrefix, ['lambda', 'chatbot_api_name']));

    let policyDoc: PolicyDocument | undefined;
    try {
        const policy = await lambda.send(new GetPolicyCommand({ FunctionName: chatbotFnName }));
        policyDoc = policy.Policy ? (JSON.parse(policy.Policy) as PolicyDocument) : undefined;
    } catch (err: any) {
        if (err?.name === 'ResourceNotFoundException') {
            console.log(`No resource-based policy found on ${chatbotFnName}`);
            return;
        }
        throw err;
    }

    const statements = policyDoc?.Statement ?? [];
    const { remove } = classifyStatements(statements, chatbotApiId, isChatbotWildcardPermission);
    const sids = remove.map((s) => s.Sid).filter(Boolean) as string[];

    if (sids.length === 0) {
        console.log('No stale API Gateway permission statements to remove.');
        return;
    }

    console.log(`Target function: ${chatbotFnName}`);
    console.log(`Current API ID: ${chatbotApiId}`);
    console.log(`Found ${sids.length} stale statement(s) to remove: ${sids.join(', ')}`);

    if (dryRun) {
        console.log('Dry run: no changes made.');
        return;
    }

    const results = await Promise.allSettled(
        sids.map((sid) =>
            lambda.send(
                new RemovePermissionCommand({
                    FunctionName: chatbotFnName,
                    StatementId: sid
                })
            )
        )
    );

    const summary = results.map((r, i) => ({ sid: sids[i], status: r.status, reason: (r as any).reason?.message }));
    console.log(JSON.stringify({ removed: summary }, null, 2));
}

async function listAll(lambda: LambdaClient, ssm: SSMClient, ssmPrefix: string): Promise<void> {
    console.log('=== Chat Admin API ===');
    await listAdmin(lambda, ssm, ssmPrefix);
    console.log('\n=== Chatbot API ===');
    await listChatbot(lambda, ssm, ssmPrefix);
}

async function pruneAll(lambda: LambdaClient, ssm: SSMClient, ssmPrefix: string, dryRun: boolean): Promise<void> {
    console.log('=== Pruning Chat Admin API ===');
    await pruneAdmin(lambda, ssm, ssmPrefix, dryRun);
    console.log('\n=== Pruning Chatbot API ===');
    await pruneChatbot(lambda, ssm, ssmPrefix, dryRun);
}

async function main(): Promise<void> {
    loadEnv();
    requireEnv(['stage', 'AWS_REGION', 'PIKA_SERVICE_PROJ_NAME_KEBAB_CASE']);

    const region = process.env.AWS_REGION as string;
    const stage = process.env.stage as string;
    const proj = process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE as string;

    const ssmPrefix = `/stack/${proj}/${stage}`;

    const ssm = new SSMClient({ region });
    const lambda = new LambdaClient({ region });

    const [, , cmdRaw, ...rest] = process.argv;
    const cmd = (cmdRaw ?? 'help').toLowerCase();
    const dryRun = rest.includes('--dry-run') || rest.includes('--dry') || rest.includes('-n');

    switch (cmd) {
        case 'list-admin':
            await listAdmin(lambda, ssm, ssmPrefix);
            break;
        case 'prune-admin':
            await pruneAdmin(lambda, ssm, ssmPrefix, dryRun);
            break;
        case 'list-chatbot':
        case 'list-chat':
            await listChatbot(lambda, ssm, ssmPrefix);
            break;
        case 'prune-chatbot':
        case 'prune-chat':
            await pruneChatbot(lambda, ssm, ssmPrefix, dryRun);
            break;
        case 'list-all':
        case 'list':
            await listAll(lambda, ssm, ssmPrefix);
            break;
        case 'prune-all':
        case 'prune':
            await pruneAll(lambda, ssm, ssmPrefix, dryRun);
            break;
        case 'help':
        default:
            console.log(
                [
                    'Usage:',
                    '  pnpm tsx tools/lambda-permission-pruner/index.ts <command> [--dry-run]',
                    '',
                    'Commands:',
                    '  list-admin           Show current policy for Chat Admin Lambda',
                    '  prune-admin          Remove stale API Gateway permissions for Chat Admin Lambda',
                    '  list-chatbot|list-chat  Show current policy for Chatbot Lambda',
                    '  prune-chatbot|prune-chat Remove stale API Gateway permissions for Chatbot Lambda',
                    '  list-all|list        Show current policies for both lambdas',
                    '  prune-all|prune      Remove stale API Gateway permissions for both lambdas',
                    '',
                    'Flags:',
                    '  --dry-run, -n        Do not change anything; just report',
                    '',
                    'Env (.env.local at services/pika):',
                    '  stage, AWS_REGION, PIKA_SERVICE_PROJ_NAME_KEBAB_CASE',
                    ''
                ].join('\n')
            );
            if (cmd !== 'help') throw new Error(`Unknown command: ${cmd}`);
            break;
    }
}

void main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
