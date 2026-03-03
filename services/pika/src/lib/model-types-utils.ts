import {
    InvocationInputMember,
    type AgentActionGroup,
    type Attribution,
    type InvokeInlineAgentCommandInput,
    type Message,
    type Trace
} from '@aws-sdk/client-bedrock-agent-runtime';
import { type ChatMessageUsage } from 'pika-shared/types/chatbot/chatbot-types';

export const DEFAULT_ANTHROPIC_MODEL = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
//const DEFAULT_ANTHROPIC_MODEL = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';
export const DEFAULT_ANTHROPIC_VERSION = 'bedrock-2023-05-31';

export const DEFAULT_VERIFICATION_MODEL = 'anthropic.claude-3-haiku-20240307-v1:0'; //'amazon.nova-micro-v1:0';

interface AnthropicConfig {
    maxTokens?: number;
    temperatureExcludesTopP?: boolean;
}

const anthropicPre4_5Config: AnthropicConfig = {
    maxTokens: 65536
};

const anthropic4_5Config: AnthropicConfig = {
    maxTokens: 100000,
    temperatureExcludesTopP: true
};

interface AmazonConfig {
    maxTopK?: number;
}

const amazonConfig128TopK: AmazonConfig = {
    maxTopK: 128
};

const amazonDefaultConfig: AmazonConfig = {};

/**
 * Applies custom inference profile ARNs from environment variables to the model definitions.
 * This allows using account-specific inference profiles for cost tracking while maintaining
 * the same model interface.
 *
 * Environment variables follow the pattern: INFERENCE_PROFILE_ANTHROPIC_ModelName
 * Example: INFERENCE_PROFILE_ANTHROPIC_Claude4_5Sonnet = "arn:aws:bedrock:..."
 */
function applyInferenceProfilesFromEnv<T>(obj: T): T {
    Object.entries(obj as any).forEach(([provider, models]: [string, any]) => {
        Object.entries(models).forEach(([modelKey, model]: [string, any]) => {
            const envVarName = `INFERENCE_PROFILE_${provider}_${modelKey}`;
            const profileArn = process.env[envVarName];

            if (profileArn && profileArn !== 'undefined') {
                console.log(`Using custom inference profile for ${provider}.${modelKey}: ${profileArn}`);
                model.id = profileArn;
            } else {
                console.log(`Using base model for ${provider}.${modelKey}: ${model.id}`);
            }
        });
    });

    return obj;
}

