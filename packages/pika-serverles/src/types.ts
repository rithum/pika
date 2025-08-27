import { FunctionDefinition } from '@aws-sdk/client-bedrock-agent-runtime';

/**
 * Configuration for a chat app feature
 */
export interface ChatAppFeatureConfig {
    featureId: string;
    enabled: boolean;
    [key: string]: any;
}

/**
 * Configuration for file upload feature
 */
export interface FileUploadFeatureConfig extends ChatAppFeatureConfig {
    featureId: 'fileUpload';
    mimeTypesAllowed: string[];
}

/**
 * Configuration for prompt input field label feature
 */
export interface PromptInputFieldLabelFeatureConfig extends ChatAppFeatureConfig {
    featureId: 'promptInputFieldLabel';
    promptInputFieldLabel: string;
}

/**
 * Configuration for suggestions feature
 */
export interface SuggestionsFeatureConfig extends ChatAppFeatureConfig {
    featureId: 'suggestions';
    suggestions: string[];
    randomize?: boolean;
    maxToShow?: number;
}

/**
 * Configuration for agent instruction assistance feature
 */
export interface AgentInstructionAssistanceFeatureConfig extends ChatAppFeatureConfig {
    featureId: 'agentInstructionAssistance';
}

/**
 * All possible feature configurations
 */
export type PikaChatAppFeature = FileUploadFeatureConfig | PromptInputFieldLabelFeatureConfig | SuggestionsFeatureConfig | AgentInstructionAssistanceFeatureConfig;

/**
 * Configuration for a Pika tool
 */
export interface PikaToolConfig {
    toolId: string;
    name: string;
    displayName: string;
    description: string;
    executionType: 'lambda';
    functionSchema: FunctionDefinition[];
    supportedAgentFrameworks: ['bedrock'];
}

/**
 * Configuration for a Pika agent
 */
export interface PikaAgentConfig {
    agentId: string;
    basePrompt: string;
    tools?: PikaToolConfig[];
}

/**
 * Configuration for a Pika chat app
 */
export interface PikaChatAppConfig {
    chatAppId: string;
    modesSupported: ('standalone' | 'embedded')[];
    dontCacheThis?: boolean;
    title: string;
    description: string;
    userTypes: string[];
    agentId?: string;
    features?: Record<string, PikaChatAppFeature>;
    enabled: boolean;
}

/**
 * Configuration that can be added to a lambda function in serverless.ts
 */
export interface PikaLambdaConfig {
    pikaAgent?: PikaAgentConfig;
    pikaChatApp?: PikaChatAppConfig;
}

/**
 * Serverless service configuration with Pika extensions
 */
export interface PikaServerlessConfig {
    pikaServiceProjNameKebabCase: string;
    projNameL: string;
    projNameKebabCase: string;
    projNameTitleCase: string;
    projNameCamel: string;
    projNameHuman: string;
}

/**
 * Internal data structures that match the CDK types
 */
export interface AgentDataRequest {
    userId: string;
    agent: {
        agentId: string;
        basePrompt: string;
    };
    tools: Array<{
        toolId: string;
        name: string;
        displayName: string;
        description: string;
        executionType: 'lambda';
        lambdaArn: string;
        functionSchema: FunctionDefinition[];
        supportedAgentFrameworks: ['bedrock'];
    }>;
}
