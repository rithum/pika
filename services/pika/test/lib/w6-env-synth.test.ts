import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import type { PikaConfig } from 'pika-shared/types/chatbot/chatbot-types';
import { ConverseStrandsConstruct } from '../../lib/constructs/converse-strands-construct';
import { PikaConstruct, PikaConstructProps } from '../../lib/constructs/pika-construct';
import { PikaStack } from '../../lib/stacks/pika-stack';

const ENV = { account: '123456789012', region: 'us-east-1' };

const BASE_PROPS: PikaConstructProps = {
    stage: 'test',
    stackName: 'pika-test',
    region: ENV.region,
    account: ENV.account,
    projNameL: 'pika',
    projNameKebabCase: 'pika',
    projNameTitleCase: 'Pika',
    projNameCamel: 'pika',
    projNameHuman: 'Pika',
    sessionInsightsFeature: { enabled: true },
    userMemoryFeature: { enabled: false }
};

function newApp(): cdk.App {
    return new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } });
}

function lambdaEnv(template: Template, logicalIdPrefix: string): Record<string, unknown> {
    const matches = Object.entries(template.findResources('AWS::Lambda::Function')).filter(([id]) => id.startsWith(logicalIdPrefix));
    expect(matches).toHaveLength(1);
    return matches[0][1].Properties.Environment.Variables;
}

function synthPika(overrides: Partial<PikaConstructProps>): Template {
    const stack = new cdk.Stack(newApp(), 'pika-test', { env: ENV });
    new PikaConstruct(stack, 'PikaConstruct', { ...BASE_PROPS, ...overrides });
    return Template.fromStack(stack);
}

function synthStrands(strandsProps: { accountIdFieldNames?: string[]; sessionIdentityFieldNames?: string[] }): Template {
    const stack = new cdk.Stack(newApp(), 'pika-test', { env: ENV });
    const pika = new PikaConstruct(stack, 'PikaConstruct', BASE_PROPS);
    new ConverseStrandsConstruct(stack, 'ConverseStrands', { projNameKebabCase: 'pika', stage: 'test', pikaOutputs: pika.outputs, ...strandsProps });
    return Template.fromStack(stack);
}

function pikaConfig(overrides: Partial<PikaConfig>): PikaConfig {
    return { siteFeatures: { strandsConverse: { enabled: true } }, ...overrides } as PikaConfig;
}

function synthStack(config: PikaConfig): Template {
    const stack = new PikaStack(newApp(), 'pika-test', {
        env: ENV,
        stage: 'test',
        projNameL: 'pika',
        projNameKebabCase: 'pika',
        projNameTitleCase: 'Pika',
        projNameCamel: 'pika',
        projNameHuman: 'Pika',
        sessionInsightsFeature: { enabled: true },
        userMemoryFeature: { enabled: false },
        pikaConfig: config
    });
    return Template.fromStack(stack);
}

describe('PikaConstruct account id pattern env', () => {
    it('sets both variables on the chat-admin function when given', () => {
        const env = lambdaEnv(synthPika({ accountIdPattern: '[0-9]{9}', accountIdPatternDescription: 'nine digits' }), 'PikaConstructChatAdminApiFunction');
        expect(env.PIKA_ACCOUNT_ID_PATTERN).toBe('[0-9]{9}');
        expect(env.PIKA_ACCOUNT_ID_PATTERN_DESCRIPTION).toBe('nine digits');
    });

    it('sets neither variable when not given', () => {
        const env = lambdaEnv(synthPika({}), 'PikaConstructChatAdminApiFunction');
        expect(env).not.toHaveProperty('PIKA_ACCOUNT_ID_PATTERN');
        expect(env).not.toHaveProperty('PIKA_ACCOUNT_ID_PATTERN_DESCRIPTION');
    });
});

describe('ConverseStrandsConstruct identity env', () => {
    it('carries both field-name variables when given', () => {
        const env = lambdaEnv(synthStrands({ accountIdFieldNames: ['accountId', 'account_id'], sessionIdentityFieldNames: ['delegateId', 'delegateEmail'] }), 'ConverseStrandsFunction');
        expect(env.PIKA_ACCOUNT_ID_FIELD_NAMES).toBe('accountId,account_id');
        expect(env.PIKA_SESSION_IDENTITY_FIELD_NAMES).toBe('delegateId,delegateEmail');
    });

    it('carries neither when not given', () => {
        const env = lambdaEnv(synthStrands({}), 'ConverseStrandsFunction');
        expect(env).not.toHaveProperty('PIKA_ACCOUNT_ID_FIELD_NAMES');
        expect(env).not.toHaveProperty('PIKA_SESSION_IDENTITY_FIELD_NAMES');
    });
});

describe('PikaStack wiring', () => {
    it('passes the access control pattern to chat-admin and the identity names to the Strands function', () => {
        const template = synthStack(
            pikaConfig({
                accountIdFieldNames: ['accountId'],
                sessionIdentityFieldNames: ['delegateId'],
                siteFeatures: {
                    strandsConverse: { enabled: true },
                    siteAdmin: { websiteEnabled: true, accessControl: { accountIdPattern: '[0-9]{9}', accountIdPatternDescription: 'nine digits' } }
                }
            })
        );
        const adminEnv = lambdaEnv(template, 'PikaConstructChatAdminApiFunction');
        expect(adminEnv.PIKA_ACCOUNT_ID_PATTERN).toBe('[0-9]{9}');
        expect(adminEnv.PIKA_ACCOUNT_ID_PATTERN_DESCRIPTION).toBe('nine digits');
        const strandsEnv = lambdaEnv(template, 'ConverseStrandsFunction');
        expect(strandsEnv.PIKA_ACCOUNT_ID_FIELD_NAMES).toBe('accountId');
        expect(strandsEnv.PIKA_SESSION_IDENTITY_FIELD_NAMES).toBe('delegateId');
    });

    it('sets none of the variables without configuration', () => {
        const template = synthStack(pikaConfig({}));
        expect(lambdaEnv(template, 'PikaConstructChatAdminApiFunction')).not.toHaveProperty('PIKA_ACCOUNT_ID_PATTERN');
        expect(lambdaEnv(template, 'ConverseStrandsFunction')).not.toHaveProperty('PIKA_SESSION_IDENTITY_FIELD_NAMES');
    });

    it('rejects an invalid accountIdPattern at synth', () => {
        const config = pikaConfig({ siteFeatures: { siteAdmin: { websiteEnabled: true, accessControl: { accountIdPattern: '(' } } } });
        expect(() => synthStack(config)).toThrow('siteFeatures.siteAdmin.accessControl.accountIdPattern is not a valid regular expression');
    });
});
