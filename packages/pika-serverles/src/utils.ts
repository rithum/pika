import {
    AgentDataRequest,
    AgentDefinitionForIdempotentCreateOrUpdate,
    ChatAppDataRequest,
    ToolDefinitionForIdempotentCreateOrUpdate
} from 'pika-shared/types/chatbot/chatbot-types';
import { gunzipSync, gzipSync } from 'zlib';
import Serverless from 'serverless';
import AwsProvider from 'serverless/plugins/aws/provider/awsProvider';
import { AgentDefinitionWithToolRefs, PikaToolWithLambdaRef, PikaServerlessConfig } from './types';

/**
 * Compresses a string and encodes it as base64 (keeping existing implementation)
 * This matches the pattern used in your existing codebase
 */
export function gzipAndBase64EncodeString(string: string): string {
    const gzippedHexEncodedString = gzipSync(string).toString('hex');
    const gzippedBase64EncodedString = Buffer.from(gzippedHexEncodedString, 'hex').toString('base64');
    return gzippedBase64EncodedString;
}

/**
 * Alternative gzip implementation that matches CDK approach (direct compression)
 */
export function gzipAndBase64EncodeStringDirect(input: string): string {
    try {
        const compressed = gzipSync(Buffer.from(input, 'utf8'));
        return compressed.toString('base64');
    } catch (error) {
        throw new Error(`Failed to compress and encode data: ${error}`);
    }
}

/**
 * Decompresses a base64 encoded gzipped string
 */
export function gunzipBase64EncodedString(base64EncodedString: string): string {
    const gzippedHexEncodedString = Buffer.from(base64EncodedString, 'base64').toString('hex');
    const gzippedHexDecodedString = gunzipSync(Buffer.from(gzippedHexEncodedString, 'hex')).toString();
    return gzippedHexDecodedString;
}

/**
 * Generates a CloudFormation-safe resource name
 */
export function generateResourceName(baseName: string, suffix: string): string {
    // CloudFormation resource names must be alphanumeric
    const cleanBaseName = baseName.replace(/[^a-zA-Z0-9]/g, '');
    const cleanSuffix = suffix.replace(/[^a-zA-Z0-9]/g, '');
    return `${cleanBaseName}${cleanSuffix}`;
}

/**
 * Generate a unique timestamp string for CloudFormation custom resources
 * This ensures the custom resource is invoked on every deployment
 */
export function generateTimestamp(): string {
    return String(Date.now());
}

/**
 * Generate CloudFormation logical ID for Pika resources
 */
export function generateLogicalId(functionName: string, resourceType: string): string {
    // Convert kebab-case to PascalCase
    const normalizedName = functionName
        .split(/[-_\s]+/) // Split on hyphens, underscores, and spaces
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');

    return `${normalizedName}Pika${resourceType}`;
}

/**
 * Resolve custom resource ARN, handling CloudFormation intrinsic functions
 */
export function resolveCustomResourceArn(arn: string): any {
    try {
        // Try to parse as JSON for CloudFormation intrinsic functions
        const parsed = JSON.parse(arn);
        return parsed;
    } catch {
        // Return as-is if not JSON (plain string ARN)
        return arn;
    }
}

/**
 * Prepare agent data by replacing lambda ARN placeholders
 */
export function prepareAgentData(agentData: AgentDataRequest, functionName: string, lambdaLogicalId: string): AgentDataRequest {
    const processedData = JSON.parse(JSON.stringify(agentData)); // Deep clone

    if (processedData.tools) {
        processedData.tools.forEach((tool: ToolDefinitionForIdempotentCreateOrUpdate) => {
            if (tool.lambdaArn === 'WILL_BE_REPLACED_BY_CUSTOM_RESOURCE_LAMBDA_WHEN_DEPLOYED') {
                // This will be resolved by the ToolIdToLambdaArnMap
                tool.lambdaArn = 'WILL_BE_REPLACED_BY_CUSTOM_RESOURCE_LAMBDA_WHEN_DEPLOYED';
            }
        });
    }

    return processedData;
}

/**
 * Build map of tool IDs to Lambda ARNs for the custom resource
 */
export function buildToolIdToLambdaArnMap(agentData: AgentDataRequest, lambdaLogicalId: string): { [key: string]: any } {
    const map: { [key: string]: any } = {};

    if (agentData.tools) {
        agentData.tools.forEach((tool) => {
            if (tool.lambdaArn === 'WILL_BE_REPLACED_BY_CUSTOM_RESOURCE_LAMBDA_WHEN_DEPLOYED') {
                map[tool.toolId] = {
                    'Fn::GetAtt': [lambdaLogicalId, 'Arn']
                };
            }
        });
    }

    return map;
}