export const MODELS = applyInferenceProfilesFromEnv({
    ANTHROPIC: {
        Claude3Haiku: { name: 'Claude3Haiku', id: 'anthropic.claude-3-haiku-20240307-v1:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this, anthropicPre4_5Config) },
        Claude3Sonnet: { name: 'Claude3Sonnet', id: 'anthropic.claude-3-sonnet-20240229-v1:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this, anthropicPre4_5Config) },
        Claude3Opus: { name: 'Claude3Opus', id: 'anthropic.claude-3-opus-20240229-v1:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this, anthropicPre4_5Config) },
        Claude3_5Haiku: {
            name: 'Claude3_5Haiku',
            id: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
            argsConstructor: buildModelInvokeBodyAnthropic.bind(this, anthropicPre4_5Config)
        },
        Claude3_5SonnetV2: {
            name: 'Claude3_5SonnetV2',
            id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
            argsConstructor: buildModelInvokeBodyAnthropic.bind(this, anthropicPre4_5Config)
        },
        Claude3_7Sonnet: {
            name: 'Claude3_7Sonnet',
            id: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
            argsConstructor: buildModelInvokeBodyAnthropic.bind(this, anthropicPre4_5Config)
        },
        Claude4Sonnet: {
            name: 'Claude4Sonnet',
            id: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
            argsConstructor: buildModelInvokeBodyAnthropic.bind(this, anthropicPre4_5Config)
        },
        Claude4Opus: { name: 'Claude4Opus', id: 'us.anthropic.claude-opus-4-20250514-v1:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this, anthropicPre4_5Config) },
        Claude4_1Opus: {
            name: 'Claude4_1Opus',
            id: 'us.anthropic.claude-opus-4-1-20250805-v1:0',
            argsConstructor: buildModelInvokeBodyAnthropic.bind(this, anthropicPre4_5Config)
        },
        Claude4_5Haiku: {
            name: 'Claude4_5Haiku',
            id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
            argsConstructor: buildModelInvokeBodyAnthropic.bind(this, anthropic4_5Config)
        },
        Claude4_5Sonnet: {
            name: 'Claude4_5Sonnet',
            id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            argsConstructor: buildModelInvokeBodyAnthropic.bind(this, anthropic4_5Config)
        }
    },
    AMAZON: {
        NovaLite: { name: 'NovaLite', id: 'amazon.nova-lite-v1:0', argsConstructor: buildModelInvokeBodyAmazon.bind(this, amazonConfig128TopK) },
        NovaPremier: { name: 'NovaPremier', id: 'amazon.nova-premier-v1:0', argsConstructor: buildModelInvokeBodyAmazon.bind(this, amazonDefaultConfig) },
        NovaPro: { name: 'NovaPro', id: 'amazon.nova-pro-v1:0', argsConstructor: buildModelInvokeBodyAmazon.bind(this, amazonDefaultConfig) },
        NovaMicro: { name: 'NovaMicro', id: 'amazon.nova-micro-v1:0', argsConstructor: buildModelInvokeBodyAmazon.bind(this, amazonConfig128TopK) }
    },
    META: {
        Llama3_2_1B_Instruct: {
            name: 'Llama3_2_1B_Instruct',
            id: 'us.meta.llama3-2-1b-instruct-v1:0',
            argsConstructor: buildModelInvokeBodyMeta.bind(this),
            getModelResponse: parseModelResponseMeta.bind(this)
        },
        Llama3_2_11B_Instruct: {
            name: 'Llama3_2_11B_Instruct',
            id: 'us.meta.llama3-2-11b-instruct-v1:0',
            argsConstructor: buildModelInvokeBodyMeta.bind(this),
            getModelResponse: parseModelResponseMeta.bind(this)
        },
        Llama3_2_90B_Instruct: {
            name: 'Llama3_2_90B_Instruct',
            id: 'us.meta.llama3-2-90b-instruct-v1:0',
            argsConstructor: buildModelInvokeBodyMeta.bind(this),
            getModelResponse: parseModelResponseMeta.bind(this)
        },
        Llama3_3_70B_Instruct: {
            name: 'Llama3_3_70B_Instruct',
            id: 'us.meta.llama3-3-70b-instruct-v1:0',
            argsConstructor: buildModelInvokeBodyMeta.bind(this),
            getModelResponse: parseModelResponseMeta.bind(this)
        }
    }
});

export interface ReturnControlContext {
    sessionId: string;
    invokeCommand: InvokeInlineAgentCommandInput;
}

export interface InvokeAgentHooks {
    onStart: () => void;
    onChunk: (chunk: string, chunkIndex: number, attribution?: Attribution) => void;
    onTrace: (trace: Trace) => void;
    onEnd: (usage: ChatMessageUsage) => void;
    onError: (error: any) => void;
    returnControlHandlers?: Record<string, (returnControl: InvocationInputMember, context: ReturnControlContext) => Promise<unknown>>;
}

export interface ToolContext {
    getInstructions?: (toolIds: string[]) => string;
    getActionGroups: (tools: string[]) => AgentActionGroup[];
    getReturnControlHandlers?: () => Record<string, (returnControl: InvocationInputMember, context: ReturnControlContext) => Promise<unknown>>;
    initialize?: (sessionId: string) => Promise<void>;
    end?: (sessionId: string) => Promise<void>;
}

// Map of model id to model. Also registers non-prefixed base model IDs
// (e.g. "anthropic.claude-…") for cross-region models that use a "us." prefix,
// so callers can reference either form.
export const MODEL_ID_TO_MODEL = Object.values(MODELS)
    .map((provider) => Object.values(provider))
    .flat()
    .reduce(
        (acc, model) => {
            acc[model.id] = model;
            const baseId = model.id.replace(/^us\./, '');
            if (baseId !== model.id && !acc[baseId]) {
                acc[baseId] = model;
            }
            return acc;
        },
        {} as Record<string, Model>
    );

// Standard interface for model invocation body
interface ModelBody {
    //anthropic_version: string;
    topK?: number;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    messages: (Omit<Message, 'content'> & { content: { type: string; text: string }[] })[];
}

// Model definition
interface Model {
    name: string;
    id: string;
    argsConstructor?: (args: ModelBody) => any;
    getModelResponse?: (responseBody: string) => string;
}

// Get the model text response from the response body
export function getModelResponse(modelId: string, responseBody: string) {
    let model = MODEL_ID_TO_MODEL[modelId];
    if (!model) {
        throw new Error(`Model ${modelId} not found`);
    }
    if (model.getModelResponse) {
        return model.getModelResponse(responseBody);
    } else {
        const parsedResponse = JSON.parse(responseBody);
        if (parsedResponse.content?.[0]?.text) {
            return parsedResponse.content[0].text;
        } else if (parsedResponse.output.message?.content?.[0]?.text) {
            return parsedResponse.output.message.content[0].text;
        } else {
            throw new Error(`Model ${modelId} response body is not in the expected format: ${responseBody}`);
        }
    }
}

// Build the model invocation body
export function buildModelInvokeBody(modelId: string, args: ModelBody) {
    let model = MODEL_ID_TO_MODEL[modelId];
    if (!model) {
        throw new Error(`Model ${modelId} not found`);
    }
    return model.argsConstructor ? model.argsConstructor(args) : args;
}

// Build the model invocation body for Anthropic
function buildModelInvokeBodyAnthropic(config: AnthropicConfig, args: ModelBody) {
    const body: any = {
        anthropic_version: DEFAULT_ANTHROPIC_VERSION,
        top_k: args.topK,
        temperature: args.temperature,
        top_p: args.topP,
        max_tokens: args.maxTokens,
        messages: args.messages
    };

    // For Claude 4.5+ models, temperature and topP are mutually exclusive
    if (config.temperatureExcludesTopP && body.temperature != null) {
        delete body.top_p;
    }

    return body;
}

// Build the model invocation body for Meta
function buildModelInvokeBodyMeta(args: ModelBody) {
    return {
        temperature: args.temperature,
        top_p: args.topP,
        //top_k: args.topK,
        max_gen_len: args.maxTokens,
        //messages: args.messages
        prompt:
            args.messages
                .map((message) => {
                    return `<|begin_of_text|><|start_header_id|>${message.role}<|end_header_id|>${message.content.map((content) => content.text).join(' ')}<|eot_id|>`;
                })
                .join('') + '<|start_header_id|>assistant<|end_header_id|>'
    };
}

// Build the model invocation body for Amazon
function buildModelInvokeBodyAmazon(opts: { maxTopK?: number } | undefined, args: ModelBody) {
    let body = {
        inferenceConfig: {
            temperature: args.temperature,
            topP: args.topP,
            topK: args.topK,
            maxTokens: args.maxTokens
        },
        messages: args.messages.map((message) => ({
            role: message.role,
            content: message.content.map((content) => ({
                //type: content.type,
                text: content.text
            }))
        }))
    };
    if (opts?.maxTopK != null) {
        body.inferenceConfig.topK = Math.min(args.topK ?? 0, opts.maxTopK);
    }
    //delete body.inferenceConfig.topK; // Not supported
    if (body.inferenceConfig.temperature != null && body.inferenceConfig.topP != null) {
        delete body.inferenceConfig.topP; // Use temperature or topP, not both
    }
    return body;
}

function parseModelResponseMeta(responseBody: string) {
    let parsedResponse = JSON.parse(responseBody);
    if (parsedResponse.generation) {
        return parsedResponse.generation;
    } else {
        throw new Error(`Model response is not in the expected format: ${responseBody}`);
    }
}

export function tryParseIntoJson(text: string | undefined) {
    if (text == null) {
        return text;
    }
    try {
        return JSON.parse(text);
    } catch (e) {
        return text;
    }
}
