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

export const MODELS = {
    ANTHROPIC: {
        Claude3Haiku: { name: 'Claude3Haiku', id: 'anthropic.claude-3-haiku-20240307-v1:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this) },
        Claude3Sonnet: { name: 'Claude3Sonnet', id: 'anthropic.claude-3-sonnet-20240229-v1:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this) },
        Claude3Opus: { name: 'Claude3Opus', id: 'anthropic.claude-3-opus-20240229-v1:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this) },
        Claude3_5Haiku: { name: 'Claude3_5Haiku', id: 'us.anthropic.claude-3-5-haiku-20241022-v1:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this) },
        Claude3_5SonnetV2: { name: 'Claude3_5SonnetV2', id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this) },
        Claude3_7Sonnet: { name: 'Claude3_7Sonnet', id: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this) },
        Claude4Sonnet: { name: 'Claude4Sonnet', id: 'us.anthropic.claude-sonnet-4-20250514-v1:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this) },
        Claude4Opus: { name: 'Claude4Opus', id: 'us.anthropic.claude-opus-4-20250514-v1:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this) },
        Claude4_1Opus: { name: 'Claude4_1Opus', id: 'us.anthropic.claude-opus-4-1-20250805-v1:0', argsConstructor: buildModelInvokeBodyAnthropic.bind(this) }
    },
    AMAZON: {
        NovaLite: { name: 'NovaLite', id: 'amazon.nova-lite-v1:0', argsConstructor: buildModelInvokeBodyAmazon.bind(this, { maxTopK: 128 }) },
        NovaPremier: { name: 'NovaPremier', id: 'amazon.nova-premier-v1:0', argsConstructor: buildModelInvokeBodyAmazon.bind(this, {}) },
        NovaPro: { name: 'NovaPro', id: 'amazon.nova-pro-v1:0', argsConstructor: buildModelInvokeBodyAmazon.bind(this, {}) },
        NovaMicro: { name: 'NovaMicro', id: 'amazon.nova-micro-v1:0', argsConstructor: buildModelInvokeBodyAmazon.bind(this, { maxTopK: 128 }) }
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
};

// Map of model id to model
export const MODEL_ID_TO_MODEL = Object.values(MODELS)
    .map((provider) => Object.values(provider))
    .flat()
    .reduce(
        (acc, model) => {
            acc[model.id] = model;
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
function buildModelInvokeBodyAnthropic(args: ModelBody) {
    return {
        anthropic_version: DEFAULT_ANTHROPIC_VERSION,
        top_k: args.topK,
        temperature: args.temperature,
        top_p: args.topP,
        max_tokens: args.maxTokens,
        messages: args.messages
    };
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
