const HAIKU_PROFILE_ARN = 'arn:aws:bedrock:us-east-1:000000001:application-inference-profile/haiku';
const HAIKU_BARE_ID = 'anthropic.claude-haiku-4-5-20251001-v1:0';
const HAIKU_PRICE = { inputPer1000Tokens: 0.001, outputPer1000Tokens: 0.005 };

let getBaseModelId: (modelId: string) => string;
let modelPricing: Record<string, { inputPer1000Tokens: number; outputPer1000Tokens: number }>;

beforeAll(async () => {
    process.env.INFERENCE_PROFILE_ANTHROPIC_Claude4_5Haiku = HAIKU_PROFILE_ARN;
    ({ getBaseModelId } = await import('../../src/lib/model-types-utils'));
    ({ modelPricing } = await import('../../src/lambda/converse/model-pricing'));
});

afterAll(() => {
    delete process.env.INFERENCE_PROFILE_ANTHROPIC_Claude4_5Haiku;
});

describe('pricing a profile registered through the environment', () => {
    it('prices the profile ARN at its base model row', () => {
        expect(modelPricing[getBaseModelId(HAIKU_PROFILE_ARN)]).toEqual(HAIKU_PRICE);
    });

    it('prices the bare Haiku 4.5 id at $1 in and $5 out per million tokens', () => {
        expect(modelPricing[getBaseModelId(HAIKU_BARE_ID)]).toEqual(HAIKU_PRICE);
    });

    it('prices the us. Haiku 4.5 id the same as the bare id', () => {
        expect(modelPricing[getBaseModelId(`us.${HAIKU_BARE_ID}`)]).toEqual(HAIKU_PRICE);
    });
});
