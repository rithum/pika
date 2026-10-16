import { readFileSync } from 'fs';
import { join } from 'path';

const PROFILE_ARN = 'arn:aws:bedrock:us-east-1:123:application-inference-profile/abc';

let getBaseModelId: (modelId: string) => string;
let modelPricing: Record<string, { inputPer1000Tokens: number; outputPer1000Tokens: number }>;

beforeAll(async () => {
    process.env.INFERENCE_PROFILE_ANTHROPIC_Claude5Sonnet = PROFILE_ARN;
    ({ getBaseModelId } = await import('../../src/lib/model-types-utils'));
    ({ modelPricing } = await import('../../src/lambda/converse/model-pricing'));
});

afterAll(() => {
    delete process.env.INFERENCE_PROFILE_ANTHROPIC_Claude5Sonnet;
});

describe('getBaseModelId', () => {
    it('strips the us. prefix', () => {
        expect(getBaseModelId('us.anthropic.claude-sonnet-5')).toBe('anthropic.claude-sonnet-5');
    });

    it('leaves a bare model ID unchanged', () => {
        expect(getBaseModelId('anthropic.claude-sonnet-5-5')).toBe('anthropic.claude-sonnet-5-5');
    });

    it('leaves a non-Anthropic model ID unchanged', () => {
        expect(getBaseModelId('amazon.nova-pro-v1:0')).toBe('amazon.nova-pro-v1:0');
    });

    it('maps an inference profile ARN back to its base model ID', () => {
        expect(getBaseModelId(PROFILE_ARN)).toBe('anthropic.claude-sonnet-5');
    });
});

describe('pricing by base model ID', () => {
    it('prices an inference profile ARN as its base model', () => {
        expect(modelPricing[getBaseModelId(PROFILE_ARN)]).toEqual({ inputPer1000Tokens: 0.002, outputPer1000Tokens: 0.01 });
    });

    it('prices the us. Sonnet 5.5 ID at the Sonnet 5.5 rate', () => {
        expect(modelPricing[getBaseModelId('us.anthropic.claude-sonnet-5-5')]).toEqual({ inputPer1000Tokens: 0.002, outputPer1000Tokens: 0.01 });
    });

    it('prices the us. Haiku 4.5 ID at the Haiku 4.5 rate', () => {
        expect(modelPricing[getBaseModelId('us.anthropic.claude-haiku-4-5-20251001-v1:0')]).toEqual({ inputPer1000Tokens: 0.001, outputPer1000Tokens: 0.005 });
    });

    it('is the key bedrock-agent prices usage by', () => {
        const source = readFileSync(join(__dirname, '../../src/lib/bedrock-agent.ts'), 'utf-8');
        expect(source).toContain("modelPricing[getBaseModelId(model || 'default') as ModelPricingKey]");
    });
});
