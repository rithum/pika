export const modelPricingValues = [
    'default',
    'anthropic.claude-3-7-sonnet-20250219-v1:0',
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'anthropic.claude-3-5-haiku-20241022-v1:0',
    'anthropic.claude-3-opus-20240229-v1:0',
    'anthropic.claude-3-haiku-20240307-v1:0',
    'anthropic.claude-3-sonnet-20240229-v1:0',
    'anthropic.claude-v2:1',
    'anthropic.claude-v2',
    'anthropic.claude-instant-v1',
    'amazon.nova-micro-v1:0',
    'amazon.nova-lite-v1:0',
    'amazon.nova-pro-v1:0',
    'amazon.titan-text-premier-v1:0'
];
export type ModelPricingKey = (typeof modelPricingValues)[number];
export interface ModelPricing {
    inputPer1000Tokens: number;
    outputPer1000Tokens: number;
}

/**
 * Pricing for each model in dollars per 1000 input and output tokens.
 * TODO: get these from the Bedrock console
 */
export const modelPricing: Record<ModelPricingKey, ModelPricing> = {
    default: {
        inputPer1000Tokens: 0.003,
        outputPer1000Tokens: 0.015
    },
    'anthropic.claude-3-7-sonnet-20250219-v1:0': {
        inputPer1000Tokens: 0.003,
        outputPer1000Tokens: 0.015
    },
    'anthropic.claude-3-5-sonnet-20241022-v2:0': {
        inputPer1000Tokens: 0.003,
        outputPer1000Tokens: 0.015
    },
    'anthropic.claude-3-5-haiku-20241022-v1:0': {
        inputPer1000Tokens: 0.0008,
        outputPer1000Tokens: 0.004
    },
    'anthropic.claude-3-opus-20240229-v1:0': {
        inputPer1000Tokens: 0.015,
        outputPer1000Tokens: 0.075
    },
    'anthropic.claude-3-haiku-20240307-v1:0': {
        inputPer1000Tokens: 0.00025,
        outputPer1000Tokens: 0.00125
    },
    'anthropic.claude-3-sonnet-20240229-v1:0': {
        inputPer1000Tokens: 0.003,
        outputPer1000Tokens: 0.015
    },
    'anthropic.claude-v2:1': {
        inputPer1000Tokens: 0.008,
        outputPer1000Tokens: 0.024
    },
    'anthropic.claude-v2': {
        inputPer1000Tokens: 0.008,
        outputPer1000Tokens: 0.024
    },
    'anthropic.claude-instant-v1': {
        inputPer1000Tokens: 0.0008,
        outputPer1000Tokens: 0.0024
    },
    'amazon.nova-micro-v1:0': {
        inputPer1000Tokens: 0.000035,
        outputPer1000Tokens: 0.00000875
    },
    'amazon.nova-lite-v1:0': {
        inputPer1000Tokens: 0.00006,
        outputPer1000Tokens: 0.000015
    },
    'amazon.nova-pro-v1:0': {
        inputPer1000Tokens: 0.0008,
        outputPer1000Tokens: 0.0002
    },
    'amazon.titan-text-premier-v1:0': {
        inputPer1000Tokens: 0.0005,
        outputPer1000Tokens: 0.0015
    }
};