/**
 * Build map of tool IDs to Lambda ARNs for the custom resource (new custom.pika format)
 */
export function buildToolIdToLambdaArnMapFromCustomConfig(agentDef: AgentDefinitionWithToolRefs, serverless: Serverless): { [key: string]: any } {
    const map: { [key: string]: any } = {};

    if (agentDef.tools) {
        agentDef.tools.forEach((tool: PikaToolWithLambdaRef) => {
            const awsProvider = serverless.getProvider('aws') as AwsProvider;
            const lambdaLogicalId = awsProvider.naming.getLambdaLogicalId(tool.lambdaFunctionLogicalId);
            map[tool.toolId] = {
                'Fn::GetAtt': [lambdaLogicalId, 'Arn']
            };
        });
    }

    return map;
}

/**
 * Prepare agent data from custom.pika configuration format
 */
export function prepareAgentDataFromCustomConfig(agentDef: AgentDefinitionWithToolRefs): AgentDataRequest {
    const processedData: AgentDataRequest = {
        userId: agentDef.userId,
        agent: { ...agentDef.agent }
    };

    if (agentDef.tools) {
        processedData.tools = agentDef.tools.map((tool: PikaToolWithLambdaRef) => {
            // Convert PikaToolWithLambdaRef to ToolDefinitionForIdempotentCreateOrUpdate
            const convertedTool: ToolDefinitionForIdempotentCreateOrUpdate = {
                toolId: tool.toolId,
                name: tool.name,
                displayName: tool.displayName,
                description: tool.description,
                executionType: tool.executionType,
                lambdaArn: 'WILL_BE_REPLACED_BY_CUSTOM_RESOURCE_LAMBDA_WHEN_DEPLOYED', // Placeholder that will be resolved by ToolIdToLambdaArnMap
                functionSchema: tool.functionSchema,
                supportedAgentFrameworks: tool.supportedAgentFrameworks
            };
            return convertedTool;
        });
    }

    return processedData;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates the entire PikaServerlessConfig structure
 */
export function validatePikaConfig(pikaConfig: PikaServerlessConfig): void {
    if (!pikaConfig || typeof pikaConfig !== 'object') {
        throw new Error('Expected custom.pika to be an object but found: ' + typeof pikaConfig);
    }

    // Validate optional string properties
    if (pikaConfig.agentCustomResourceArn !== undefined) {
        if (typeof pikaConfig.agentCustomResourceArn !== 'string' || pikaConfig.agentCustomResourceArn.trim() === '') {
            throw new Error('Expected custom.pika.agentCustomResourceArn to be a non-empty string');
        }
    }

    if (pikaConfig.chatAppCustomResourceArn !== undefined) {
        if (typeof pikaConfig.chatAppCustomResourceArn !== 'string' || pikaConfig.chatAppCustomResourceArn.trim() === '') {
            throw new Error('Expected custom.pika.chatAppCustomResourceArn to be a non-empty string');
        }
    }

    // Validate agents array
    if (pikaConfig.agents !== undefined) {
        if (!Array.isArray(pikaConfig.agents)) {
            throw new Error('Expected custom.pika.agents to be an array but found: ' + typeof pikaConfig.agents);
        }

        pikaConfig.agents.forEach((agent, index) => {
            try {
                validateAgentConfig(agent);
            } catch (error) {
                throw new Error(`Error validating custom.pika.agents[${index}]: ${error}`);
            }
        });
    }

    // Validate chatApps array
    if (pikaConfig.chatApps !== undefined) {
        if (!Array.isArray(pikaConfig.chatApps)) {
            throw new Error('Expected custom.pika.chatApps to be an array but found: ' + typeof pikaConfig.chatApps);
        }

        pikaConfig.chatApps.forEach((chatApp, index) => {
            try {
                validateChatAppConfig(chatApp);
            } catch (error) {
                throw new Error(`Error validating custom.pika.chatApps[${index}]: ${error}`);
            }
        });
    }

    // Validate tools array
    if (pikaConfig.tools !== undefined) {
        if (!Array.isArray(pikaConfig.tools)) {
            throw new Error('Expected custom.pika.tools to be an array but found: ' + typeof pikaConfig.tools);
        }

        pikaConfig.tools.forEach((tool, index) => {
            try {
                validateToolConfig(tool);
            } catch (error) {
                throw new Error(`Error validating custom.pika.tools[${index}]: ${error}`);
            }
        });
    }
}

/**
 * Validates an agent configuration from the custom.pika.agents array
 */
export function validateAgentConfig(agentConfig: AgentDefinitionWithToolRefs): void {
    if (!agentConfig || typeof agentConfig !== 'object') {
        throw new Error('Expected agent configuration to be an object but found: ' + typeof agentConfig);
    }

    // Validate required agent property
    if (!agentConfig.agent) {
        throw new Error('Expected agent configuration to have an "agent" property');
    }

    if (typeof agentConfig.agent !== 'object') {
        throw new Error('Expected agent configuration "agent" property to be an object but found: ' + typeof agentConfig.agent);
    }

    validateAgentDefinition(agentConfig.agent);

    // Validate required userId property
    if (!agentConfig.userId) {
        throw new Error('Expected agent configuration to have a "userId" property');
    }

    if (typeof agentConfig.userId !== 'string' || agentConfig.userId.trim() === '') {
        throw new Error('Expected agent configuration "userId" to be a non-empty string');
    }

    // Validate optional tools array
    if (agentConfig.tools !== undefined) {
        if (!Array.isArray(agentConfig.tools)) {
            throw new Error('Expected agent configuration "tools" to be an array but found: ' + typeof agentConfig.tools);
        }

        agentConfig.tools.forEach((tool, index) => {
            try {
                validateToolConfig(tool);
            } catch (error) {
                throw new Error(`Error validating agent tools[${index}]: ${error}`);
            }
        });
    }
}

/**
 * Validates an agent definition
 */
export function validateAgentDefinition(agentDef: AgentDefinitionForIdempotentCreateOrUpdate): void {
    if (!agentDef || typeof agentDef !== 'object') {
        throw new Error('Expected agent definition to be an object but found: ' + typeof agentDef);
    }

    // Validate required agentId
    if (!agentDef.agentId) {
        throw new Error('Expected agent definition to have an "agentId" property');
    }

    if (typeof agentDef.agentId !== 'string' || agentDef.agentId.trim() === '') {
        throw new Error('Expected agent definition "agentId" to be a non-empty string');
    }

    // Validate required basePrompt
    if (!agentDef.basePrompt) {
        throw new Error('Expected agent definition to have a "basePrompt" property');
    }

    if (typeof agentDef.basePrompt !== 'string' || agentDef.basePrompt.trim() === '') {
        throw new Error('Expected agent definition "basePrompt" to be a non-empty string');
    }

    // Validate optional foundationModel
    if (agentDef.foundationModel !== undefined) {
        if (typeof agentDef.foundationModel !== 'string' || agentDef.foundationModel.trim() === '') {
            throw new Error('Expected agent definition "foundationModel" to be a non-empty string if provided');
        }
    }

    // Validate optional verificationFoundationModel
    if (agentDef.verificationFoundationModel !== undefined) {
        if (typeof agentDef.verificationFoundationModel !== 'string' || agentDef.verificationFoundationModel.trim() === '') {
            throw new Error('Expected agent definition "verificationFoundationModel" to be a non-empty string if provided');
        }
    }

    // Validate optional toolIds array
    if (agentDef.toolIds !== undefined) {
        if (!Array.isArray(agentDef.toolIds)) {
            throw new Error('Expected agent definition "toolIds" to be an array but found: ' + typeof agentDef.toolIds);
        }

        agentDef.toolIds.forEach((toolId, index) => {
            if (typeof toolId !== 'string' || toolId.trim() === '') {
                throw new Error(`Expected agent definition toolIds[${index}] to be a non-empty string`);
            }
        });
    }
}

/**
 * Validates a tool configuration
 */
export function validateToolConfig(toolConfig: PikaToolWithLambdaRef): void {
    if (!toolConfig || typeof toolConfig !== 'object') {
        throw new Error('Expected tool configuration to be an object but found: ' + typeof toolConfig);
    }

    // Validate required toolId
    if (!toolConfig.toolId) {
        throw new Error('Expected tool configuration to have a "toolId" property');
    }

    if (typeof toolConfig.toolId !== 'string' || toolConfig.toolId.trim() === '') {
        throw new Error('Expected tool configuration "toolId" to be a non-empty string');
    }

    // Validate required name
    if (!toolConfig.name) {
        throw new Error('Expected tool configuration to have a "name" property');
    }

    if (typeof toolConfig.name !== 'string' || toolConfig.name.trim() === '') {
        throw new Error('Expected tool configuration "name" to be a non-empty string');
    }

    // Validate required description
    if (!toolConfig.description) {
        throw new Error('Expected tool configuration to have a "description" property');
    }

    if (typeof toolConfig.description !== 'string' || toolConfig.description.trim() === '') {
        throw new Error('Expected tool configuration "description" to be a non-empty string');
    }

    // Validate required lambdaFunctionLogicalId
    if (!toolConfig.lambdaFunctionLogicalId) {
        throw new Error('Expected tool configuration to have a "lambdaFunctionLogicalId" property');
    }

    if (typeof toolConfig.lambdaFunctionLogicalId !== 'string' || toolConfig.lambdaFunctionLogicalId.trim() === '') {
        throw new Error('Expected tool configuration "lambdaFunctionLogicalId" to be a non-empty string');
    }

    // Validate optional displayName
    if (toolConfig.displayName !== undefined) {
        if (typeof toolConfig.displayName !== 'string' || toolConfig.displayName.trim() === '') {
            throw new Error('Expected tool configuration "displayName" to be a non-empty string if provided');
        }
    }

    // Validate optional executionType
    if (toolConfig.executionType !== undefined) {
        if (typeof toolConfig.executionType !== 'string' || toolConfig.executionType.trim() === '') {
            throw new Error('Expected tool configuration "executionType" to be a non-empty string if provided');
        }
    }

    // Validate optional functionSchema
    if (toolConfig.functionSchema !== undefined) {
        if (typeof toolConfig.functionSchema !== 'object') {
            throw new Error('Expected tool configuration "functionSchema" to be an object if provided');
        }
    }

    // Validate optional supportedAgentFrameworks
    if (toolConfig.supportedAgentFrameworks !== undefined) {
        if (!Array.isArray(toolConfig.supportedAgentFrameworks)) {
            throw new Error('Expected tool configuration "supportedAgentFrameworks" to be an array if provided');
        }

        toolConfig.supportedAgentFrameworks.forEach((framework, index) => {
            if (typeof framework !== 'string' || framework.trim() === '') {
                throw new Error(`Expected tool configuration supportedAgentFrameworks[${index}] to be a non-empty string`);
            }
        });
    }
}

/**
 * Validates a chat app configuration
 */
export function validateChatAppConfig(chatAppConfig: ChatAppDataRequest): void {
    if (!chatAppConfig || typeof chatAppConfig !== 'object') {
        throw new Error('Expected chat app configuration to be an object but found: ' + typeof chatAppConfig);
    }

    // Validate required userId
    if (!chatAppConfig.userId) {
        throw new Error('Expected chat app configuration to have a "userId" property');
    }

    if (typeof chatAppConfig.userId !== 'string' || chatAppConfig.userId.trim() === '') {
        throw new Error('Expected chat app configuration "userId" to be a non-empty string');
    }

    // Validate required chatApp
    if (!chatAppConfig.chatApp) {
        throw new Error('Expected chat app configuration to have a "chatApp" property');
    }

    if (typeof chatAppConfig.chatApp !== 'object') {
        throw new Error('Expected chat app configuration "chatApp" property to be an object but found: ' + typeof chatAppConfig.chatApp);
    }

    validateChatAppDefinition(chatAppConfig.chatApp);
}

/**
 * Validates a chat app definition
 */
function validateChatAppDefinition(chatApp: any): void {
    // Validate required chatAppId
    if (!chatApp.chatAppId) {
        throw new Error('Expected chat app definition to have a "chatAppId" property');
    }

    if (typeof chatApp.chatAppId !== 'string' || chatApp.chatAppId.trim() === '') {
        throw new Error('Expected chat app definition "chatAppId" to be a non-empty string');
    }

    // Validate required title
    if (!chatApp.title) {
        throw new Error('Expected chat app definition to have a "title" property');
    }

    if (typeof chatApp.title !== 'string' || chatApp.title.trim() === '') {
        throw new Error('Expected chat app definition "title" to be a non-empty string');
    }

    // Validate required description
    if (!chatApp.description) {
        throw new Error('Expected chat app definition to have a "description" property');
    }

    if (typeof chatApp.description !== 'string' || chatApp.description.trim() === '') {
        throw new Error('Expected chat app definition "description" to be a non-empty string');
    }

    // Validate required agentId
    if (!chatApp.agentId) {
        throw new Error('Expected chat app definition to have an "agentId" property');
    }

    if (typeof chatApp.agentId !== 'string' || chatApp.agentId.trim() === '') {
        throw new Error('Expected chat app definition "agentId" to be a non-empty string');
    }

    // Validate optional modesSupported
    if (chatApp.modesSupported !== undefined) {
        if (!Array.isArray(chatApp.modesSupported)) {
            throw new Error('Expected chat app definition "modesSupported" to be an array if provided');
        }

        chatApp.modesSupported.forEach((mode: any, index: number) => {
            if (typeof mode !== 'string' || mode.trim() === '') {
                throw new Error(`Expected chat app definition modesSupported[${index}] to be a non-empty string`);
            }
        });
    }
}
