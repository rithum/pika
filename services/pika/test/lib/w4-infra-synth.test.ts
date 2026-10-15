import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ConverseStrandsConstruct } from '../../lib/constructs/converse-strands-construct';
import { PikaConstruct } from '../../lib/constructs/pika-construct';

const APPLICATION_PROFILE_ARN = 'arn:aws:bedrock:*:*:application-inference-profile/*';
const EXISTING_PROFILE_IDS = [
    'PikaConstructClaude4SonnetInferenceProfile208A4E5E',
    'PikaConstructClaude45HaikuInferenceProfile04FA7AF7',
    'PikaConstructClaude45SonnetInferenceProfileE3A8663E',
    'PikaConstructClaude46SonnetInferenceProfile898C82C8'
];

let template: Template;

beforeAll(() => {
    const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } });
    // The OpenSearch domain is named after the stack, and domain names must be lowercase.
    const stack = new cdk.Stack(app, 'pika-test', { env: { account: '123456789012', region: 'us-east-1' } });
    const pika = new PikaConstruct(stack, 'PikaConstruct', {
        stage: 'test',
        stackName: stack.stackName,
        region: 'us-east-1',
        account: '123456789012',
        projNameL: 'pika',
        projNameKebabCase: 'pika',
        projNameTitleCase: 'Pika',
        projNameCamel: 'pika',
        projNameHuman: 'Pika',
        sessionInsightsFeature: { enabled: true },
        userMemoryFeature: { enabled: false }
    });
    new ConverseStrandsConstruct(stack, 'ConverseStrands', { projNameKebabCase: 'pika', stage: 'test', pikaOutputs: pika.outputs });
    template = Template.fromStack(stack);
});

function profileRef(profileName: string): { Ref: string } {
    const match = Object.entries(template.findResources('Custom::CreateInferenceProfile')).find(
        ([, resource]) => resource.Properties.inferenceProfileName === `pika-test-${profileName}`
    );
    expect(match).toBeDefined();
    return { Ref: match![0] };
}

function lambdaEnv(logicalIdPrefix: string): Record<string, unknown> {
    const matches = Object.entries(template.findResources('AWS::Lambda::Function')).filter(([id]) => id.startsWith(logicalIdPrefix));
    expect(matches).toHaveLength(1);
    return matches[0][1].Properties.Environment.Variables;
}

describe('inference profile wiring (synthesized)', () => {
    it('adds the Sonnet 5 and 5.5 profiles and keeps the existing logical IDs', () => {
        template.resourceCountIs('Custom::CreateInferenceProfile', 6);
        expect(Object.keys(template.findResources('Custom::CreateInferenceProfile'))).toEqual(expect.arrayContaining(EXISTING_PROFILE_IDS));
        profileRef('claude-sonnet-5');
        profileRef('claude-sonnet-5-5');
    });

    it('lets the Strands role invoke application inference profiles', () => {
        const policies = Object.entries(template.findResources('AWS::IAM::Policy')).filter(([id]) => id.startsWith('ConverseStrandsRoleDefaultPolicy'));
        expect(policies).toHaveLength(1);
        const statements: any[] = policies[0][1].Properties.PolicyDocument.Statement;
        const bedrock = statements.find((s) => Array.isArray(s.Action) && s.Action.includes('bedrock:InvokeModel'));
        expect(bedrock.Resource).toContain(APPLICATION_PROFILE_ARN);
    });

    it.each([
        ['Strands converse Lambda', 'ConverseStrandsFunction'],
        ['insights runner Lambda', 'PikaConstructSessionInsightsRunnerLambda']
    ])('passes the Sonnet 5 and 5.5 profile ARNs to the %s', (_label, logicalIdPrefix) => {
        const env = lambdaEnv(logicalIdPrefix);
        expect(env.INFERENCE_PROFILE_ANTHROPIC_Claude5Sonnet).toEqual(profileRef('claude-sonnet-5'));
        expect(env.INFERENCE_PROFILE_ANTHROPIC_Claude5_5Sonnet).toEqual(profileRef('claude-sonnet-5-5'));
    });
});
