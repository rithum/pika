import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PikaConstruct, PikaConstructProps } from '../../lib/constructs/pika-construct';

const CHAT_ADMIN_LOG_GROUP = 'PikaConstructChatAdminApiAccessLogs';
const CHATBOT_LOG_GROUP = 'PikaConstructChatbotApiAccessLogs';
const API_ADMIN = 'PikaConstructChatAdminApi';
const API_CHATBOT = 'PikaConstructChatbotApi';
const RUNNER_LAMBDA = 'PikaConstructSessionInsightsRunnerLambda';
const START_FLOOR = '2026-01-01';

type Resources = Record<string, { Properties: any; DeletionPolicy?: string }>;

function synth(stage: string, overrides: Partial<PikaConstructProps> = {}): Template {
    const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } });
    const stack = new cdk.Stack(app, 'pika-test', { env: { account: '123456789012', region: 'us-east-1' } });
    new PikaConstruct(stack, 'PikaConstruct', {
        stage,
        stackName: stack.stackName,
        region: 'us-east-1',
        account: '123456789012',
        projNameL: 'pika',
        projNameKebabCase: 'pika',
        projNameTitleCase: 'Pika',
        projNameCamel: 'pika',
        projNameHuman: 'Pika',
        sessionInsightsFeature: { enabled: true },
        userMemoryFeature: { enabled: false },
        ...overrides
    });
    return Template.fromStack(stack);
}

const ENABLED_OVERRIDES: Partial<PikaConstructProps> = {
    chatAdminApiAuth: 'IAM',
    apiAccessLogs: true,
    sessionInsights: { startFloor: START_FLOOR }
};

function logGroups(template: Template, prefix: string): Resources {
    return Object.fromEntries(Object.entries(template.findResources('AWS::Logs::LogGroup') as Resources).filter(([id]) => id.startsWith(prefix)));
}

function restApiId(resource: { Properties: any }): string {
    return resource.Properties.RestApiId.Ref;
}

function stages(template: Template): Resources {
    return template.findResources('AWS::ApiGateway::Stage') as Resources;
}

function stageFor(template: Template, apiPrefix: string) {
    const match = Object.entries(stages(template)).find(([, stage]) => restApiId(stage).startsWith(apiPrefix));
    expect(match).toBeDefined();
    return match![1];
}

function methodsFor(template: Template, apiPrefix: string): Resources {
    const methods = Object.entries(template.findResources('AWS::ApiGateway::Method') as Resources).filter(
        ([, method]) => restApiId(method).startsWith(apiPrefix) && method.Properties.HttpMethod !== 'OPTIONS'
    );
    expect(methods.length).toBeGreaterThan(0);
    return Object.fromEntries(methods);
}

function authTypes(template: Template, apiPrefix: string): string[] {
    return Object.values(methodsFor(template, apiPrefix)).map((m) => m.Properties.AuthorizationType);
}

function runnerFunction(template: Template) {
    const matches = Object.entries(template.findResources('AWS::Lambda::Function')).filter(([id]) => id.startsWith(RUNNER_LAMBDA));
    expect(matches).toHaveLength(1);
    return matches[0][1].Properties;
}

describe('default props', () => {
    let template: Template;

    beforeAll(() => {
        template = synth('test');
    });

    it('creates no access log groups and no stage access logging', () => {
        expect(Object.keys(logGroups(template, CHAT_ADMIN_LOG_GROUP))).toHaveLength(0);
        expect(Object.keys(logGroups(template, CHATBOT_LOG_GROUP))).toHaveLength(0);
        expect(stageFor(template, API_ADMIN).Properties.AccessLogSetting).toBeUndefined();
        expect(stageFor(template, API_CHATBOT).Properties.AccessLogSetting).toBeUndefined();
    });

    it('leaves chat-admin methods without authorization', () => {
        const types = authTypes(template, API_ADMIN);
        expect(types.every((t) => t === 'NONE')).toBe(true);
    });

    it('sets no reserved concurrency and no start floor on the runner', () => {
        const runner = runnerFunction(template);
        expect(runner).not.toHaveProperty('ReservedConcurrentExecutions');
        expect(runner.Environment.Variables).not.toHaveProperty('INSIGHTS_START_FLOOR');
    });
});

describe('apiAccessLogs, chatAdminApiAuth and startFloor set', () => {
    let template: Template;

    beforeAll(() => {
        template = synth('test', ENABLED_OVERRIDES);
    });

    it('creates both log groups with 30-day retention outside prod', () => {
        for (const prefix of [CHAT_ADMIN_LOG_GROUP, CHATBOT_LOG_GROUP]) {
            const groups = Object.values(logGroups(template, prefix));
            expect(groups).toHaveLength(1);
            expect(groups[0].Properties.RetentionInDays).toBe(30);
            expect(groups[0].DeletionPolicy).toBe('Delete');
        }
    });

    it('attaches the log groups to both stages', () => {
        for (const apiPrefix of [API_ADMIN, API_CHATBOT]) {
            expect(stageFor(template, apiPrefix).Properties.AccessLogSetting.DestinationArn).toBeDefined();
        }
    });

    it('requires IAM on chat-admin methods and leaves chatbot methods unchanged', () => {
        const adminTypes = authTypes(template, API_ADMIN);
        expect(adminTypes.every((t) => t === 'AWS_IAM')).toBe(true);
        const chatbotTypes = authTypes(template, API_CHATBOT);
        expect(chatbotTypes.every((t) => t === 'NONE')).toBe(true);
    });

    it('passes the start floor to the runner', () => {
        const runner = runnerFunction(template);
        expect(runner).not.toHaveProperty('ReservedConcurrentExecutions');
        expect(runner.Environment.Variables.INSIGHTS_START_FLOOR).toBe(START_FLOOR);
    });
});

describe('sessionInsights.reservedConcurrency set', () => {
    it('reserves that concurrency for the runner', () => {
        const template = synth('test', { sessionInsights: { startFloor: START_FLOOR, reservedConcurrency: 1 } });
        expect(runnerFunction(template).ReservedConcurrentExecutions).toBe(1);
    });
});

describe('prod stage', () => {
    it('retains log groups for 90 days', () => {
        const template = synth('prod', { apiAccessLogs: true });
        for (const prefix of [CHAT_ADMIN_LOG_GROUP, CHATBOT_LOG_GROUP]) {
            const groups = Object.values(logGroups(template, prefix));
            expect(groups).toHaveLength(1);
            expect(groups[0].Properties.RetentionInDays).toBe(90);
            expect(groups[0].DeletionPolicy).toBe('Retain');
        }
    });
});
